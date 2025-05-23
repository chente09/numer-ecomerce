import { Injectable } from '@angular/core';
import { Observable, Subject, of } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  // Almacena los observables cacheados
  private cache: Map<string, Observable<any>> = new Map();

  // Almacena los subjects para notificaciones de invalidación
  private invalidationNotifiers: Map<string, Subject<void>> = new Map();

  // Flag para prevenir bucles infinitos
  private invalidatingCache = false;

  // Configuración de TTL (Time To Live) para diferentes tipos de caché
  private cacheTTL: Map<string, number> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();

  constructor() {
    // Configurar TTL por defecto (en milisegundos)
    this.cacheTTL.set('products', 5 * 60 * 1000); // 5 minutos
    this.cacheTTL.set('categories', 30 * 60 * 1000); // 30 minutos
    this.cacheTTL.set('colors', 60 * 60 * 1000); // 1 hora
    this.cacheTTL.set('sizes', 60 * 60 * 1000); // 1 hora
    this.cacheTTL.set('variants', 2 * 60 * 1000); // 2 minutos
  }

  /**
   * Obtiene un observable del caché o lo crea si no existe
   */
  getCached<T>(key: string, dataFactory: () => Observable<T>): Observable<T> {
    // Verificar si el caché ha expirado
    if (this.isCacheExpired(key)) {
      this.invalidate(key);
    }

    // Si el caché para esta clave no existe, créalo
    if (!this.cache.has(key)) {

      // Crear un notificador de invalidación si no existe
      if (!this.invalidationNotifiers.has(key)) {
        this.invalidationNotifiers.set(key, new Subject<void>());
      }

      // Crear nuevo Observable con caché
      const source$ = dataFactory().pipe(
        tap(() => {
          // Registrar timestamp cuando los datos son obtenidos
          this.cacheTimestamps.set(key, Date.now());
        }),
        shareReplay(1)
      );

      this.cache.set(key, source$);
    } else {
      console.log(`♻️ [CACHE] Usando caché existente para: ${key}`);
    }

    return this.cache.get(key) as Observable<T>;
  }

  /**
   * Verifica si un caché ha expirado basado en su TTL
   */
  private isCacheExpired(key: string): boolean {
    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp) {
      return false; // No hay timestamp, no ha expirado
    }

    // Buscar TTL específico o usar TTL por defecto basado en el prefijo de la clave
    let ttl = this.getTTLForKey(key);

    return (Date.now() - timestamp) > ttl;
  }

  /**
   * Obtiene el TTL apropiado para una clave específica
   */
  private getTTLForKey(key: string): number {
    // Buscar TTL específico exacto
    if (this.cacheTTL.has(key)) {
      return this.cacheTTL.get(key)!;
    }

    // Buscar por prefijo
    for (const [prefix, ttl] of this.cacheTTL.entries()) {
      if (key.startsWith(prefix)) {
        return ttl;
      }
    }

    // TTL por defecto de 5 minutos
    return 5 * 60 * 1000;
  }

  /**
   * Invalida el caché para una clave específica
   */
  invalidate(key: string): void {
    // Prevenir bucles infinitos
    if (this.invalidatingCache) {
      console.warn(`⚠️ [CACHE] Evitando bucle infinito para: ${key}`);
      return;
    }

    this.invalidatingCache = true;
    

    try {
      // Eliminar el observable cacheado
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else {
        console.log(`ℹ️ [CACHE] Clave no encontrada en caché: ${key}`);
      }

      // Notificar a los suscriptores sobre la invalidación
      const notifier = this.invalidationNotifiers.get(key);
      if (notifier) {
        notifier.next();
      }

      // Invalidar claves relacionadas de manera más selectiva
      if (key === 'products') {
        this.invalidateProductRelated();
      }
    } finally {
      // CRÍTICO: Siempre resetear el flag
      setTimeout(() => {
        this.invalidatingCache = false;
      }, 100);
    }
  }


  /**
   * Invalida múltiples claves de una vez
   */
  invalidateMultiple(keys: string[]): void {

    keys.forEach(key => {
      if (this.cache.has(key)) {
        this.cache.delete(key);

        // Notificar
        const notifier = this.invalidationNotifiers.get(key);
        if (notifier) {
          notifier.next();
        }
      }
    });
  }
  /**
   * NUEVO: Invalida caché basado en patrones
   */
  invalidatePattern(pattern: string): void {

    const keysToDelete: string[] = [];

    for (const [cacheKey] of this.cache) {
      if (cacheKey.startsWith(pattern)) {
        keysToDelete.push(cacheKey);
      }
    }

    if (keysToDelete.length > 0) {
      this.invalidateMultiple(keysToDelete);
    } else {
      console.log(`ℹ️ [CACHE] No se encontraron entradas con patrón: ${pattern}`);
    }
  }

  /**
   * Fuerza la recarga de un caché específico
   */
  forceReload<T>(key: string, dataFactory: () => Observable<T>): Observable<T> {

    // Eliminar del caché
    this.invalidate(key);

    // Recrear inmediatamente
    return this.getCached(key, dataFactory);
  }


  /**
   * Invalida múltiples claves relacionadas con productos de manera segura
   */
  private invalidateProductRelated(): void {
    if (this.invalidatingCache) {
      return;
    }

    // Lista de patrones específicos a invalidar
    const patternsToInvalidate = [
      'products_featured',
      'products_bestselling',
      'products_new',
      'products_discounted'
    ];

    // Invalidar patrones específicos usando el nuevo método
    patternsToInvalidate.forEach(pattern => {
      this.invalidatePattern(pattern);
    });

    // Invalidar cachés que empiecen con ciertos prefijos
    const prefixesToInvalidate = [
      'products_category_',
      'products_complete_',
      'products_related_'
    ];

    prefixesToInvalidate.forEach(prefix => {
      this.invalidatePattern(prefix);
    });
  }

  /**
   * Obtiene un notificador para suscribirse a las invalidaciones de caché
   */
  getInvalidationNotifier(key: string): Observable<void> {
    if (!this.invalidationNotifiers.has(key)) {
      this.invalidationNotifiers.set(key, new Subject<void>());
    }

    return this.invalidationNotifiers.get(key)!.asObservable();
  }

  /**
   * Invalida todos los cachés de manera segura
   */
  invalidateAll(): void {
    if (this.invalidatingCache) {
      return;
    }

    this.invalidatingCache = true;

    try {

      // Limpiar todos los cachés
      this.cache.clear();
      this.cacheTimestamps.clear();

      // Notificar todas las invalidaciones
      this.invalidationNotifiers.forEach(notifier => {
        try {
          notifier.next();
        } catch (error) {
          console.error('Error notificando invalidación:', error);
        }
      });
    } finally {
      setTimeout(() => {
        this.invalidatingCache = false;
      }, 100);
    }
  }

  /**
   * Invalida caché específico de un producto
   */
  invalidateProduct(productId: string): void {
    if (this.invalidatingCache) {
      return;
    }

    const productKeys = [
      `products_${productId}`,
      `products_complete_${productId}`,
      `products_related_${productId}`
    ];

    productKeys.forEach(key => {
      this.invalidate(key);
    });
  }

  /**
   * NUEVO: Invalida caché de una categoría específica
   */
  invalidateCategory(categoryId: string): void {
    if (this.invalidatingCache) {
      return;
    }

    // Invalidar caché específico de la categoría
    this.invalidate(`categories_${categoryId}`);
    this.invalidate(`products_category_${categoryId}`);

    // También invalidar la lista general de categorías
    this.invalidate('categories');
  }

  /**
   * NUEVO: Configura TTL personalizado para una clave o patrón
   */
  setTTL(keyOrPattern: string, ttlInMs: number): void {
    this.cacheTTL.set(keyOrPattern, ttlInMs);
  }

  /**
   * NUEVO: Obtiene estadísticas del caché
   */
  getCacheStats(): {
    totalEntries: number;
    keys: string[];
    sizes: { [key: string]: number };
    timestamps: { [key: string]: Date };
    ttls: { [key: string]: number };
  } {
    const sizes: { [key: string]: number } = {};
    const timestamps: { [key: string]: Date } = {};
    const ttls: { [key: string]: number } = {};

    // Calcular estadísticas
    this.cache.forEach((value, key) => {
      sizes[key] = 1; // En un Observable no podemos medir el tamaño real fácilmente

      const timestamp = this.cacheTimestamps.get(key);
      if (timestamp) {
        timestamps[key] = new Date(timestamp);
      }

      ttls[key] = this.getTTLForKey(key);
    });

    return {
      totalEntries: this.cache.size,
      keys: Array.from(this.cache.keys()),
      sizes,
      timestamps,
      ttls
    };
  }

  /**
   * NUEVO: Limpia caché expirado
   */
  cleanupExpiredCache(): number {
    let cleanedCount = 0;
    const keysToClean: string[] = [];

    // Identificar claves expiradas
    this.cache.forEach((value, key) => {
      if (this.isCacheExpired(key)) {
        keysToClean.push(key);
      }
    });

    // Limpiar claves expiradas
    keysToClean.forEach(key => {
      this.invalidate(key);
      cleanedCount++;
    });

    return cleanedCount;
  }

  /**
   * NUEVO: Inicia limpieza automática periódica
   */
  startAutomaticCleanup(intervalInMs: number = 5 * 60 * 1000): void {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, intervalInMs);

  }

  /**
   * Obtiene información sobre el estado del caché
   */
  getCacheInfo(): { totalEntries: number, keys: string[] } {
    return {
      totalEntries: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Verifica si una clave específica existe en el caché
   */
  hasCache(key: string): boolean {
    return this.cache.has(key) && !this.isCacheExpired(key);
  }

  /**
   * Método simple para limpiar caché sin bucles
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }

  /**
 * Invalida caché específico de productos de manera más agresiva
 */
  invalidateProductCache(productId?: string): void {

    if (productId) {
      // Invalidar cachés específicos del producto
      const productKeys = [
        `products_${productId}`,
        `products_complete_${productId}`,
        `product_variants_product_${productId}`,
        `products_related_${productId}`
      ];

      this.invalidateMultiple(productKeys);
    }

    // Invalidar cachés generales
    const generalKeys = [
      'products',
      'products_featured',
      'products_bestselling',
      'products_new',
      'products_discounted'
    ];

    this.invalidateMultiple(generalKeys);

    // Invalidar patrones de categorías
    this.invalidatePattern('products_category_');
  }


  /**
   * NUEVO: Precargar caché para claves específicas
   */
  preloadCache<T>(key: string, dataFactory: () => Observable<T>): Observable<T> {
    return this.getCached(key, dataFactory);
  }

  /**
   * NUEVO: Obtener datos del caché sin activar la carga si no existe
   */
  getCacheOnly<T>(key: string): Observable<T> | null {
    if (this.hasCache(key)) {
      return this.cache.get(key) as Observable<T>;
    }
    return null;
  }
}