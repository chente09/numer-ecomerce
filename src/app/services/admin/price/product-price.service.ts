import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, query, where, getDocs, doc, getDoc, updateDoc, deleteField } from '@angular/fire/firestore';
import { Observable, of, from, throwError, firstValueFrom } from 'rxjs';
import { map, catchError, take, tap } from 'rxjs/operators';

// Importar utilidades
import { CacheService } from '../cache/cache.service';

// Importar modelos
import { Product, Promotion } from '../../../models/models';
import { resolveEffectivePrice } from '../../../core/pricing';

@Injectable({
  providedIn: 'root'
})
export class ProductPriceService {
  private firestore = inject(Firestore);

  private productsCollection = 'products';

  constructor(
    private cacheService: CacheService
  ) { }

  /**
   * Calcula precios con descuento para array de productos
   */
  calculateDiscountedPrices(products: Product[]): Observable<Product[]> {
    if (!products || products.length === 0) {
      return of([]);
    }
    const processedProducts = products.map(product => this.calculateDiscountedPrice(product));
    return of(processedProducts);
  }

  /**
   * Calcula el precio con descuento de un producto
   */
  calculateDiscountedPrice(product: Product): Product {
    const price = resolveEffectivePrice(product);
    return {
      ...product,
      currentPrice: price.unitPrice,
      originalPrice: price.originalUnitPrice,
      discountPercentage: price.discountPercentage
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
   * Throws a user-facing error when a promotion must not be applied: inactive, already ended,
   * or when the resulting price would be zero (a 100 % / oversized fixed discount).
   */
  assertPromotionApplicable(promotion: Promotion, resultingPrice: number): void {
    if (promotion.isActive === false) {
      throw new Error('La promoción está desactivada. Actívala antes de aplicarla.');
    }
    const end = promotion.endDate ? new Date(promotion.endDate).getTime() : null;
    if (end !== null && end < Date.now()) {
      throw new Error('La promoción ya terminó. Cambia su fecha de fin antes de aplicarla.');
    }
    if (promotion.discountType === 'percentage' && promotion.discountValue > 100) {
      throw new Error('Un descuento porcentual no puede superar el 100 %.');
    }
    if (promotion.discountType !== 'shipping' && !(resultingPrice > 0)) {
      throw new Error('Con este descuento el producto quedaría gratis ($0). Reduce el descuento.');
    }
  }

  /**
   * Actualiza los precios calculados de un producto
   */
  updateProductPricing(productId: string, pricing: { currentPrice: number; discountPercentage: number; originalPrice?: number; }): Observable<void> {
    const productRef = doc(this.firestore, this.productsCollection, productId);
    // Back to the regular price: the product no longer belongs to any promotion
    const clearPromotion = pricing.discountPercentage === 0
      ? { promotionId: deleteField(), promotionStartDate: deleteField(), promotionEndDate: deleteField(), promotionPaused: deleteField() }
      : {};
    return from(updateDoc(productRef, { ...pricing, ...clearPromotion, updatedAt: new Date() })).pipe(
      tap(() => {
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
  // En product-price.service.ts

  applyPromotionToVariant(productId: string, variantId: string, promotion: Promotion, productPrice: number): Observable<void> {
    return from((async () => {
      const variantRef = doc(this.firestore, 'productVariants', variantId);
      const variantSnap = await getDoc(variantRef);
      if (!variantSnap.exists()) throw new Error('La variante no existe');

      const variantData = variantSnap.data();
      const originalPrice = variantData['price'] || productPrice;
      const priceCalc = this.calculatePriceWithPromotion({ price: originalPrice } as Product, promotion);
      this.assertPromotionApplicable(promotion, priceCalc.currentPrice);

      const payload = {
        promotionId: promotion.id,
        // Validity window stored with the price so shop and server stop honouring it exactly at the end
        promotionStartDate: promotion.startDate ?? null,
        promotionEndDate: promotion.endDate ?? null,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
        discountedPrice: priceCalc.currentPrice,
        originalPrice: originalPrice,
        updatedAt: new Date()
      };

      await updateDoc(variantRef, payload);
      this.cacheService.invalidate(`products_${productId}`);
    })());
  }

  /**
   * Elimina una promoción aplicada a una variante
   */
  removePromotionFromVariant(productId: string, variantId: string): Observable<void> {
    return from((async () => {
      const variantRef = doc(this.firestore, 'productVariants', variantId);
      if (!(await getDoc(variantRef)).exists()) throw new Error('La variante no existe');
      
      await updateDoc(variantRef, {
        promotionId: deleteField(),
        discountType: deleteField(),
        discountValue: deleteField(),
        discountedPrice: deleteField(),
        originalPrice: deleteField(),
        promotionStartDate: deleteField(),
        promotionEndDate: deleteField(),
        promotionPaused: deleteField(),
        updatedAt: new Date()
      });
      
      this.cacheService.invalidate(`products_${productId}`);
    })());
  }

}