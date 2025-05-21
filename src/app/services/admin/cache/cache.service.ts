import { Injectable } from '@angular/core';
import { Observable, Subject, ReplaySubject, of } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  // Almacena los observables cacheados
  private cache: Map<string, Observable<any>> = new Map();
  
  // Almacena los subjects para notificaciones de invalidación
  private invalidationNotifiers: Map<string, Subject<void>> = new Map();

  /**
   * Obtiene un observable del caché o lo crea si no existe
   * @param key Clave única para identificar el caché
   * @param dataFactory Función que crea el observable si no está en caché
   * @returns Observable con los datos solicitados
   */
  getCached<T>(key: string, dataFactory: () => Observable<T>): Observable<T> {
    // Si el caché para esta clave no existe, créalo
    if (!this.cache.has(key)) {
      // Crear un notificador de invalidación si no existe
      if (!this.invalidationNotifiers.has(key)) {
        this.invalidationNotifiers.set(key, new Subject<void>());
      }
      
      // Crear nuevo Observable con caché
      const source$ = dataFactory().pipe(
        shareReplay(1)
      );
      
      this.cache.set(key, source$);
    }
    
    return this.cache.get(key) as Observable<T>;
  }

  /**
   * Invalida el caché para una clave específica
   * @param key Clave del caché a invalidar
   */
  invalidate(key: string): void {
    // Eliminar el observable cacheado
    this.cache.delete(key);
    
    // Notificar a los suscriptores sobre la invalidación
    const notifier = this.invalidationNotifiers.get(key);
    if (notifier) {
      notifier.next();
    }
  }

  /**
   * Obtiene un notificador para suscribirse a las invalidaciones de caché
   * @param key Clave del caché a monitorear
   * @returns Observable que emite cuando el caché es invalidado
   */
  getInvalidationNotifier(key: string): Observable<void> {
    if (!this.invalidationNotifiers.has(key)) {
      this.invalidationNotifiers.set(key, new Subject<void>());
    }
    
    return this.invalidationNotifiers.get(key)!.asObservable();
  }

  /**
   * Invalida todos los cachés
   */
  invalidateAll(): void {
    // Limpiar todos los cachés
    this.cache.clear();
    
    // Notificar todas las invalidaciones
    this.invalidationNotifiers.forEach(notifier => {
      notifier.next();
    });
  }
}