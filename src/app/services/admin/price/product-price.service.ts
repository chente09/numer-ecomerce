import { Injectable } from '@angular/core';
import {
  Firestore, collection, collectionData,
  query, where, getDocs, doc, getDoc
} from '@angular/fire/firestore';
import { Observable, of, from, forkJoin } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';

// Importa tus modelos según tu estructura de proyecto
import { Product } from '../../../models/models';
import { Promotion } from '../../../models/models';

@Injectable({
  providedIn: 'root'
})
export class ProductPriceService {
  private promotionsCollection = 'promotions';

  constructor(private firestore: Firestore) { }

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
      catchError(error => {
        console.error('Error al calcular precios con descuento:', error);
        return of(products);
      })
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
          return of(null as unknown as Product);
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
      catchError(error => {
        console.error(`Error al calcular precio con descuento para producto ${productId}:`, error);
        throw error;
      })
    );
  }

  /**
   * Obtiene un producto por su ID (método auxiliar)
   */
  private async getProductById(productId: string): Promise<Product | null> {
    try {
      const productDoc = doc(this.firestore, 'products', productId);
      const productSnap = await getDoc(productDoc);

      if (productSnap.exists()) {
        return { id: productSnap.id, ...productSnap.data() } as Product;
      }
      return null;
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
      })
    );
  }

  /**
   * Obtiene promociones específicas para un producto por su ID
   */
  getPromotionsForProduct(productId: string): Observable<Promotion[]> {
    return from(this.getProductById(productId)).pipe(
      switchMap(product => {
        if (!product) {
          return of([]);
        }

        return this.getActivePromotions().pipe(
          map(promotions => this.filterApplicablePromotions(product, promotions))
        );
      })
    );
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
        if (promo.isActive &&
          promo.startDate <= now &&
          promo.endDate >= now) {

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
   */
  // getActivePromotions(): Observable<Promotion[]> {
  //   const now = new Date();
  //   const promotionsRef = collection(this.firestore, this.promotionsCollection);
  //   const q = query(
  //     promotionsRef,
  //     where('isActive', '==', true),
  //     where('endDate', '>', now)
  //   );

  //   return collectionData(q, { idField: 'id' }).pipe(
  //     map(promotions => {
  //       return (promotions as any[]).map(promo => ({
  //         ...promo,
  //         // Convertir timestamps a Date si es necesario
  //         startDate: this.convertTimestampToDate(promo.startDate),
  //         endDate: this.convertTimestampToDate(promo.endDate)
  //       })) as Promotion[];
  //     }),
  //     catchError(error => {
  //       console.error('Error al obtener promociones activas:', error);
  //       return of([]);
  //     })
  //   );
  // }

  getActivePromotions(): Observable<Promotion[]> {
    const now = new Date();
    const promotionsRef = collection(this.firestore, this.promotionsCollection);

    // Sólo filtrar por isActive y luego filtrar en memoria
    const q = query(
      promotionsRef,
      where('isActive', '==', true)
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(promotions => {
        // Filtrar en el cliente por fecha
        return (promotions as any[])
          .filter(promo => this.convertTimestampToDate(promo.endDate) > now)
          .map(promo => ({
            ...promo,
            startDate: this.convertTimestampToDate(promo.startDate),
            endDate: this.convertTimestampToDate(promo.endDate)
          })) as Promotion[];
      }),
      catchError(error => {
        console.error('Error al obtener promociones activas:', error);
        return of([]);
      })
    );
  }

  /**
   * Añade promociones aplicables a un producto
   */
  async addPromotionsToProduct(product: Product): Promise<Product> {
    try {
      const now = new Date();
      const promotionsRef = collection(this.firestore, this.promotionsCollection);
      const q = query(
        promotionsRef,
        where('isActive', '==', true),
        where('endDate', '>', now)
      );

      const promotionsSnap = await getDocs(q);
      const allPromotions = promotionsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startDate: this.convertTimestampToDate(doc.data()['startDate']),
        endDate: this.convertTimestampToDate(doc.data()['endDate'])
      }) as unknown as Promotion);

      // Filtrar promociones aplicables
      const applicablePromotions = this.filterApplicablePromotions(product, allPromotions);

      return {
        ...product,
        promotions: applicablePromotions
      };
    } catch (error) {
      console.error('Error al añadir promociones al producto:', error);
      return product;
    }
  }

  /**
   * Verifica si una promoción es aplicable a un producto
   */
  isPromotionApplicable(product: Product, promotion: Promotion): boolean {
    // Verificar si la promoción está activa
    const now = new Date();
    if (!promotion.isActive || promotion.startDate > now || promotion.endDate < now) {
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
    return from(this.getPromotionById(promotionId)).pipe(
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
  private async getPromotionById(promotionId: string): Promise<Promotion | null> {
    try {
      const promotionDoc = doc(this.firestore, this.promotionsCollection, promotionId);
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
      console.error(`Error al obtener promoción ${promotionId}:`, error);
      throw error;
    }
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
    return allPromotions.filter(promo => this.isPromotionApplicable(product, promo));
  }

  /**
   * Convierte un timestamp de Firestore a Date
   */
  private convertTimestampToDate(timestamp: any): Date {
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    return timestamp ? new Date(timestamp) : new Date();
  }
}