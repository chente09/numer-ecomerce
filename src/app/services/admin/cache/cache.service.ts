import { Injectable } from '@angular/core';
import { Observable, Subject, of } from 'rxjs';
import { shareReplay, tap, take, finalize } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  // 🔧 CAMBIADO: Ahora almacena datos directamente, no observables infinitos
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  // Almacena los subjects para notificaciones de invalidación
  private invalidationNotifiers: Map<string, Subject<void>> = new Map();

  // Flag para prevenir bucles infinitos
  private invalidatingCache = false;

  // Configuración de TTL (Time To Live) para diferentes tipos de caché
  private cacheTTL: Map<string, number> = new Map();

  constructor() {
    
    // Configurar TTL por defecto (en milisegundos)
    this.cacheTTL.set('products', 5 * 60 * 1000); // 5 minutos
    this.cacheTTL.set('categories', 30 * 60 * 1000); // 30 minutos
    this.cacheTTL.set('colors', 60 * 60 * 1000); // 1 hora
    this.cacheTTL.set('sizes', 60 * 60 * 1000); // 1 hora
    this.cacheTTL.set('variants', 2 * 60 * 1000); // 2 minutos
  }

  /**
   * 🚀 CORREGIDO: Obtiene un observable del caché o lo crea si no existe
   */
  getCached<T>(key: string, dataFactory: () => Observable<T>): Observable<T> {
    
    // Verificar si el caché ha expirado
    if (this.isCacheExpired(key)) {
      this.invalidate(key);
    }

    // Si tenemos datos cacheados válidos, devolverlos inmediatamente
    const cachedData = this.cache.get(key);
    if (cachedData && !this.isCacheExpired(key)) {
      return of(cachedData.data);
    }

    // ✅ CAMBIO CRÍTICO: Usar take(1) para forzar que se complete
    return dataFactory().pipe(
      take(1), // ← ESTO ES LO MÁS IMPORTANTE: Fuerza que se complete
      tap(data => {
        this.cache.set(key, { 
          data, 
          timestamp: Date.now() 
        });
      }),
    );
  }

  /**
   * 🆕 NUEVO: Método alternativo para casos que necesiten shareReplay
   */
  getCachedWithReplay<T>(key: string, dataFactory: () => Observable<T>): Observable<T> {
    
    // Verificar si el caché ha expirado
    if (this.isCacheExpired(key)) {
      this.invalidate(key);
    }

    // Crear un Subject para manejar múltiples suscriptores
    if (!this.invalidationNotifiers.has(key)) {
      this.invalidationNotifiers.set(key, new Subject<void>());
    }

    // Si tenemos datos cacheados válidos, devolverlos
    const cachedData = this.cache.get(key);
    if (cachedData && !this.isCacheExpired(key)) {
      return of(cachedData.data);
    }

    // ✅ VERSIÓN MEJORADA: shareReplay con configuración específica
    return dataFactory().pipe(
      take(1), // ← Forzar completar
      tap(data => {
        this.cache.set(key, { 
          data, 
          timestamp: Date.now() 
        });
      }),
      shareReplay({
        bufferSize: 1,
        refCount: true // ← CRÍTICO: Se desconecta cuando no hay suscriptores
      })
    );
  }

  /**
   * Verifica si un caché ha expirado basado en su TTL
   */
  private isCacheExpired(key: string): boolean {
    const cachedData = this.cache.get(key);
    if (!cachedData) {
      return false; // No hay datos, no ha expirado
    }

    // Buscar TTL específico o usar TTL por defecto basado en el prefijo de la clave
    let ttl = this.getTTLForKey(key);

    const isExpired = (Date.now() - cachedData.timestamp) > ttl;
    
    if (isExpired) {
      console.log(`⏰ [CACHE] Expirado: ${key} (${Math.round((Date.now() - cachedData.timestamp) / 1000)}s > ${Math.round(ttl / 1000)}s)`);
    }
    
    return isExpired;
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
      // Eliminar los datos cacheados
      if (this.cache.has(key)) {
        this.cache.delete(key);
        console.log(`✅ [CACHE] Eliminado: ${key}`);
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
      console.log(`🗑️ [CACHE] Encontradas ${keysToDelete.length} claves con patrón ${pattern}: ${keysToDelete.join(', ')}`);
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

      // Notificar todas las invalidaciones
      this.invalidationNotifiers.forEach((notifier, key) => {
        try {
          notifier.next();
        } catch (error) {
          console.error(`❌ [CACHE] Error notificando invalidación para ${key}:`, error);
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
      sizes[key] = JSON.stringify(value.data).length; // Tamaño aproximado en bytes
      timestamps[key] = new Date(value.timestamp);
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

    if (cleanedCount > 0) {
      console.log(`🧹 [CACHE] Limpiadas ${cleanedCount} entradas expiradas`);
    }

    return cleanedCount;
  }

  /**
   * NUEVO: Inicia limpieza automática periódica
   */
  startAutomaticCleanup(intervalInMs: number = 5 * 60 * 1000): void {
    
    setInterval(() => {
      const cleaned = this.cleanupExpiredCache();
      if (cleaned > 0) {
        console.log(`🧹 [CACHE] Limpieza automática: ${cleaned} entradas eliminadas`);
      }
    }, intervalInMs);
  }

  /**
   * Obtiene información sobre el estado del caché
   */
  getCacheInfo(): { totalEntries: number, keys: string[] } {
    const info = {
      totalEntries: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
    
    console.log(`📊 [CACHE] Info actual:`, info);
    return info;
  }

  /**
   * Verifica si una clave específica existe en el caché
   */
  hasCache(key: string): boolean {
    const hasValidCache = this.cache.has(key) && !this.isCacheExpired(key);
    console.log(`🔍 [CACHE] ¿Tiene caché válido ${key}?`, hasValidCache);
    return hasValidCache;
  }

  /**
   * Método simple para limpiar caché sin bucles
   */
  clearCache(): void {
    this.cache.clear();
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
      const cachedData = this.cache.get(key);
      return of(cachedData!.data);
    }
    
    return null;
  }

  /**
   * 🆕 NUEVO: Método de debugging para ver el estado del caché
   */
  debugCache(): void {
    
    const stats = this.getCacheStats();
    
    if (stats.totalEntries > 0) {
      console.table(stats.keys.map(key => {
        const data = this.cache.get(key);
        return {
          key,
          timestamp: stats.timestamps[key],
          ttl: `${Math.round(stats.ttls[key] / 1000)}s`,
          expired: this.isCacheExpired(key) ? '⚠️ SÍ' : '✅ NO',
          size: `${stats.sizes[key]} bytes`
        };
      }));
    } else {
      console.log('🤷‍♂️ No hay entradas en el caché');
    }
    
    console.groupEnd();
  }
}