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

    if (promotion.discountType === 'percentage') {
      discount = (originalPrice * promotion.discountValue) / 100;
      if (promotion.maxDiscountAmount && discount > promotion.maxDiscountAmount) {
        discount = promotion.maxDiscountAmount;
      }
    } else {
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
      return promotion.applicableCategories.includes(product.category);
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
    if (!product.variants || product.variants.length === 0) {
      return product;
    }

    try {
      // Obtener promociones activas que puedan aplicar al producto
      const activePromotions = await firstValueFrom(this.promotionService.getActivePromotions());

      // Enriquecer cada variante con sus promociones
      const enrichedVariants = await Promise.all(
        product.variants.map(async (variant) => {
          // Buscar si esta variante tiene una promoción específica
          const variantRef = doc(this.firestore, 'productVariants', variant.id);
          const variantSnap = await getDoc(variantRef);

          if (variantSnap.exists()) {
            const variantData = variantSnap.data();

            // Si tiene promoción aplicada, actualizar los datos
            if (variantData['promotionId']) {
              return {
                ...variant,
                promotionId: variantData['promotionId'],
                discountType: variantData['discountType'],
                discountValue: variantData['discountValue'],
                discountedPrice: variantData['discountedPrice'],
                originalPrice: variantData['originalPrice']
              };
            }
          }

          return variant;
        })
      );

      return {
        ...product,
        variants: enrichedVariants
      };
    } catch (error) {
      console.error('Error aplicando promociones:', error);
      return product;
    }
  }
}