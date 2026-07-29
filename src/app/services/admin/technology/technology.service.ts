import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, addDoc, deleteDoc, doc, query, orderBy } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map, catchError, switchMap, startWith } from 'rxjs/operators';
import { CacheService } from '../cache/cache.service';
import { ErrorUtil } from '../../../utils/error-util';

export interface Technology {
  id: string;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class TechnologyService {
  private firestore = inject(Firestore);
  private cacheService = inject(CacheService);
  private collectionName = 'technologies';
  private cacheKey = 'technologies';

  // Se re-suscribe al notificador de invalidación para que los componentes con
  // una suscripción activa reciban la lista actualizada sin recargar la página
  // (mismo patrón usado en CategoryService).
  getTechnologies(): Observable<Technology[]> {
    return this.cacheService.getInvalidationNotifier(this.cacheKey).pipe(
      startWith(undefined),
      switchMap(() => this.cacheService.getCached<Technology[]>(this.cacheKey, () => {
        const ref = collection(this.firestore, this.collectionName);
        const q = query(ref, orderBy('name', 'asc'));
        return collectionData(q, { idField: 'id' }).pipe(
          map(data => data as Technology[]),
          catchError(error => ErrorUtil.handleError(error, 'getTechnologies'))
        );
      }))
    );
  }

  async createTechnology(name: string): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('El nombre de la tecnología no puede estar vacío');

    const ref = collection(this.firestore, this.collectionName);
    const docRef = await addDoc(ref, { name: trimmed });
    this.cacheService.invalidate(this.cacheKey);
    return docRef.id;
  }

  async deleteTechnology(id: string): Promise<void> {
    const ref = doc(this.firestore, this.collectionName, id);
    await deleteDoc(ref);
    this.cacheService.invalidate(this.cacheKey);
  }
}
