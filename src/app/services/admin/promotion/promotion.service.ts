import { Injectable, inject } from '@angular/core';
import { addDoc, collection, collectionData, deleteDoc, doc, Firestore, getDoc, updateDoc } from '@angular/fire/firestore';
import { CacheService } from '../cache/cache.service';
import { catchError, from, map, Observable, of, throwError, take, finalize } from 'rxjs';
import { Promotion } from '../../../models/models';

@Injectable({
  providedIn: 'root'
})
export class PromotionService {
  // 🔧 CORRECCIÓN: Usar inject() para Firestore
  private firestore = inject(Firestore);
  private collectionName = 'promotions';

  // Claves de caché
  private readonly promotionsCacheKey = 'promotions';
  private readonly activePromotionsCacheKey = 'active_promotions';

  constructor(
    private cacheService: CacheService
  ) {
  }

  /**
   * 🚀 CORREGIDO: Obtiene todas las promociones
   */
  getPromotions(): Observable<Promotion[]> {
    return this.cacheService.getCached<Promotion[]>(this.promotionsCacheKey, () => {
      
      const promotionsRef = collection(this.firestore, this.collectionName);
      return collectionData(promotionsRef, { idField: 'id' }).pipe(
        take(1), // ✅ CRÍTICO: Forzar que se complete después del primer emit
        map(data => {
          
          return (data as any[]).map(promo => {
            // Convertir fechas desde Firestore
            let startDate: Date;
            let endDate: Date;

            try {
              // Para Timestamp de Firestore
              if (promo.startDate && typeof promo.startDate === 'object' && 'seconds' in promo.startDate) {
                startDate = new Date(promo.startDate.seconds * 1000);
              } else if (promo.startDate) {
                startDate = new Date(promo.startDate);
              } else {
                startDate = new Date();
              }

              if (promo.endDate && typeof promo.endDate === 'object' && 'seconds' in promo.endDate) {
                endDate = new Date(promo.endDate.seconds * 1000);
              } else if (promo.endDate) {
                endDate = new Date(promo.endDate);
              } else {
                // Fecha de fin predeterminada: 30 días después de la fecha de inicio
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 30);
              }
            } catch (e) {
              console.error(`❌ PromotionService: Error procesando fechas para promoción ${promo.id}:`, e);
              startDate = new Date();
              endDate = new Date();
              endDate.setDate(endDate.getDate() + 30);
            }

            const promotion = {
              ...promo,
              startDate,
              endDate
            } as Promotion;
            // Retornar objeto promoción con fechas convertidas
            return promotion;
          });
        }),
        catchError(error => {
          console.error('❌ PromotionService: Error al obtener promociones:', error);
          return of([]);
        }),
      );
    });
  }

  /**
   * 🚀 CORREGIDO: Obtiene una promoción por ID
   */
  getPromotionById(id: string): Observable<Promotion | null> {
    if (!id) {
      return of(null);
    }

    const cacheKey = `${this.promotionsCacheKey}_${id}`;

    return this.cacheService.getCached<Promotion | null>(cacheKey, () => {      
      const docRef = doc(this.firestore, this.collectionName, id);

      return from(getDoc(docRef)).pipe(
        map(doc => {
          if (!doc.exists()) {
            console.log(`❌ PromotionService: No se encontró promoción con ID: ${id}`);
            return null;
          }

          const data = doc.data();

          // Convertir fechas de manera más robusta
          let startDate: Date;
          let endDate: Date;

          try {
            // Para objetos Timestamp de Firestore
            if (data['startDate'] && typeof data['startDate'] === 'object' && 'seconds' in data['startDate']) {
              startDate = new Date(data['startDate'].seconds * 1000);
            } else if (data['startDate']) {
              startDate = new Date(data['startDate']);
            } else {
              startDate = new Date();
            }

            if (data['endDate'] && typeof data['endDate'] === 'object' && 'seconds' in data['endDate']) {
              endDate = new Date(data['endDate'].seconds * 1000);
            } else if (data['endDate']) {
              endDate = new Date(data['endDate']);
            } else {
              endDate = new Date();
              endDate.setDate(endDate.getDate() + 30);
            }
          } catch (e) {
            console.error(`❌ PromotionService: Error procesando fechas para promoción ${id}:`, e);
            startDate = new Date();
            endDate = new Date();
            endDate.setDate(endDate.getDate() + 30);
          }

          const promotion = {
            id: doc.id,
            ...data,
            startDate,
            endDate,
            // Asegurar que isActive sea un booleano
            isActive: data['isActive'] === true
          } as Promotion;

          return promotion;
        }),
        catchError(error => {
          console.error(`❌ PromotionService: Error al obtener promoción ${id}:`, error);
          return of(null);
        }),
      );
    });
  }

  /**
   * 🚀 CORREGIDO: Crea una nueva promoción
   */
  createPromotion(promotion: Promotion): Observable<string> {
    
    const promotionsRef = collection(this.firestore, this.collectionName);
    return from(addDoc(promotionsRef, {
      ...promotion,
      createdAt: new Date()
    })).pipe(
      map(docRef => {
        
        // Invalidar caché después de crear
        this.invalidatePromotionCache();
        
        return docRef.id;
      }),
      catchError(error => {
        console.error('❌ PromotionService: Error al crear promoción:', error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * 🚀 CORREGIDO: Actualiza una promoción existente
   */
  updatePromotion(id: string, promotion: Partial<Promotion>): Observable<void> {
    if (!id) {
      return throwError(() => new Error('ID de promoción no proporcionado'));
    }
    
    const docRef = doc(this.firestore, this.collectionName, id);
    return from(updateDoc(docRef, {
      ...promotion,
      updatedAt: new Date()
    })).pipe(
      map(() => {        
        // Invalidar caché después de actualizar
        this.invalidatePromotionCache(id);
      }),
      catchError(error => {
        console.error(`❌ PromotionService: Error al actualizar promoción ${id}:`, error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * 🚀 CORREGIDO: Elimina una promoción
   */
  deletePromotion(id: string): Observable<void> {
    if (!id) {
      return throwError(() => new Error('ID de promoción no proporcionado'));
    }
    
    const docRef = doc(this.firestore, this.collectionName, id);
    return from(deleteDoc(docRef)).pipe(
      map(() => {
        
        // Invalidar caché después de eliminar
        this.invalidatePromotionCache(id);
      }),
      catchError(error => {
        console.error(`❌ PromotionService: Error al eliminar promoción ${id}:`, error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * 🚀 CORREGIDO: Obtiene promociones activas
   */
  getActivePromotions(): Observable<Promotion[]> {
    return this.cacheService.getCached<Promotion[]>(this.activePromotionsCacheKey, () => {
      
      const now = new Date();

      return this.getPromotions().pipe(
        take(1), // ✅ NUEVO: Forzar completar
        map(allPromotions => {

          // Filtrar por promociones activas con fechas válidas
          const activePromotions = allPromotions.filter(promo => {
            // Asegurarnos de que las fechas son instancias de Date
            const startDate = promo.startDate instanceof Date ?
              promo.startDate : new Date(promo.startDate);
            const endDate = promo.endDate instanceof Date ?
              promo.endDate : new Date(promo.endDate);

            // Verificar si la promoción está activa
            const isActive = promo.isActive === true;
            // Verificar si la fecha actual está dentro del rango
            const isInDateRange = now >= startDate && now <= endDate;
            // Verificar si la fecha de fin es mayor que la fecha actual (compatibilidad con lógica anterior)
            const hasValidDate = endDate > now;

            const isValidPromotion = isActive && isInDateRange && hasValidDate;

            return isValidPromotion;
          });

          console.log(`✅ PromotionService: Promociones activas filtradas: ${activePromotions.length}`);
          
          if (activePromotions.length === 0) {
            console.log('ℹ️ PromotionService: No se encontraron promociones activas');
          } else {
            activePromotions.forEach(promo => {
              const discountDisplay = promo.discountType === 'percentage' 
                ? `${promo.discountValue}%` 
                : `${promo.discountValue}`;
              console.log(`   🎯 ${promo.name} - Descuento: ${discountDisplay}`);
            });
          }

          return activePromotions;
        }),
        catchError(error => {
          console.error('❌ PromotionService: Error al obtener promociones activas:', error);
          return of([]);
        }),
      );
    });
  }

  /**
   * 🆕 NUEVO: Obtiene promociones por categoría de producto
   */
  getPromotionsByCategory(categoryId: string): Observable<Promotion[]> {
    if (!categoryId) {
      return of([]);
    }

    return this.getActivePromotions().pipe(
      take(1), // ✅ NUEVO: Forzar completar
      map(activePromotions => {
        const categoryPromotions = activePromotions.filter(promo => {
          // Verificar si la promoción aplica a esta categoría
          return promo.applicableCategories?.includes(categoryId) || 
                 promo.applicableCategories?.includes('all') ||
                 !promo.applicableCategories; // Si no especifica categorías, aplica a todas
        });

        return categoryPromotions;
      }),
      catchError(error => {
        console.error(`❌ PromotionService: Error al obtener promociones por categoría ${categoryId}:`, error);
        return of([]);
      }),
    );
  }

  /**
   * 🆕 NUEVO: Obtiene promociones por producto específico
   */
  getPromotionsByProduct(productId: string): Observable<Promotion[]> {
    if (!productId) {
      return of([]);
    }

    return this.getActivePromotions().pipe(
      take(1), // ✅ NUEVO: Forzar completar
      map(activePromotions => {
        const productPromotions = activePromotions.filter(promo => {
          // Verificar si la promoción aplica a este producto específico
          return promo.applicableProductIds?.includes(productId) ||
                 promo.applicableProductIds?.includes('all') ||
                 !promo.applicableProductIds; // Si no especifica productos, aplica a todos
        });

        return productPromotions;
      }),
      catchError(error => {
        console.error(`❌ PromotionService: Error al obtener promociones por producto ${productId}:`, error);
        return of([]);
      }),
    );
  }

  /**
   * 🆕 NUEVO: Verifica si una promoción está activa actualmente
   */
  isPromotionActive(promotionId: string): Observable<boolean> {
    if (!promotionId) {
      return of(false);
    }
    return this.getPromotionById(promotionId).pipe(
      take(1), // ✅ NUEVO: Forzar completar
      map(promotion => {
        if (!promotion) {
          console.log(`❌ PromotionService: Promoción no encontrada: ${promotionId}`);
          return false;
        }

        const now = new Date();
        const startDate = promotion.startDate instanceof Date ? 
          promotion.startDate : new Date(promotion.startDate);
        const endDate = promotion.endDate instanceof Date ? 
          promotion.endDate : new Date(promotion.endDate);

        const isActive = promotion.isActive === true;
        const isInDateRange = now >= startDate && now <= endDate;

        const result = isActive && isInDateRange;

        return result;
      }),
      catchError(error => {
        console.error(`❌ PromotionService: Error verificando promoción ${promotionId}:`, error);
        return of(false);
      }),
    );
  }

  /**
   * Invalida los cachés de promociones
   */
  private invalidatePromotionCache(promotionId?: string): void {    
    // Invalidar cachés principales
    this.cacheService.invalidate(this.promotionsCacheKey);
    this.cacheService.invalidate(this.activePromotionsCacheKey);

    // Invalidar caché específico si se proporciona ID
    if (promotionId) {
      this.cacheService.invalidate(`${this.promotionsCacheKey}_${promotionId}`);
    }

  }

  /**
   * 🆕 NUEVO: Método de debugging para ver el estado de promociones
   */
  debugPromotions(): void {
    
    this.getPromotions().pipe(
      take(1)
    ).subscribe({
      next: (promotions) => {
        
        if (promotions.length > 0) {
          const summary = promotions.map(promo => {
            const now = new Date();
            const isCurrentlyActive = promo.isActive && 
              now >= promo.startDate && 
              now <= promo.endDate;

            return {
              id: promo.id,
              name: promo.name,
              discountType: promo.discountType,
              discountValue: promo.discountValue || 0,
              discountDisplay: promo.discountType === 'percentage' 
                ? `${promo.discountValue}%` 
                : `${promo.discountValue}`,
              isActive: promo.isActive ? '✅' : '❌',
              currentlyValid: isCurrentlyActive ? '✅' : '❌',
              startDate: promo.startDate.toLocaleDateString(),
              endDate: promo.endDate.toLocaleDateString()
            };
          });
          
          console.table(summary);
          
          // Estadísticas
          const stats = {
            activas: promotions.filter(p => p.isActive).length,
            vigentes: promotions.filter(p => {
              const now = new Date();
              return p.isActive && now >= p.startDate && now <= p.endDate;
            }).length,
            vencidas: promotions.filter(p => {
              const now = new Date();
              return p.endDate < now;
            }).length,
            futuras: promotions.filter(p => {
              const now = new Date();
              return p.startDate > now;
            }).length
          };
          
          console.log('📈 Estadísticas:', stats);
        } else {
          console.log('🤷‍♂️ No hay promociones disponibles');
        }
      },
      error: (error) => {
        console.error('❌ Error obteniendo promociones para debug:', error);
      }
    });
    
    console.groupEnd();
  }

  /**
   * 🆕 NUEVO: Fuerza la recarga de promociones (sin caché)
   */
  forceRefreshPromotions(): Observable<Promotion[]> {
    
    // Limpiar caché
    this.invalidatePromotionCache();
    
    // Obtener promociones frescas
    return this.getPromotions();
  }
}