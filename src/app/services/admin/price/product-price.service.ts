import { Injectable } from '@angular/core';
import {
  Firestore, collection, collectionData,
  query, where, getDocs, doc, getDoc,
  updateDoc,
  deleteField
} from '@angular/fire/firestore';
import { Observable, of, from, forkJoin, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';

// Importar utilidades
import { ErrorUtil } from '../../../utils/error-util';
import { TimestampUtil } from '../../../utils/timestamp-util';
import { CacheService } from '../cache/cache.service';

// Importar modelos
import { Product } from '../../../models/models';
import { Promotion } from '../../../models/models';

@Injectable({
  providedIn: 'root'
})
export class ProductPriceService {
  private promotionsCollection = 'promotions';
  private productsCollection = 'products';

  // Claves de caché
  private readonly activePromotionsCacheKey = 'active_promotions';
  private readonly productPromotionsCacheKey = 'product_promotions';
  private readonly discountedPricesCacheKey = 'discounted_prices';

  constructor(
    private firestore: Firestore,
    private cacheService: CacheService
  ) { }

  /**
   * Calcula precios con descuento para array de productos
   */
  calculateDiscountedPrices(products: Product[]): Observable<Product[]> {
    if (!products || products.length === 0) {
      return of([]);
    }

    return this.getActivePromotions().pipe(
      map(promotions => {
        return products.map(product => {
          // Obtener promociones aplicables para este producto
          const applicablePromotions = this.filterApplicablePromotions(product, promotions);
          return this.calculateDiscountedPrice({
            ...product,
            promotions: applicablePromotions
          });
        });
      }),
      catchError(error => ErrorUtil.handleError(error, 'calculateDiscountedPrices'))
    );
  }

  /**
   * Método asíncrono para calcular el precio con descuento de un solo producto
   * Útil para cuando se necesita procesar un único producto
   */
  calculateDiscountedPriceAsync(productId: string): Observable<Product> {
    return from(this.getProductById(productId)).pipe(
      switchMap(product => {
        if (!product) {
          return throwError(() => new Error(`No se encontró el producto con ID ${productId}`));
        }

        return this.getActivePromotions().pipe(
          map(promotions => {
            const applicablePromotions = this.filterApplicablePromotions(product, promotions);
            return this.calculateDiscountedPrice({
              ...product,
              promotions: applicablePromotions
            });
          })
        );
      }),
      catchError(error => ErrorUtil.handleError(error, `calculateDiscountedPriceAsync(${productId})`))
    );
  }

  /**
   * Obtiene un producto por su ID (método auxiliar)
   */
  private getProductById(productId: string): Promise<Product | null> {
    try {
      const productDoc = doc(this.firestore, this.productsCollection, productId);
      return getDoc(productDoc).then(snapshot => {
        if (snapshot.exists()) {
          return { id: snapshot.id, ...snapshot.data() } as Product;
        }
        return null;
      });
    } catch (error) {
      console.error(`Error al obtener producto ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Aplica promociones a una lista de productos de forma eficiente
   * Útil para aplicar promociones a los productos mostrados en la tabla
   */
  applyPromotionsToProducts(products: Product[]): Observable<Product[]> {
    if (!products || products.length === 0) {
      return of([]);
    }

    const cacheKey = `${this.discountedPricesCacheKey}_batch_${products.map(p => p.id).join('_')}`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {
      return this.getActivePromotions().pipe(
        map(promotions => {
          // Procesar todos los productos en un solo paso
          return products.map(product => {
            const applicablePromotions = this.filterApplicablePromotions(product, promotions);
            return this.calculateDiscountedPrice({
              ...product,
              promotions: applicablePromotions
            });
          });
        }),
        catchError(error => ErrorUtil.handleError(error, 'applyPromotionsToProducts'))
      );
    });
  }

  /**
   * Obtiene promociones específicas para un producto por su ID
   */
  getPromotionsForProduct(productId: string): Observable<Promotion[]> {
    if (!productId) {
      return of([]);
    }

    const cacheKey = `${this.productPromotionsCacheKey}_${productId}`;

    return this.cacheService.getCached<Promotion[]>(cacheKey, () => {
      return from(this.getProductById(productId)).pipe(
        switchMap(product => {
          if (!product) {
            return of([]);
          }

          return this.getActivePromotions().pipe(
            map(promotions => this.filterApplicablePromotions(product, promotions))
          );
        }),
        catchError(error => ErrorUtil.handleError(error, `getPromotionsForProduct(${productId})`))
      );
    });
  }

  /**
   * Calcula precio con descuento para un producto
   */
  calculateDiscountedPrice(product: Product): Product {
    // Si ya tiene un precio con descuento configurado manualmente, respetarlo
    if (product.currentPrice !== undefined && product.discountPercentage !== undefined) {
      return product;
    }

    // Verificar si hay promociones activas
    if (product.promotions && product.promotions.length > 0) {
      const now = new Date();

      // Encontrar la promoción con mayor descuento aplicable
      let bestDiscount = 0;
      let bestDiscountAmount = 0;
      let bestPromotion: Promotion | null = null;

      for (const promo of product.promotions) {
        // Convertir fechas si es necesario
        const startDate = TimestampUtil.toDate(promo.startDate);
        const endDate = TimestampUtil.toDate(promo.endDate);

        if (promo.isActive && startDate <= now && endDate >= now) {
          let discountAmount = 0;

          if (promo.discountType === 'percentage') {
            discountAmount = (product.price * promo.discountValue) / 100;
            // Aplicar límite si existe
            if (promo.maxDiscountAmount && discountAmount > promo.maxDiscountAmount) {
              discountAmount = promo.maxDiscountAmount;
            }
          } else { // fixed
            discountAmount = promo.discountValue;
          }

          // Actualizar si encontramos un mejor descuento
          if (discountAmount > bestDiscountAmount) {
            bestDiscountAmount = discountAmount;
            bestDiscount = promo.discountType === 'percentage' ? promo.discountValue :
              Math.round((discountAmount / product.price) * 100);
            bestPromotion = promo;
          }
        }
      }

      // Aplicar el mejor descuento encontrado
      if (bestDiscountAmount > 0 && bestPromotion) {
        const discountedPrice = Math.max(0, product.price - bestDiscountAmount);
        return {
          ...product,
          originalPrice: product.price,
          currentPrice: discountedPrice,
          discountPercentage: bestDiscount,
          activePromotion: bestPromotion.id // Guardar referencia a la promoción activa
        };
      }
    }

    // Si no hay promociones o no son aplicables
    if (product.originalPrice && product.price < product.originalPrice) {
      // Calcular el porcentaje de descuento si hay precio original
      const discountPercentage = Math.round(
        ((product.originalPrice - product.price) / product.originalPrice) * 100
      );
      return {
        ...product,
        currentPrice: product.price,
        discountPercentage: discountPercentage
      };
    }

    // Sin descuento
    return {
      ...product,
      currentPrice: product.price,
      discountPercentage: 0
    };
  }

  /**
   * Obtener todas las promociones activas
   * Esta implementación optimizada primero filtra por isActive y luego
   * procesa las fechas en el cliente para evitar problemas con Firestore
   */
  getActivePromotions(): Observable<Promotion[]> {
    const cacheKey = `${this.activePromotionsCacheKey}`;

    return this.cacheService.getCached<Promotion[]>(cacheKey, () => {
      const now = new Date();
      const promotionsRef = collection(this.firestore, this.promotionsCollection);

      // Solo filtrar por isActive en la consulta - esto es más eficiente en Firestore
      const q = query(
        promotionsRef,
        where('isActive', '==', true)
      );

      return collectionData(q, { idField: 'id' }).pipe(
        map(promotions => {
          // Filtrar por fecha en el cliente (post-procesamiento)
          return (promotions as any[])
            .filter(promo => {
              const endDate = TimestampUtil.toDate(promo.endDate);
              return endDate > now;
            })
            .map(promo => ({
              ...promo,
              startDate: TimestampUtil.toDate(promo.startDate),
              endDate: TimestampUtil.toDate(promo.endDate)
            })) as Promotion[];
        }),
        catchError(error => ErrorUtil.handleError(error, 'getActivePromotions'))
      );
    });
  }

  /**
   * Añade promociones aplicables a un producto
   */
  addPromotionsToProduct(product: Product): Observable<Product> {
    if (!product) {
      // Retornar un producto vacío para mantener la consistencia de tipos
      // en lugar de retornar null directamente
      return of({} as Product);
    }

    return this.getActivePromotions().pipe(
      map(promotions => {
        const applicablePromotions = this.filterApplicablePromotions(product, promotions);
        return {
          ...product,
          promotions: applicablePromotions
        };
      }),
      catchError(error => {
        console.error('Error al añadir promociones al producto:', error);
        return of(product); // Devolver producto sin cambios en caso de error
      })
    );
  }

  /**
   * Verifica si una promoción es aplicable a un producto
   */
  isPromotionApplicable(product: Product, promotion: Promotion): boolean {
    if (!product || !promotion) {
      return false;
    }

    // Verificar si la promoción está activa
    const now = new Date();
    const startDate = TimestampUtil.toDate(promotion.startDate);
    const endDate = TimestampUtil.toDate(promotion.endDate);

    if (!promotion.isActive || startDate > now || endDate < now) {
      return false;
    }

    // Verificar si la promoción aplica a este producto específico
    if (promotion.applicableProductIds && promotion.applicableProductIds.length > 0) {
      return promotion.applicableProductIds.includes(product.id);
    }

    // Verificar si la promoción aplica a la categoría del producto
    if (promotion.applicableCategories && promotion.applicableCategories.length > 0) {
      return promotion.applicableCategories.includes(product.category);
    }

    // Si no hay restricciones específicas, la promoción aplica a todos los productos
    return true;
  }

  /**
   * Aplica una promoción específica a un producto
   * Útil para cuando se quiere aplicar manualmente una promoción desde la interfaz
   */
  applyPromotionToProduct(product: Product, promotionId: string): Observable<Product> {
    if (!product || !promotionId) {
      return of(product);
    }

    return this.getPromotionById(promotionId).pipe(
      map(promotion => {
        if (!promotion || !this.isPromotionApplicable(product, promotion)) {
          return product;
        }

        // Aplicar la promoción
        const updatedProduct = {
          ...product,
          promotions: [promotion]
        };

        return this.calculateDiscountedPrice(updatedProduct);
      }),
      catchError(error => {
        console.error(`Error al aplicar promoción ${promotionId} al producto:`, error);
        return of(product);
      })
    );
  }

  /**
   * Obtiene una promoción por su ID
   */
  private getPromotionById(promotionId: string): Observable<Promotion | null> {
    if (!promotionId) {
      return of(null);
    }

    const cacheKey = `promotion_${promotionId}`;

    return this.cacheService.getCached<Promotion | null>(cacheKey, () => {
      return from((async () => {
        try {
          const promotionDoc = doc(this.firestore, this.promotionsCollection, promotionId);
          const promotionSnap = await getDoc(promotionDoc);

          if (promotionSnap.exists()) {
            const data = promotionSnap.data();
            return {
              id: promotionSnap.id,
              ...data,
              startDate: TimestampUtil.toDate(data['startDate']),
              endDate: TimestampUtil.toDate(data['endDate'])
            } as Promotion;
          }
          return null;
        } catch (error) {
          throw error;
        }
      })()).pipe(
        catchError(error => ErrorUtil.handleError(error, `getPromotionById(${promotionId})`))
      );
    });
  }

  /**
   * Verifica si un producto tiene una promoción activa
   */
  hasActivePromotion(product: Product): boolean {
    return !!product.activePromotion ||
      (product.discountPercentage !== undefined && product.discountPercentage > 0);
  }

  /**
   * Filtra las promociones aplicables a un producto
   */
  private filterApplicablePromotions(product: Product, allPromotions: Promotion[]): Promotion[] {
    if (!product || !allPromotions || allPromotions.length === 0) {
      return [];
    }
    return allPromotions.filter(promo => this.isPromotionApplicable(product, promo));
  }

  /**
   * Invalida el caché de promociones
   * Útil cuando se agregan o modifican promociones
   */
  invalidatePromotionsCache(): void {
    this.cacheService.invalidate(this.activePromotionsCacheKey);
    // También podríamos invalidar caches relacionados con productos específicos
    // pero se necesitaría implementar un sistema más robusto
  }

  applyPromotionToVariant(
    productId: string,
    variantId: string,
    promotion: Promotion
  ): Observable<void> {
    return from((async () => {
      try {
        // Obtener la variante
        const variantRef = doc(this.firestore, 'productVariants', variantId);
        const variantSnap = await getDoc(variantRef);

        if (!variantSnap.exists()) {
          throw new Error('La variante no existe');
        }

        const variantData = variantSnap.data();
        // Usamos notación de corchetes para acceder a price
        const originalPrice = variantData['price'] || 0;

        // Calcular precio con descuento
        let discountedPrice = originalPrice;
        if (promotion.discountType === 'percentage') {
          discountedPrice = originalPrice * (1 - (promotion.discountValue / 100));
        } else { // fixed
          discountedPrice = Math.max(0, originalPrice - promotion.discountValue);
        }

        // Actualizar la variante
        await updateDoc(variantRef, {
          promotionId: promotion.id,
          discountType: promotion.discountType,
          discountValue: promotion.discountValue,
          discountedPrice: discountedPrice,
          updatedAt: new Date()
        });

        // Actualizar el producto principal
        const productRef = doc(this.firestore, 'products', productId);
        await updateDoc(productRef, {
          hasPromotions: true,
          updatedAt: new Date()
        });

        // Invalidar caché si es necesario
        if (this.cacheService) {
          this.cacheService.invalidate(`products_${productId}`);
          this.cacheService.invalidate('products');
        }

        return;
      } catch (error) {
        console.error('Error al aplicar promoción a variante:', error);
        throw error;
      }
    })());
  }

  // En ProductPriceService.ts

/**
 * Elimina una promoción aplicada a una variante
 */
removePromotionFromVariant(
  productId: string,
  variantId: string
): Observable<void> {
  return from((async () => {
    try {
      // 1. Obtener la variante
      const variantRef = doc(this.firestore, 'productVariants', variantId);
      const variantSnap = await getDoc(variantRef);
      
      if (!variantSnap.exists()) {
        throw new Error('La variante no existe');
      }
      
      // 2. Eliminar campos relacionados con promociones
      await updateDoc(variantRef, {
        promotionId: deleteField(), // Firestore deleteField()
        discountType: deleteField(),
        discountValue: deleteField(),
        discountedPrice: deleteField(),
        updatedAt: new Date()
      });
      
      // 3. Verificar si hay otras variantes con promociones
      // para el mismo producto
      const productVariantsRef = collection(this.firestore, 'productVariants');
      const q = query(
        productVariantsRef, 
        where('productId', '==', productId),
        where('promotionId', '!=', null)
      );
      
      const otherPromotionsSnap = await getDocs(q);
      const hasOtherPromotions = otherPromotionsSnap.size > 0;
      
      // 4. Actualizar el producto principal si no hay más variantes con promociones
      if (!hasOtherPromotions) {
        const productRef = doc(this.firestore, 'products', productId);
        await updateDoc(productRef, {
          hasPromotions: false,
          updatedAt: new Date()
        });
      }
      
      // 5. Invalidar caché
      if (this.cacheService) {
        this.cacheService.invalidate(`products_${productId}`);
        this.cacheService.invalidate('products');
      }
      
      return;
    } catch (error) {
      console.error('Error al eliminar promoción de variante:', error);
      throw error;
    }
  })());
}
}