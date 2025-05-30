// src/services/shared/stock-update.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, filter, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { CacheService } from '../cache/cache.service';

export interface StockUpdate {
  productId: string;
  variantId: string;
  stockChange: number; // +5, -2, etc.
  newStock: number;    // Stock actual después del cambio
  timestamp: Date;
  source: 'admin' | 'purchase' | 'restock' | 'transfer';
  metadata?: {
    colorName?: string;
    sizeName?: string;
    productName?: string;
    userAction?: string;
    previousStock?: number;
  };
}

export interface ProductStockSummary {
  productId: string;
  totalStock: number;
  variantStocks: { [variantId: string]: number };
  lastUpdate: Date;
}

@Injectable({
  providedIn: 'root'
})
export class StockUpdateService {
  // 📊 Estado principal de actualizaciones
  private stockUpdates$ = new Subject<StockUpdate>();

  // 📈 Resumen de stock por producto (para evitar cálculos repetitivos)
  private productStockSummary$ = new BehaviorSubject<Map<string, ProductStockSummary>>(new Map());

  // 🔄 Control de operaciones pendientes
  private pendingUpdates = new Map<string, StockUpdate>();

  constructor(private cacheService: CacheService) {
    console.log('📦 StockUpdateService inicializado');
    this.setupStockAggregation();
  }

  // ==================== EMISIÓN DE EVENTOS ====================

  /**
   * 🚀 Notifica un cambio de stock (llamado desde admin/carrito)
   */
  notifyStockChange(update: StockUpdate): void {
    console.log('📢 Notificando cambio de stock:', {
      productId: update.productId,
      variantId: update.variantId,
      change: update.stockChange,
      newStock: update.newStock,
      source: update.source
    });

    // ✅ Validar datos
    if (!this.isValidStockUpdate(update)) {
      console.warn('⚠️ Actualización de stock inválida:', update);
      return;
    }

    // 🔄 Manejar operaciones duplicadas
    const key = `${update.productId}-${update.variantId}`;

    if (this.pendingUpdates.has(key)) {
      console.log('🔄 Combinando actualizaciones duplicadas...');
      const existing = this.pendingUpdates.get(key)!;
      update.stockChange += existing.stockChange;
    }

    this.pendingUpdates.set(key, update);

    // 📤 Emitir evento
    this.stockUpdates$.next(update);

    // 🗑️ Invalidar caché relacionado
    this.invalidateRelatedCache(update.productId);

    // 📊 Actualizar resumen de producto
    this.updateProductSummary(update);

    // 🧹 Limpiar operación pendiente después de un tiempo
    setTimeout(() => {
      this.pendingUpdates.delete(key);
    }, 1000);
  }

  broadcastStockUpdate(update: StockUpdate): void {
    this.stockUpdates$.next(update);
    
    // 🚀 CAMBIO: Invalidación selectiva en lugar de agresiva
    this.cacheService.invalidate(`products_${update.productId}`);
    this.cacheService.invalidate(`products_complete_${update.productId}`);
    
    // Solo invalidar productos generales si es una operación crítica
    if (update.source === 'restock' || Math.abs(update.stockChange) > 10) {
        this.cacheService.invalidate('products');
    }
    
    console.log('📢 Stock actualizado selectivamente');
}

  

  /**
   * 🎯 Notifica múltiples cambios en lote (optimización)
   */
  notifyBatchStockChanges(updates: StockUpdate[]): void {
    console.log(`📢 Notificando ${updates.length} cambios de stock en lote`);

    updates.forEach(update => {
      if (this.isValidStockUpdate(update)) {
        this.stockUpdates$.next(update);
        this.updateProductSummary(update);
      }
    });

    // Invalidar caché de productos únicos
    const uniqueProductIds = [...new Set(updates.map(u => u.productId))];
    uniqueProductIds.forEach(productId => {
      this.invalidateRelatedCache(productId);
    });
  }

  // ==================== SUSCRIPCIÓN A EVENTOS ====================

  /**
   * 👂 Escucha cambios de stock (para componentes de e-commerce)
   */
  onStockUpdate(): Observable<StockUpdate> {
    return this.stockUpdates$.asObservable().pipe(
      debounceTime(100), // Evitar spam de eventos
      distinctUntilChanged((prev, curr) =>
        prev.productId === curr.productId &&
        prev.variantId === curr.variantId &&
        prev.newStock === curr.newStock
      )
    );
  }

  /**
   * 🎯 Escucha cambios para un producto específico
   */
  onProductStockUpdate(productId: string): Observable<StockUpdate> {
    return this.onStockUpdate().pipe(
      filter(update => update.productId === productId)
    );
  }

  /**
   * 🧬 Escucha cambios para una variante específica
   */
  onVariantStockUpdate(variantId: string): Observable<StockUpdate> {
    return this.onStockUpdate().pipe(
      filter(update => update.variantId === variantId)
    );
  }

  /**
   * 📊 Obtiene el resumen de stock de un producto
   */
  getProductStockSummary(productId: string): Observable<ProductStockSummary | undefined> {
    return this.productStockSummary$.pipe(
      filter(summaries => summaries.has(productId)),
      map(summaries => summaries.get(productId))
    );
  }

  // ==================== MÉTODOS AUXILIARES ====================

  /**
   * ✅ Valida si la actualización de stock es correcta
   */
  private isValidStockUpdate(update: StockUpdate): boolean {
    const isValid = !!(
      update.productId?.trim() &&
      update.variantId?.trim() &&
      typeof update.stockChange === 'number' &&
      typeof update.newStock === 'number' &&
      update.newStock >= 0 && // Stock no puede ser negativo
      update.timestamp instanceof Date &&
      update.source
    );

    if (!isValid) {
      console.error('❌ Actualización de stock inválida:', {
        hasProductId: !!update.productId,
        hasVariantId: !!update.variantId,
        hasValidStockChange: typeof update.stockChange === 'number',
        hasValidNewStock: typeof update.newStock === 'number' && update.newStock >= 0,
        hasTimestamp: update.timestamp instanceof Date,
        hasSource: !!update.source
      });
    }

    return isValid;
  }

  /**
   * 🗑️ Invalida caché relacionado con el producto
   */
  private invalidateRelatedCache(productId: string): void {
    const cacheKeys = [
      `products_${productId}`,
      `products_complete_${productId}`,
      `product_variants_product_${productId}`,
      'products', // Caché general
      'products_featured',
      'products_bestselling'
    ];

    cacheKeys.forEach(key => {
      this.cacheService.invalidate(key);
    });

    console.log('🗑️ Caché invalidado para producto:', productId);
  }

  /**
   * 📊 Actualiza el resumen de stock del producto
   */
  private updateProductSummary(update: StockUpdate): void {
    const currentSummaries = this.productStockSummary$.value;
    let productSummary = currentSummaries.get(update.productId);

    if (!productSummary) {
      // Crear nuevo resumen
      productSummary = {
        productId: update.productId,
        totalStock: 0,
        variantStocks: {},
        lastUpdate: update.timestamp
      };
    }

    // Actualizar stock de la variante
    const oldVariantStock = productSummary.variantStocks[update.variantId] || 0;
    productSummary.variantStocks[update.variantId] = update.newStock;

    // Recalcular stock total
    productSummary.totalStock = Object.values(productSummary.variantStocks)
      .reduce((total, stock) => total + stock, 0);

    productSummary.lastUpdate = update.timestamp;

    // Actualizar mapa
    currentSummaries.set(update.productId, productSummary);
    this.productStockSummary$.next(currentSummaries);

    console.log('📊 Resumen actualizado:', {
      productId: update.productId,
      oldVariantStock,
      newVariantStock: update.newStock,
      totalStock: productSummary.totalStock
    });
  }

  /**
   * 🔄 Configura agregación de stock para evitar eventos duplicados
   */
  private setupStockAggregation(): void {
    // Limpiar operaciones pendientes periódicamente
    setInterval(() => {
      const now = Date.now();
      const expiredKeys: string[] = [];

      this.pendingUpdates.forEach((update, key) => {
        if (now - update.timestamp.getTime() > 5000) { // 5 segundos
          expiredKeys.push(key);
        }
      });

      expiredKeys.forEach(key => {
        this.pendingUpdates.delete(key);
      });

      if (expiredKeys.length > 0) {
        console.log(`🧹 Limpiadas ${expiredKeys.length} operaciones pendientes expiradas`);
      }
    }, 10000); // Cada 10 segundos
  }

  // ==================== MÉTODOS DE UTILIDAD PÚBLICA ====================

  /**
   * 📈 Obtiene estadísticas de actualizaciones recientes
   */
  getRecentUpdateStats(): {
    pendingOperations: number;
    trackedProducts: number;
    lastUpdateTime: Date | null;
  } {
    const summaries = this.productStockSummary$.value;
    let lastUpdate: Date | null = null;

    summaries.forEach(summary => {
      if (!lastUpdate || summary.lastUpdate > lastUpdate) {
        lastUpdate = summary.lastUpdate;
      }
    });

    return {
      pendingOperations: this.pendingUpdates.size,
      trackedProducts: summaries.size,
      lastUpdateTime: lastUpdate
    };
  }

  /**
   * 🧹 Limpia el estado del servicio (útil para testing)
   */
  clearState(): void {
    console.log('🧹 Limpiando estado del StockUpdateService');
    this.pendingUpdates.clear();
    this.productStockSummary$.next(new Map());
  }

  /**
   * 🔍 Debug: Muestra el estado actual del servicio
   */
  debugState(): void {
    const stats = this.getRecentUpdateStats();

    console.group('📦 [STOCK UPDATE SERVICE DEBUG]');
    console.log('📊 Estadísticas:', stats);
    console.log('🔄 Operaciones pendientes:', Array.from(this.pendingUpdates.entries()));
    console.log('📈 Resúmenes de productos:', Array.from(this.productStockSummary$.value.entries()));
    console.groupEnd();
  }

  /**
   * 🎯 Simula una actualización de stock (útil para testing)
   */
  simulateStockUpdate(productId: string, variantId: string, stockChange: number): void {
    const mockUpdate: StockUpdate = {
      productId,
      variantId,
      stockChange,
      newStock: Math.max(0, stockChange), // Asume que el stock anterior era 0
      timestamp: new Date(),
      source: 'admin',
      metadata: {
        userAction: 'simulation'
      }
    };

    console.log('🎭 Simulando actualización de stock:', mockUpdate);
    this.notifyStockChange(mockUpdate);
  }
}