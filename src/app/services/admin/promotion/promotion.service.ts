import { Injectable, inject } from '@angular/core';
import { addDoc, collection, collectionData, deleteDoc, deleteField, doc, Firestore, getDoc, getDocs, limit, query, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { CacheService } from '../cache/cache.service';
import { catchError, from, map, Observable, of, throwError, take } from 'rxjs';
import { Promotion, Product } from '../../../models/models';

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
 * ✅ NUEVO: Obtiene solo las promociones estándar (no cupones)
 * que un administrador puede aplicar manualmente.
 */
  getStandardPromotions(): Observable<Promotion[]> {
    return this.getPromotions().pipe(
      map(allPromotions => allPromotions.filter(promo => promo.promotionType === 'standard' && promo.isActive)),
      catchError(error => {
        console.error('❌ Error al filtrar promociones estándar:', error);
        return of([]);
      })
    );
  }

  /**
   * 🚀 CORREGIDO Y MEJORADO: Elimina una promoción y limpia los productos afectados.
   */
  deletePromotion(id: string): Observable<void> {
    // Usamos un observable a partir de una función asíncrona para manejar los pasos
    return from((async () => {
      try {
        // 1. Referencia a la colección de productos
        const productsRef = collection(this.firestore, 'products');

        // 2. Creamos una consulta para encontrar todos los productos que tienen esta promoción aplicada
        //    (Esto asume que guardas un campo 'promotionId' en el producto cuando aplicas una promoción)
        const q = query(productsRef, where('promotionId', '==', id));
        const affectedProductsSnapshot = await getDocs(q);

        // 3. Si se encontraron productos, los limpiamos usando un lote (batch)
        if (!affectedProductsSnapshot.empty) {
          console.log(`🧹 Limpiando ${affectedProductsSnapshot.size} producto(s) afectado(s) por la promoción ${id}`);

          // Un 'writeBatch' nos permite hacer múltiples escrituras como una sola operación atómica
          const batch = writeBatch(this.firestore);

          affectedProductsSnapshot.forEach(productDoc => {
            // Para cada producto, preparamos una actualización para eliminar los campos del descuento
            batch.update(productDoc.ref, {
              promotionId: deleteField(),
              discountPercentage: deleteField(),
              originalPrice: deleteField(),
              currentPrice: deleteField()
            });
          });

          // 4. Ejecutamos todas las actualizaciones en la base de datos
          await batch.commit();
          console.log(`✅ Productos limpiados correctamente.`);
        }

        // 5. Una vez que los productos están limpios, eliminamos el documento de la promoción
        const promotionDocRef = doc(this.firestore, this.collectionName, id);
        await deleteDoc(promotionDocRef);

        // 6. Invalidamos cachés relevantes para que la UI se actualice
        this.cacheService.invalidate('promotions');
        this.cacheService.invalidate('products'); // Invalidamos productos porque acabamos de modificar varios

      } catch (error) {
        console.error(`❌ PromotionService: Error complejo al eliminar promoción ${id}:`, error);
        // Si algo falla, lanzamos el error para que el componente lo maneje
        throw error;
      }
    })());
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
   * 🆕 NUEVO: Fuerza la recarga de promociones (sin caché)
   */
  forceRefreshPromotions(): Observable<Promotion[]> {

    // Obtener promociones frescas
    return this.getPromotions();
  }

  /**
 * ✅ NUEVO: Busca una promoción activa por su código de cupón.
 * Este es el método clave para validar los cupones en tiempo real.
 */
  getPromotionByCode(code: string): Observable<Promotion | null> {
    if (!code || code.trim() === '') {
      return of(null);
    }

    const promotionsRef = collection(this.firestore, this.collectionName);
    // Buscamos un cupón que coincida con el código, sea de tipo 'coupon' y esté activo.
    const q = query(
      promotionsRef,
      where('couponCode', '==', code.toUpperCase()),
      where('promotionType', '==', 'coupon'),
      where('isActive', '==', true),
      limit(1) // Solo nos interesa el primero que encuentre
    );

    return from(getDocs(q)).pipe(
      map(snapshot => {
        if (snapshot.empty) {
          return null; // No se encontró ningún cupón con ese código.
        }
        // Procesa el documento encontrado (igual que en getPromotionById)
        const doc = snapshot.docs[0];
        const data = doc.data();
        const now = new Date();
        const startDate = data['startDate']?.toDate ? data['startDate'].toDate() : new Date();
        const endDate = data['endDate']?.toDate ? data['endDate'].toDate() : new Date();

        // Doble validación de fecha
        if (now < startDate || now > endDate) {
          console.warn(`Cupón "${code}" encontrado pero fuera de fecha de validez.`);
          return null;
        }

        return { id: doc.id, ...data, startDate, endDate } as Promotion;
      }),
      catchError(error => {
        console.error(`❌ Error buscando cupón por código ${code}:`, error);
        return of(null);
      })
    );
  }

}