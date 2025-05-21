import { Injectable } from '@angular/core';
import { addDoc, collection, collectionData, deleteDoc, doc, Firestore, getDoc, updateDoc } from '@angular/fire/firestore';
import { CacheService } from '../cache/cache.service';
import { catchError, from, map, Observable, of, throwError } from 'rxjs';
import { Promotion } from '../../../models/models';

@Injectable({
  providedIn: 'root'
})
export class PromotionService {

  private collectionName = 'promotions';

  constructor(
    private firestore: Firestore,
    private cacheService: CacheService
  ) { }

  getPromotions(): Observable<Promotion[]> {
    const promotionsRef = collection(this.firestore, this.collectionName);
    return collectionData(promotionsRef, { idField: 'id' }).pipe(
      map(data => {
        console.log('Datos crudos de Firestore:', data);
        return (data as any[]).map(promo => {
          console.log('Procesando promoción:', promo.id, 'startDate:', promo.startDate);

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
            console.error('Error procesando fechas para promoción', promo.id, e);
            startDate = new Date();
            endDate = new Date();
            endDate.setDate(endDate.getDate() + 30);
          }

          // Retornar objeto promoción con fechas convertidas
          return {
            ...promo,
            startDate,
            endDate
          } as Promotion;
        });
      }),
      catchError(error => {
        console.error('Error al obtener promociones:', error);
        return of([]);
      })
    );
  }

  getPromotionById(id: string): Observable<Promotion | null> {
    console.log('Buscando promoción con ID:', id);
    const docRef = doc(this.firestore, this.collectionName, id);

    return from(getDoc(docRef)).pipe(
      map(doc => {
        if (!doc.exists()) {
          console.log('No se encontró promoción con ID:', id);
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
          console.error('Error procesando fechas para promoción', id, e);
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

        console.log('Promoción encontrada:', promotion);
        return promotion;
      }),
      catchError(error => {
        console.error(`Error al obtener promoción ${id}:`, error);
        return of(null);
      })
    );
  }

  createPromotion(promotion: Promotion): Observable<string> {
    const promotionsRef = collection(this.firestore, this.collectionName);
    return from(addDoc(promotionsRef, {
      ...promotion,
      createdAt: new Date()
    })).pipe(
      map(docRef => docRef.id),
      catchError(error => {
        console.error('Error al crear promoción:', error);
        return throwError(() => error);
      })
    );
  }

  updatePromotion(id: string, promotion: Partial<Promotion>): Observable<void> {
    const docRef = doc(this.firestore, this.collectionName, id);
    return from(updateDoc(docRef, {
      ...promotion,
      updatedAt: new Date()
    })).pipe(
      catchError(error => {
        console.error(`Error al actualizar promoción ${id}:`, error);
        return throwError(() => error);
      })
    );
  }

  deletePromotion(id: string): Observable<void> {
    const docRef = doc(this.firestore, this.collectionName, id);
    return from(deleteDoc(docRef)).pipe(
      catchError(error => {
        console.error(`Error al eliminar promoción ${id}:`, error);
        return throwError(() => error);
      })
    );
  }

  getActivePromotions(): Observable<Promotion[]> {
    console.log('Buscando promociones activas...');
    const now = new Date();
    console.log('Fecha actual:', now);

    return this.getPromotions().pipe(
      map(allPromotions => {
        console.log('Total de promociones encontradas:', allPromotions.length);

        // Filtrar por promociones activas con fechas válidas
        const activePromotions = allPromotions.filter(promo => {
          // Asegurarnos de que las fechas son instancias de Date
          const startDate = promo.startDate instanceof Date ?
            promo.startDate : new Date(promo.startDate);
          const endDate = promo.endDate instanceof Date ?
            promo.endDate : new Date(promo.endDate);

          // Verificar si la promoción está activa
          const isActive = promo.isActive === true;
          // Verificar si la fecha de fin es mayor que la fecha actual
          const hasValidDate = endDate > now;

          console.log(`Promoción ${promo.id} - ${promo.name || 'Sin nombre'}: ` +
            `activa=${isActive}, ` +
            `endDate=${endDate.toISOString()}, ` +
            `válida hasta=${hasValidDate}`);

          return isActive && hasValidDate;
        });

        console.log('Promociones activas filtradas:', activePromotions.length);
        if (activePromotions.length === 0) {
          console.log('No se encontraron promociones activas');
        }

        return activePromotions;
      }),
      catchError(error => {
        console.error('Error al obtener promociones activas:', error);
        return of([]);
      })
    );
  }


}
