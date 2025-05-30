import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData,
  query, where, getDocs, doc, getDoc,
  updateDoc, deleteField
} from '@angular/fire/firestore';
import { Observable, of, from, forkJoin, throwError } from 'rxjs';
import { map, catchError, switchMap, shareReplay, take, finalize } from 'rxjs/operators';

// Importar utilidades
import { ErrorUtil } from '../../../utils/error-util';
import { CacheService } from '../cache/cache.service';

// Importar modelos
import { Product, Promotion } from '../../../models/models';

@Injectable({
  providedIn: 'root'
})
export class ProductPriceService {
  // 🔧 SOLUCIÓN: Usar inject() en lugar de constructor injection para Firestore
  private firestore = inject(Firestore);
  
  private promotionsCollection = 'promotions';
  private productsCollection = 'products';

  // Claves de caché
  private readonly activePromotionsCacheKey = 'active_promotions';
  private readonly productPromotionsCacheKey = 'product_promotions';
  private readonly discountedPricesCacheKey = 'discounted_prices';

  constructor(private cacheService: CacheService) {
  }

  /**
   * 🚀 CORREGIDO: Calcula precios con descuento para array de productos
   */
  calculateDiscountedPrices(products: Product[]): Observable<Product[]> {
    if (!products || products.length === 0) {
      return of([]);
    }

    return this.getActivePromotions().pipe(
      take(1), // ✅ NUEVO: Forzar completar
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
      catchError(error => {
        console.error('❌ Error al calcular precios con descuento:', error);
        // Fallback: calcular precios simples sin promociones
        return of(products.map(product => this.calculateDiscountedPriceSimple(product)));
      })
    );
  }

  /**
   * 🆕 MÉTODO SIMPLE: Para casos donde no necesitas promociones externas
   */
  calculateDiscountedPricesSimple(products: Product[]): Observable<Product[]> {
    if (!products || products.length === 0) {
      return of([]);
    }

    const processedProducts = products.map(product => this.calculateDiscountedPriceSimple(product));
    return of(processedProducts);
  }

  /**
   * 🆕 MÉTODO AUXILIAR: Cálculo simple sin promociones externas
   */
  private calculateDiscountedPriceSimple(product: Product): Product {
    // Si ya tiene currentPrice, usarlo
    if (product.currentPrice !== undefined) {
      return {
        ...product,
        discountPercentage: product.discountPercentage || 0
      };
    }

    // Si tiene originalPrice, calcular descuento
    if (product.originalPrice && product.originalPrice > product.price) {
      const discountPercentage = Math.round(
        ((product.originalPrice - product.price) / product.originalPrice) * 100
      );
      
      return {
        ...product,
        currentPrice: product.price,
        discountPercentage: discountPercentage
      };
    }

    // Si tiene discountPercentage configurado
    if (product.discountPercentage && product.discountPercentage > 0) {
      const discountedPrice = product.price * (1 - (product.discountPercentage / 100));
      
      return {
        ...product,
        originalPrice: product.price,
        currentPrice: discountedPrice
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
   * 🚀 CORREGIDO: Método asíncrono para calcular el precio con descuento de un solo producto
   */
  calculateDiscountedPriceAsync(productId: string): Observable<Product> {
    return from(this.getProductById(productId)).pipe(
      switchMap(product => {
        if (!product) {
          return throwError(() => new Error(`No se encontró el producto con ID ${productId}`));
        }

        return this.getActivePromotions().pipe(
          take(1), // ✅ NUEVO: Forzar completar
          map(promotions => {
            const applicablePromotions = this.filterApplicablePromotions(product, promotions);
            return this.calculateDiscountedPrice({
              ...product,
              promotions: applicablePromotions
            });
          })
        );
      }),
      catchError(error => {
        console.error(`❌ Error al calcular precio para producto ${productId}:`, error);
        return from(this.getProductById(productId)).pipe(
          map(product => product ? this.calculateDiscountedPriceSimple(product) : {} as Product)
        );
      })
    );
  }

  /**
   * Obtiene un producto por su ID
   */
  private async getProductById(productId: string): Promise<Product | null> {
    try {
      const productDoc = doc(this.firestore, this.productsCollection, productId);
      const productSnap = await getDoc(productDoc);

      if (productSnap.exists()) {
        const product = { id: productSnap.id, ...productSnap.data() } as Product;
        return product;
      }
      
      return null;
    } catch (error) {
      console.error(`Error al obtener producto ${productId}:`, error);
      throw error;
    }
  }

  /**
   * 🚀 CORREGIDO: Aplica promociones a una lista de productos de forma eficiente
   */
  applyPromotionsToProducts(products: Product[]): Observable<Product[]> {
    if (!products || products.length === 0) {
      return of([]);
    }

    const cacheKey = `${this.discountedPricesCacheKey}_batch_${products.length}`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {
      return this.getActivePromotions().pipe(
        take(1), // ✅ NUEVO: Forzar completar
        map(promotions => {
          return products.map(product => {
            const applicablePromotions = this.filterApplicablePromotions(product, promotions);
            return this.calculateDiscountedPrice({
              ...product,
              promotions: applicablePromotions
            });
          });
        }),
        catchError(error => {
          return of(products.map(product => this.calculateDiscountedPriceSimple(product)));
        })
      );
    });
  }

  /**
   * 🚀 CORREGIDO: Obtiene promociones específicas para un producto por su ID
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
            take(1), // ✅ NUEVO: Forzar completar
            map(promotions => this.filterApplicablePromotions(product, promotions))
          );
        }),
        catchError(error => {
          console.error(`❌ Error al obtener promociones para producto ${productId}:`, error);
          return of([]);
        })
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
        const startDate = this.convertTimestampToDate(promo.startDate);
        const endDate = this.convertTimestampToDate(promo.endDate);

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
          activePromotion: bestPromotion.id
        };
      }
    }

    // Usar el método simple para casos sin promociones
    return this.calculateDiscountedPriceSimple(product);
  }

  /**
   * 🚀 CORREGIDO: Obtener todas las promociones activas usando factory function
   */
  getActivePromotions(): Observable<Promotion[]> {
    return this.cacheService.getCached<Promotion[]>(this.activePromotionsCacheKey, () => {
      // 🎯 SOLUCIÓN: Crear el observable dentro de la factory function
      return this.createActivePromotionsObservable();
    });
  }

  /**
   * 🚀 CORREGIDO: Crea el observable de promociones activas
   */
  private createActivePromotionsObservable(): Observable<Promotion[]> {
    
    try {
      const now = new Date();
      const promotionsRef = collection(this.firestore, this.promotionsCollection);
      const q = query(promotionsRef, where('isActive', '==', true));

      return collectionData(q, { idField: 'id' }).pipe(
        take(1), // ✅ CRÍTICO: Forzar que se complete después del primer emit
        map(promotions => {
          
          // Filtrar por fecha en el cliente
          const activePromotions = (promotions as any[])
            .filter(promo => {
              const endDate = this.convertTimestampToDate(promo.endDate);
              const isActive = endDate > now;
              return isActive;
            })
            .map(promo => ({
              ...promo,
              startDate: this.convertTimestampToDate(promo.startDate),
              endDate: this.convertTimestampToDate(promo.endDate)
            })) as Promotion[];

          return activePromotions;
        }),
        catchError(error => {
          console.error('❌ Error en createActivePromotionsObservable:', error);
          return of([]);
        })
      );
    } catch (error) {
      console.error('💥 Error crítico al crear observable de promociones:', error);
      return of([]);
    }
  }

  /**
   * 🚀 CORREGIDO: Añade promociones aplicables a un producto
   */
  addPromotionsToProduct(product: Product): Observable<Product> {
    if (!product) {
      return of({} as Product);
    }

    return this.getActivePromotions().pipe(
      take(1), // ✅ NUEVO: Forzar completar
      map(promotions => {
        const applicablePromotions = this.filterApplicablePromotions(product, promotions);
        return {
          ...product,
          promotions: applicablePromotions
        };
      }),
      catchError(error => {
        console.error('Error al añadir promociones al producto:', error);
        return of(product);
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

    const now = new Date();
    const startDate = this.convertTimestampToDate(promotion.startDate);
    const endDate = this.convertTimestampToDate(promotion.endDate);

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

    return true;
  }

  /**
   * 🚀 CORREGIDO: Aplica una promoción específica a un producto
   */
  applyPromotionToProduct(product: Product, promotionId: string): Observable<Product> {
    if (!product || !promotionId) {
      return of(product);
    }

    return this.getPromotionById(promotionId).pipe(
      take(1), // ✅ NUEVO: Forzar completar
      map(promotion => {
        if (!promotion || !this.isPromotionApplicable(product, promotion)) {
          console.log(`❌ Promoción ${promotionId} no aplicable a ${product.name}`);
          return product;
        }

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
   * 🚀 CORREGIDO: Obtiene una promoción por su ID
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
            const promotion = {
              id: promotionSnap.id,
              ...data,
              startDate: this.convertTimestampToDate(data['startDate']),
              endDate: this.convertTimestampToDate(data['endDate'])
            } as Promotion;
            
            return promotion;
          }
          
          return null;
        } catch (error) {
          console.error(`❌ Error obteniendo promoción ${promotionId}:`, error);
          throw error;
        }
      })()).pipe(
        catchError(error => {
          console.error(`Error en getPromotionById(${promotionId}):`, error);
          return of(null);
        })
      );
    });
  }

  /**
   * Verifica si un producto tiene una promoción activa
   */
  hasActivePromotion(product: Product): boolean {
    const hasPromotion = !!product.activePromotion ||
      (product.discountPercentage !== undefined && product.discountPercentage > 0);
    
    return hasPromotion;
  }

  /**
   * Filtra las promociones aplicables a un producto
   */
  private filterApplicablePromotions(product: Product, allPromotions: Promotion[]): Promotion[] {
    if (!product || !allPromotions || allPromotions.length === 0) {
      return [];
    }
    
    const applicable = allPromotions.filter(promo => this.isPromotionApplicable(product, promo));
    
    
    return applicable;
  }

  /**
   * Invalida el caché de promociones
   */
  invalidatePromotionsCache(): void {
    this.cacheService.invalidate(this.activePromotionsCacheKey);
    this.cacheService.invalidatePattern(this.productPromotionsCacheKey);
  }

  /**
   * Aplica promoción a variante
   */
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

        // Invalidar caché
        this.invalidatePromotionsCache();

        return;
      } catch (error) {
        console.error('Error al aplicar promoción a variante:', error);
        throw error;
      }
    })());
  }

  /**
   * Elimina una promoción aplicada a una variante
   */
  removePromotionFromVariant(
    productId: string,
    variantId: string
  ): Observable<void> {
    return from((async () => {
      try {        
        const variantRef = doc(this.firestore, 'productVariants', variantId);
        const variantSnap = await getDoc(variantRef);
        
        if (!variantSnap.exists()) {
          throw new Error('La variante no existe');
        }
        
        // Eliminar campos relacionados con promociones
        await updateDoc(variantRef, {
          promotionId: deleteField(),
          discountType: deleteField(),
          discountValue: deleteField(),
          discountedPrice: deleteField(),
          updatedAt: new Date()
        });
        
        // Verificar si hay otras variantes con promociones
        const productVariantsRef = collection(this.firestore, 'productVariants');
        const q = query(
          productVariantsRef, 
          where('productId', '==', productId),
          where('promotionId', '!=', null)
        );
        
        const otherPromotionsSnap = await getDocs(q);
        const hasOtherPromotions = otherPromotionsSnap.size > 0;
        // Actualizar el producto principal si no hay más variantes con promociones
        if (!hasOtherPromotions) {
          const productRef = doc(this.firestore, 'products', productId);
          await updateDoc(productRef, {
            hasPromotions: false,
            updatedAt: new Date()
          });
        }
        
        // Invalidar caché
        this.invalidatePromotionsCache();
        
        return;
      } catch (error) {
        console.error('Error al eliminar promoción de variante:', error);
        throw error;
      }
    })());
  }

  /**
   * Convierte un timestamp de Firestore a Date
   */
  private convertTimestampToDate(timestamp: any): Date {
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      return new Date(timestamp);
    }
    return new Date();
  }

  /**
   * 🆕 NUEVO: Método de debugging para ver promociones
   */
  debugPromotions(): void {
    
    this.getActivePromotions().pipe(
      take(1)
    ).subscribe({
      next: (promotions) => {
        
        if (promotions.length > 0) {
          console.table(promotions.map(promo => ({
            id: promo.id,
            name: promo.name,
            discountType: promo.discountType,
            discountValue: promo.discountValue,
            startDate: promo.startDate.toLocaleDateString(),
            endDate: promo.endDate.toLocaleDateString(),
            isActive: promo.isActive ? '✅' : '❌'
          })));
        } else {
          console.log('🤷‍♂️ No hay promociones activas');
        }
      },
      error: (error) => {
        console.error('❌ Error obteniendo promociones:', error);
      }
    });
    
    console.groupEnd();
  }
}