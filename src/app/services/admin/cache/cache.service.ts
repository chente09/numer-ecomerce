import { Injectable } from '@angular/core';
import { Observable, Subject, of } from 'rxjs';
import { shareReplay, tap, take, finalize } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private invalidationNotifiers: Map<string, Subject<void>> = new Map();
  private invalidatingCache = false;
  private cacheTTL: Map<string, number> = new Map();
  
  // 🆕 NUEVO: Control de logging para evitar spam
  private debugMode = false;
  private logThrottle: Map<string, number> = new Map();
  private readonly LOG_THROTTLE_MS = 1000; // 1 segundo entre logs similares

  constructor() {
    this.cacheTTL.set('products', 5 * 60 * 1000);
    this.cacheTTL.set('categories', 30 * 60 * 1000);
    this.cacheTTL.set('colors', 60 * 60 * 1000);
    this.cacheTTL.set('sizes', 60 * 60 * 1000);
    this.cacheTTL.set('variants', 2 * 60 * 1000);
  }

  // 🛠️ SOLUCIÓN: Logging controlado y throttled
  private log(message: string, force = false): void {
    if (!this.debugMode && !force) return;

    const now = Date.now();
    const lastLog = this.logThrottle.get(message) || 0;
    
    if (now - lastLog > this.LOG_THROTTLE_MS || force) {
      console.log(message);
      this.logThrottle.set(message, now);
    }
  }

  // 🔧 Habilitar/deshabilitar modo debug
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    console.log(`🐛 [CACHE] Debug mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  // ✅ CORREGIDO: getCached sin logs excesivos
  getCached<T>(key: string, dataFactory: () => Observable<T>): Observable<T> {

    if (this.isCacheExpired(key)) {
      this.invalidate(key);
    }

    const cachedData = this.cache.get(key);
    if (cachedData && !this.isCacheExpired(key)) {
      return of(cachedData.data);
    }

    return dataFactory().pipe(
      take(1),
      tap(data => {
        this.log(`💾 [CACHE] Guardando datos para: ${key}`);
        this.cache.set(key, {
          data,
          timestamp: Date.now()
        });
      }),
      finalize(() => {
        this.log(`🏁 [CACHE] Observable completado para: ${key}`);
      })
    );
  }

  getCachedWithReplay<T>(key: string, dataFactory: () => Observable<T>): Observable<T> {
    if (this.isCacheExpired(key)) {
      this.invalidate(key);
    }

    if (!this.invalidationNotifiers.has(key)) {
      this.invalidationNotifiers.set(key, new Subject<void>());
    }

    const cachedData = this.cache.get(key);
    if (cachedData && !this.isCacheExpired(key)) {
      return of(cachedData.data);
    }

    return dataFactory().pipe(
      take(1),
      tap(data => {
        this.cache.set(key, {
          data,
          timestamp: Date.now()
        });
      }),
      shareReplay({
        bufferSize: 1,
        refCount: true
      })
    );
  }

  private isCacheExpired(key: string): boolean {
    const cachedData = this.cache.get(key);
    if (!cachedData) {
      return false;
    }

    let ttl = this.getTTLForKey(key);
    const isExpired = (Date.now() - cachedData.timestamp) > ttl;

    if (isExpired) {
      this.log(`⏰ [CACHE] Expirado: ${key} (${Math.round((Date.now() - cachedData.timestamp) / 1000)}s > ${Math.round(ttl / 1000)}s)`);
    }

    return isExpired;
  }

  private getTTLForKey(key: string): number {
    if (this.cacheTTL.has(key)) {
      return this.cacheTTL.get(key)!;
    }

    for (const [prefix, ttl] of this.cacheTTL.entries()) {
      if (key.startsWith(prefix)) {
        return ttl;
      }
    }

    return 5 * 60 * 1000;
  }

  // ✅ CORREGIDO: invalidate sin setTimeout problemático
  invalidate(key: string): void {
    if (this.invalidatingCache) {
      return;
    }

    this.invalidatingCache = true;

    try {
      if (this.cache.has(key)) {
        this.cache.delete(key);
        this.log(`✅ [CACHE] Eliminado: ${key}`);
      }

      const notifier = this.invalidationNotifiers.get(key);
      if (notifier) {
        notifier.next();
      }

      // 🔧 CORREGIDO: Solo invalidar productos relacionados si es necesario
      if (key === 'products') {
        this.invalidateProductRelatedSafe();
      }
    } finally {
      // ✅ MEJOR: Reset inmediato en lugar de setTimeout
      this.invalidatingCache = false;
    }
  }

  // ✅ NUEVO: Versión segura sin bucles de invalidación de productos
  private invalidateProductRelatedSafe(): void {
    const keysToInvalidate = [
      'products_featured',
      'products_bestselling', 
      'products_new',
      'products_discounted'
    ];

    // 🔧 Invalidación silenciosa para evitar logs excesivos
    keysToInvalidate.forEach(key => {
      if (this.cache.has(key)) {
        this.cache.delete(key);
        const notifier = this.invalidationNotifiers.get(key);
        if (notifier) {
          notifier.next();
        }
      }
    });

    // Invalidar patrones específicos sin logging excesivo
    this.invalidatePatternSilent('products_category_');
    this.invalidatePatternSilent('products_complete_');
    this.invalidatePatternSilent('products_related_');

    this.log(`🗑️ [CACHE] Productos relacionados invalidados silenciosamente`);
  }

  // ✅ NUEVO: Versión silenciosa de invalidatePattern
  private invalidatePatternSilent(pattern: string): void {
    const keysToDelete: string[] = [];

    for (const [cacheKey] of this.cache) {
      if (cacheKey.startsWith(pattern)) {
        keysToDelete.push(cacheKey);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      const notifier = this.invalidationNotifiers.get(key);
      if (notifier) {
        notifier.next();
      }
    });
  }

  invalidateMultiple(keys: string[]): void {
    keys.forEach(key => {
      if (this.cache.has(key)) {
        this.cache.delete(key);
        const notifier = this.invalidationNotifiers.get(key);
        if (notifier) {
          notifier.next();
        }
      }
    });
    
    this.log(`🗑️ [CACHE] Invalidadas ${keys.length} claves múltiples`);
  }

  // ✅ CORREGIDO: invalidatePattern con logging controlado
  invalidatePattern(pattern: string): void {
    const keysToDelete: string[] = [];

    for (const [cacheKey] of this.cache) {
      if (cacheKey.startsWith(pattern)) {
        keysToDelete.push(cacheKey);
      }
    }

    if (keysToDelete.length > 0) {
      this.invalidateMultiple(keysToDelete);
      this.log(`🗑️ [CACHE] Patrón ${pattern}: ${keysToDelete.length} entradas`, true);
    }
  }

  forceReload<T>(key: string, dataFactory: () => Observable<T>): Observable<T> {
    this.invalidate(key);
    return this.getCached(key, dataFactory);
  }

  getInvalidationNotifier(key: string): Observable<void> {
    if (!this.invalidationNotifiers.has(key)) {
      this.invalidationNotifiers.set(key, new Subject<void>());
    }
    return this.invalidationNotifiers.get(key)!.asObservable();
  }

  // ✅ CORREGIDO: invalidateAll sin setTimeout problemático
  invalidateAll(): void {
    if (this.invalidatingCache) {
      return;
    }

    this.invalidatingCache = true;

    try {
      const cacheSize = this.cache.size;
      this.cache.clear();

      this.invalidationNotifiers.forEach((notifier, key) => {
        try {
          notifier.next();
        } catch (error) {
          console.error(`❌ [CACHE] Error notificando invalidación para ${key}:`, error);
        }
      });

      this.log(`🧹 [CACHE] Limpiadas todas las entradas (${cacheSize})`, true);
    } finally {
      this.invalidatingCache = false;
    }
  }

  invalidateProduct(productId: string): void {
    if (this.invalidatingCache) {
      return;
    }

    const productKeys = [
      `products_${productId}`,
      `products_complete_${productId}`,
      `products_related_${productId}`
    ];

    this.invalidateMultiple(productKeys);
  }

  invalidateCategory(categoryId: string): void {
    if (this.invalidatingCache) {
      return;
    }

    const categoryKeys = [
      `categories_${categoryId}`,
      `products_category_${categoryId}`,
      'categories'
    ];

    this.invalidateMultiple(categoryKeys);
  }

  setTTL(keyOrPattern: string, ttlInMs: number): void {
    this.cacheTTL.set(keyOrPattern, ttlInMs);
  }

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

    this.cache.forEach((value, key) => {
      sizes[key] = JSON.stringify(value.data).length;
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

  cleanupExpiredCache(): number {
    let cleanedCount = 0;
    const keysToClean: string[] = [];

    this.cache.forEach((value, key) => {
      if (this.isCacheExpired(key)) {
        keysToClean.push(key);
      }
    });

    keysToClean.forEach(key => {
      this.cache.delete(key);
      cleanedCount++;
    });

    if (cleanedCount > 0) {
      this.log(`🧹 [CACHE] Limpiadas ${cleanedCount} entradas expiradas`, true);
    }

    return cleanedCount;
  }

  startAutomaticCleanup(intervalInMs: number = 5 * 60 * 1000): void {
    setInterval(() => {
      const cleaned = this.cleanupExpiredCache();
      // Solo log si realmente limpió algo
      if (cleaned > 0) {
        this.log(`🧹 [CACHE] Limpieza automática: ${cleaned} entradas eliminadas`, true);
      }
    }, intervalInMs);
  }

  getCacheInfo(): { totalEntries: number, keys: string[] } {
    const info = {
      totalEntries: this.cache.size,
      keys: Array.from(this.cache.keys())
    };

    this.log(`📊 [CACHE] Info actual: ${info.totalEntries} entradas`);
    return info;
  }

  hasCache(key: string): boolean {
    const hasValidCache = this.cache.has(key) && !this.isCacheExpired(key);
    this.log(`🔍 [CACHE] ¿Tiene caché válido ${key}? ${hasValidCache}`);
    return hasValidCache;
  }

  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.log(`🧹 [CACHE] Cache limpiado (${size} entradas)`, true);
  }

  // ✅ CORREGIDO: Versión simplificada sin bucles
  invalidateProductCache(productId?: string): void {
    const keysToInvalidate: string[] = [];

    if (productId) {
      keysToInvalidate.push(
        `products_${productId}`,
        `products_complete_${productId}`,
        `product_variants_product_${productId}`,
        `products_related_${productId}`
      );
    }

    keysToInvalidate.push(
      'products',
      'products_featured',
      'products_bestselling',
      'products_new',
      'products_discounted'
    );

    this.invalidateMultiple(keysToInvalidate);
    this.invalidatePatternSilent('products_category_');
  }

  preloadCache<T>(key: string, dataFactory: () => Observable<T>): Observable<T> {
    return this.getCached(key, dataFactory);
  }

  getCacheOnly<T>(key: string): Observable<T> | null {
    if (this.hasCache(key)) {
      const cachedData = this.cache.get(key);
      return of(cachedData!.data);
    }
    return null;
  }

  // ✅ CORREGIDO: debugCache sin logging excesivo
  debugCache(): void {
    console.group('🐛 [CACHE DEBUG]');
    
    const stats = this.getCacheStats();

    if (stats.totalEntries > 0) {
      const tableData = stats.keys.map(key => {
        const data = this.cache.get(key);
        return {
          key,
          timestamp: stats.timestamps[key].toLocaleTimeString(),
          ttl: `${Math.round(stats.ttls[key] / 1000)}s`,
          expired: this.isCacheExpired(key) ? '⚠️ SÍ' : '✅ NO',
          size: `${Math.round(stats.sizes[key] / 1024)}KB`
        };
      });
      
      console.table(tableData);
    } else {
      console.log('🤷‍♂️ No hay entradas en el caché');
    }

    console.groupEnd();
  }
}