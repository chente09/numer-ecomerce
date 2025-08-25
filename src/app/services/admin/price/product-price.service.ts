import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData,query, where, getDocs, doc, getDoc, updateDoc, deleteField } from '@angular/fire/firestore';
import { Observable, of, from, throwError, firstValueFrom } from 'rxjs';
import { map, catchError, take, tap } from 'rxjs/operators';

// Importar utilidades
import { CacheService } from '../cache/cache.service';
import { PromotionService } from '../promotion/promotion.service';

// Importar modelos
import { Product, Promotion } from '../../../models/models';

@Injectable({
  providedIn: 'root'
})
export class ProductPriceService {
  private firestore = inject(Firestore);

  private productsCollection = 'products';

  constructor(
    private cacheService: CacheService,
    private promotionService: PromotionService
  ) { }

  /**
   * Calcula precios con descuento para array de productos
   */
  calculateDiscountedPrices(products: Product[]): Observable<Product[]> {
    if (!products || products.length === 0) {
      return of([]);
    }

    // Solo calcular con los datos que ya tiene cada producto
    const processedProducts = products.map(product =>
      this.calculateDiscountedPrice(product)
    );

    return of(processedProducts);
  }

  /**
   * Calcula el precio con descuento de un producto
   */
  calculateDiscountedPrice(product: Product): Product {
    // Si ya tiene precio calculado, respetarlo
    if (product.currentPrice !== undefined && product.discountPercentage !== undefined) {
      return product;
    }

    // Si tiene precio original mayor al precio actual
    if (product.originalPrice && product.originalPrice > product.price) {
      const discountPercentage = Math.round(
        ((product.originalPrice - product.price) / product.originalPrice) * 100
      );

      return {
        ...product,
        currentPrice: product.price,
        discountPercentage
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
      originalPrice: product.price,
      discountPercentage: 0
    };
  }


  /**
   * Calcula el precio de un producto con una promoción específica
   * Para preview de promociones
   */
  calculatePriceWithPromotion(product: Product, promotion: Promotion): {
    currentPrice: number;
    discountPercentage: number;
    savings: number;
  } {
    const originalPrice = product.price;
    let discount = 0;

    // ✅ SOLUCIÓN: Se añade un caso explícito para 'shipping'.
    // Si la promoción es de envío, el descuento al precio del producto es 0.
    if (promotion.discountType === 'shipping') {
        discount = 0;
    } else if (promotion.discountType === 'percentage') {
      discount = (originalPrice * promotion.discountValue) / 100;
      if (promotion.maxDiscountAmount && discount > promotion.maxDiscountAmount) {
        discount = promotion.maxDiscountAmount;
      }
    } else { // 'fixed'
      discount = promotion.discountValue;
    }

    const currentPrice = Math.max(0, originalPrice - discount);
    const discountPercentage = originalPrice > 0 ? (discount / originalPrice) * 100 : 0;

    return {
      currentPrice,
      discountPercentage: Math.round(discountPercentage),
      savings: discount
    };
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

    // Verificar si aplica al producto
    if (promotion.applicableProductIds && promotion.applicableProductIds.length > 0) {
      return promotion.applicableProductIds.includes(product.id);
    }

    // Verificar si aplica a la categoría
    if (promotion.applicableCategories && promotion.applicableCategories.length > 0) {
      // ✅ GUARDIA: Asegurarse de que product.categories sea un array antes de usarlo.
      // Si product.categories es undefined o null, se usará un array vacío [].
      const productCategories = product.categories || [];
      // Se usa `some` para ver si ALGUNA de las categorías del producto está en las de la promo.
      return productCategories.some(catId => promotion.applicableCategories!.includes(catId));
    }

    return true; // Si no tiene restricciones, aplica a todos
  }

  /**
   * Obtiene una promoción por su ID
   */
  getPromotionById(promotionId: string): Observable<Promotion | null> {
    if (!promotionId) {
      return of(null);
    }

    const cacheKey = `promotion_${promotionId}`;

    return this.cacheService.getCached<Promotion | null>(cacheKey, () => {
      return from((async () => {
        try {
          const promotionDoc = doc(this.firestore, promotionId);
          const promotionSnap = await getDoc(promotionDoc);

          if (promotionSnap.exists()) {
            const data = promotionSnap.data();
            return {
              id: promotionSnap.id,
              ...data,
              startDate: this.convertTimestampToDate(data['startDate']),
              endDate: this.convertTimestampToDate(data['endDate'])
            } as Promotion;
          }

          return null;
        } catch (error) {
          console.error(`Error obteniendo promoción ${promotionId}:`, error);
          throw error;
        }
      })()).pipe(
        catchError(() => of(null))
      );
    });
  }

  /**
   * Actualiza los precios calculados de un producto
   */
  updateProductPricing(
    productId: string,
    pricing: {
      currentPrice: number;
      discountPercentage: number;
      originalPrice?: number;
    }
  ): Observable<void> {
    const productRef = doc(this.firestore, this.productsCollection, productId);

    return from(updateDoc(productRef, {
      ...pricing,
      updatedAt: new Date()
    })).pipe(
      tap(() => {
        // Invalidar caché del producto
        this.cacheService.invalidate(`products_${productId}`);
      }),
      catchError(error => {
        console.error('Error actualizando precios:', error);
        throw error;
      })
    );
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
        const priceCalc = this.calculatePriceWithPromotion(
          { price: originalPrice } as Product,
          promotion
        );

        // Actualizar la variante
        await updateDoc(variantRef, {
          promotionId: promotion.id,
          discountType: promotion.discountType,
          discountValue: promotion.discountValue,
          discountedPrice: priceCalc.currentPrice,
          originalPrice: originalPrice,
          updatedAt: new Date()
        });
        this.cacheService.invalidate(`products_${productId}`);

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
          originalPrice: deleteField(),
          updatedAt: new Date()
        });

        this.cacheService.invalidate(`products_${productId}`);

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


  async addPromotionsToProduct(product: Product): Promise<Product> {
    // ✅ GUARDIA INICIAL: Si el producto no tiene variantes, no hay nada que hacer.
    if (!product || !product.variants || product.variants.length === 0) {
      return product;
    }

    try {
      const activePromotions = await firstValueFrom(this.promotionService.getActivePromotions());

      // Si no hay promociones activas, devolvemos el producto tal cual.
      if (activePromotions.length === 0) {
        return product;
      }
      
      const enrichedVariants = await Promise.all(
        product.variants.map(async (variant) => {
          
          // Lógica para encontrar la mejor promoción para ESTA variante/producto
          const applicablePromotions = activePromotions.filter(promo => {
              
              // ✅ GUARDIA DEFENSIVA #1: Asegurarse de que los arrays de la promoción existan.
              const applicableCats = promo.applicableCategories || [];
              const applicableProds = promo.applicableProductIds || [];
              
              // ✅ GUARDIA DEFENSIVA #2: Asegurarse de que el array de categorías del producto exista.
              const productCats = product.categories || [];

              // Condiciones de aplicabilidad
              const appliesToAll = applicableCats.length === 0 && applicableProds.length === 0;
              const appliesToProduct = applicableProds.includes(product.id);
              // Usamos .some() para ver si alguna categoría del producto coincide.
              const appliesToCategory = productCats.some(pCat => applicableCats.includes(pCat));

              return appliesToAll || appliesToProduct || appliesToCategory;
          });

          if (applicablePromotions.length > 0) {
            // Si hay varias, encontrar la mejor (la que ofrece mayor descuento)
            const bestPromotion = applicablePromotions.sort((a, b) => 
                this.calculatePriceWithPromotion(product, b).savings - this.calculatePriceWithPromotion(product, a).savings
            )[0];

            // Calcular el precio con la mejor promoción
            const priceCalc = this.calculatePriceWithPromotion(product, bestPromotion);

            return {
              ...variant,
              promotionId: bestPromotion.id,
              discountType: bestPromotion.discountType,
              discountValue: bestPromotion.discountValue,
              discountedPrice: priceCalc.currentPrice,
              originalPrice: variant.price || product.price
            };
          }
          
          // Si no hay promoción aplicable, devolver la variante sin cambios.
          return variant;
        })
      );

      return {
        ...product,
        variants: enrichedVariants
      };

    } catch (error) {
      // ✅ Captura de error mejorada para dar más contexto.
      console.error(`Error aplicando promociones al producto ${product.name} (ID: ${product.id}):`, error);
      // Devolver el producto original si falla el proceso para no detener el flujo.
      return product; 
    }
  }
}