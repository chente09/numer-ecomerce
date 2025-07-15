import { Injectable, inject } from '@angular/core';
import { addDoc, collection, collectionData, deleteDoc, doc, Firestore, getDoc, getDocs, updateDoc } from '@angular/fire/firestore';
import { CacheService } from '../cache/cache.service';
import { catchError, from, map, Observable, of, throwError, take } from 'rxjs';
import { Promotion } from '../../../models/models';

@Injectable({
  providedIn: 'root'
})
export class PromotionService {
  // 🔧 CORRECCIÓN: Usar inject() para Firestore
  private firestore = inject(Firestore);
  private collectionName = 'promotions';


  constructor(
    private cacheService: CacheService
  ) {
  }

  /**
   * Obtiene todas las promociones directamente desde Firestore, sin caché.
   * @returns Un Observable que emite un array de objetos Promotion.
   */
  getPromotions(): Observable<Promotion[]> {
    const promotionsRef = collection(this.firestore, this.collectionName);

    return from(getDocs(promotionsRef)).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => {
          const promo = doc.data(); // promo es de tipo DocumentData
          let startDate: Date;
          let endDate: Date;

          try {
            // ✅ Cambio aquí: usa promo['startDate'] en lugar de promo.startDate
            if (promo['startDate'] && typeof promo['startDate'].toDate === 'function') {
              startDate = promo['startDate'].toDate();
            } else if (promo['startDate']) {
              startDate = new Date(promo['startDate']);
            } else {
              startDate = new Date();
            }

            // ✅ Cambio aquí: usa promo['endDate'] en lugar de promo.endDate
            if (promo['endDate'] && typeof promo['endDate'].toDate === 'function') {
              endDate = promo['endDate'].toDate();
            } else if (promo['endDate']) {
              endDate = new Date(promo['endDate']);
            } else {
              endDate = new Date(startDate);
              endDate.setDate(endDate.getDate() + 30);
            }
          } catch (e) {
            console.error(`❌ Error al procesar fechas para la promoción ${doc.id}:`, e);
            startDate = new Date();
            endDate = new Date();
            endDate.setDate(endDate.getDate() + 30);
          }
          
          return {
            id: doc.id,
            ...promo,
            startDate,
            endDate
          } as Promotion;
        });
      }),
      catchError(error => {
        console.error('❌ PromotionService: Error al obtener promociones:', error);
        return of([]);
      }),
    );
  }

  /**
   * Obtiene una promoción específica por su ID, sin usar caché.
   * @param id El ID del documento de la promoción a obtener.
   * @returns Un Observable que emite un objeto Promotion o null si no se encuentra.
   */
  getPromotionById(id: string): Observable<Promotion | null> {
    if (!id) {
      return of(null);
    }
    
    const docRef = doc(this.firestore, this.collectionName, id);

    return from(getDoc(docRef)).pipe(
      map(docSnap => {
        if (!docSnap.exists()) {
          console.warn(`PromotionService: No se encontró promoción con ID: ${id}`);
          return null;
        }

        const data = docSnap.data(); // data es de tipo DocumentData
        let startDate: Date;
        let endDate: Date;

        try {
          // ✅ Cambio aquí: usa data['startDate'] en lugar de data.startDate
          if (data['startDate'] && typeof data['startDate'].toDate === 'function') {
            startDate = data['startDate'].toDate();
          } else if (data['startDate']) {
            startDate = new Date(data['startDate']);
          } else {
            startDate = new Date();
          }
          
          // ✅ Cambio aquí: usa data['endDate'] en lugar de data.endDate
          if (data['endDate'] && typeof data['endDate'].toDate === 'function') {
            endDate = data['endDate'].toDate();
          } else if (data['endDate']) {
            endDate = new Date(data['endDate']);
          } else {
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 30);
          }
        } catch (e) {
          console.error(`❌ Error al procesar fechas para la promoción ${id}:`, e);
          startDate = new Date();
          endDate = new Date();
          endDate.setDate(endDate.getDate() + 30);
        }

        return {
          id: docSnap.id,
          ...data,
          startDate,
          endDate,
          // ✅ Cambio aquí: usa data['isActive']
          isActive: data['isActive'] === true
        } as Promotion;
      }),
      catchError(error => {
        console.error(`❌ PromotionService: Error al obtener promoción ${id}:`, error);
        return of(null);
      }),
    );
  }



  /**
   * 🚀 CORREGIDO: Crea una nueva promoción
   */
  createPromotion(promotion: Promotion): Observable<string> {
    const promotionsRef = collection(this.firestore, this.collectionName);
    return from(addDoc(promotionsRef, { ...promotion, createdAt: new Date() })).pipe(
      map(docRef => docRef.id), // ✅ No se necesita invalidar caché
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
    const docRef = doc(this.firestore, this.collectionName, id);
    return from(updateDoc(docRef, { ...promotion, updatedAt: new Date() })).pipe(
      map(() => { }), // ✅ No se necesita invalidar caché
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
    const docRef = doc(this.firestore, this.collectionName, id);
    return from(deleteDoc(docRef)).pipe(
      map(() => { }), // ✅ No se necesita invalidar caché
      catchError(error => {
        console.error(`❌ PromotionService: Error al eliminar promoción ${id}:`, error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * Obtiene las promociones que están activas y dentro de su rango de fechas válido.
   * Este método reutiliza getPromotions() para obtener los datos frescos.
   * @returns Un Observable que emite un array de objetos Promotion activos.
   */
  getActivePromotions(): Observable<Promotion[]> {
    // Llama al método principal que ya no usa caché.
    return this.getPromotions().pipe(
      map(allPromotions => {
        const now = new Date();

        // Filtra el array de promociones en el cliente.
        const activePromotions = allPromotions.filter(promo => {
          // Asegura que las fechas son objetos Date válidos antes de comparar.
          // (getPromotions ya se encarga de la conversión inicial)
          const startDate = promo.startDate;
          const endDate = promo.endDate;

          const isCurrentlyActive = promo.isActive === true &&
            now >= startDate &&
            now <= endDate;

          return isCurrentlyActive;
        });

        return activePromotions;
      }),
      catchError(error => {
        // Aunque getPromotions ya maneja errores, es una buena práctica
        // tener un catch aquí también para cualquier error en el mapeo.
        console.error('❌ PromotionService: Error al filtrar promociones activas:', error);
        return of([]);
      })
    );
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

    // Obtener promociones frescas
    return this.getPromotions();
  }
}