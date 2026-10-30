// src/app/services/admin/promotion/promotion-state.service.ts
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, filter, Observable, Subject } from 'rxjs';
import { Product, Promotion } from '../../../models/models';
import { SiteRebuildService } from '../../site-rebuild/site-rebuild.service';

export interface PromotionChangeEvent {
  type: 'created' | 'updated' | 'deleted' | 'applied' | 'removed' | 'activated' | 'deactivated';
  promotionId: string;
  productId?: string;
  promotion?: Promotion;
  affectedProducts?: string[];
  // 🆕 NUEVOS CAMPOS para broadcasting
  timestamp?: Date;
  source?: 'admin' | 'system' | 'schedule';
  reason?: string;
}

// 🆕 NUEVA INTERFACE para actualizaciones globales
export interface GlobalPromotionUpdate {
  action: 'promotion_changed' | 'product_promotion_changed' | 'bulk_update';
  data: PromotionChangeEvent;
  affectedComponents: string[];
}

export interface GlobalUpdateEvent {
  type: string;
  data: any;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class PromotionStateService {
  private siteRebuild = inject(SiteRebuildService);
  // 📡 EVENTOS DE CAMBIO DE PROMOCIONES (existente)
  private promotionChanges$ = new Subject<PromotionChangeEvent>();

  // 🔄 ESTADO DE PRODUCTOS CON PROMOCIONES APLICADAS (existente)
  private productsWithPromotions$ = new BehaviorSubject<Map<string, Promotion[]>>(new Map());

  // 📊 CACHE DE PROMOCIONES ACTIVAS (existente)
  private activePromotions$ = new BehaviorSubject<Promotion[]>([]);

  // 🆕 NUEVOS SUBJECTS para broadcasting global
  private globalUpdates$ = new Subject<GlobalPromotionUpdate>();
  private componentRegistrations$ = new BehaviorSubject<Set<string>>(new Set());

  private broadcastChannel: BroadcastChannel | null = null;
  private readonly CHANNEL_NAME = 'numer-promotions';


  constructor() {
    this.initCrossWindowCommunication();
  }

  // 🆕 AGREGAR: Inicializar canal de comunicación
  private initCrossWindowCommunication(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(this.CHANNEL_NAME);

        this.broadcastChannel.onmessage = (event) => {

          // Emitir el evento a los componentes locales
          this.promotionChanges$.next(event.data);

          const globalUpdate: GlobalPromotionUpdate = {
            action: 'promotion_changed',
            data: event.data,
            affectedComponents: Array.from(this.componentRegistrations$.value)
          };

          this.globalUpdates$.next(globalUpdate);
        };
      } catch (error) {
        console.error('📡 [CROSS-WINDOW] Error:', error);
      }
    }
  }

  // ==================== 🆕 NUEVOS MÉTODOS DE BROADCASTING ====================

  /**
   * 📢 BROADCASTING GLOBAL - Notifica a TODOS los componentes
   */
  broadcastGlobalUpdate(event: PromotionChangeEvent): void {
    // Every promotion change (created, edited, applied, paused...) funnels through here: prices on the storefront change
    this.siteRebuild.notify('promotion');

    // Enriquecer evento con timestamp si no lo tiene
    const enrichedEvent = {
      ...event,
      timestamp: event.timestamp || new Date(),
      source: event.source || 'admin'
    };

    // Notificar por el canal normal
    this.promotionChanges$.next(enrichedEvent);

    // 🆕 NOTIFICAR POR EL CANAL GLOBAL
    const globalUpdate: GlobalPromotionUpdate = {
      action: 'promotion_changed',
      data: enrichedEvent,
      affectedComponents: Array.from(this.componentRegistrations$.value)
    };

    this.globalUpdates$.next(globalUpdate);

    // 🆕 AGREGAR: Enviar a otras ventanas (solo 3 líneas)
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(enrichedEvent);
    }
  }

  /**
   * 👂 ESCUCHAR actualizaciones globales
   */
  onGlobalUpdate(): Observable<GlobalPromotionUpdate> {
    return this.globalUpdates$.asObservable();
  }

  /**
   * 📝 REGISTRAR componente para actualizaciones
   */
  registerComponent(componentName: string): void {
    const current = this.componentRegistrations$.value;
    current.add(componentName);
    this.componentRegistrations$.next(new Set(current));
  }

  /**
   * 🗑️ DESREGISTRAR componente
   */
  unregisterComponent(componentName: string): void {
    const current = this.componentRegistrations$.value;
    current.delete(componentName);
    this.componentRegistrations$.next(new Set(current));
  }

  // ==================== 🔧 MODIFICACIONES A MÉTODOS EXISTENTES ====================

  /**
   * 🚀 Notifica cambios en promociones (MODIFICADO)
   */
  notifyPromotionChange(event: PromotionChangeEvent): void {
    console.log('📢 [PROMOTION STATE] Cambio notificado:', event);

    // 🆕 USAR EL NUEVO BROADCASTING
    this.broadcastGlobalUpdate(event);
  }

  /**
   * 🎯 Notifica creación de promoción (MODIFICADO)
   */
  notifyPromotionCreated(promotion: Promotion): void {
    this.broadcastGlobalUpdate({
      type: 'created',
      promotionId: promotion.id,
      promotion,
      timestamp: new Date(),
      source: 'admin'
    });

    this.updateActivePromotionsCache();
  }

  /**
   * 🔄 Notifica actualización de promoción (MODIFICADO)
   */
  notifyPromotionUpdated(promotionId: string, promotion: Promotion): void {
    this.broadcastGlobalUpdate({
      type: 'updated',
      promotionId,
      promotion,
      timestamp: new Date(),
      source: 'admin'
    });

    this.updateActivePromotionsCache();
  }

  /**
   * 🗑️ Notifica eliminación de promoción (MODIFICADO)
   */
  notifyPromotionDeleted(promotionId: string): void {
    this.broadcastGlobalUpdate({
      type: 'deleted',
      promotionId,
      timestamp: new Date(),
      source: 'admin'
    });

    this.updateActivePromotionsCache();
    this.removePromotionFromProducts(promotionId);
  }

  /**
   * ✅ Notifica aplicación de promoción a producto (MODIFICADO)
   */
  notifyPromotionApplied(productId: string, promotion: Promotion): void {
    this.broadcastGlobalUpdate({
      type: 'applied',
      promotionId: promotion.id,
      productId,
      promotion,
      affectedProducts: [productId],
      timestamp: new Date(),
      source: 'admin'
    });

    this.addPromotionToProduct(productId, promotion);
  }

  /**
   * ❌ Notifica eliminación de promoción de producto (MODIFICADO)
   */
  notifyPromotionRemoved(productId: string, promotionId: string): void {
    this.broadcastGlobalUpdate({
      type: 'removed',
      promotionId,
      productId,
      affectedProducts: [productId],
      timestamp: new Date(),
      source: 'admin'
    });

    this.removePromotionFromProduct(productId, promotionId);
  }

  // 🆕 NUEVOS MÉTODOS para acciones específicas

  /**
   * 🟢 Notifica activación de promoción
   */
  notifyPromotionActivated(promotionId: string, affectedProductIds?: string[]): void {
    this.broadcastGlobalUpdate({
      type: 'activated',
      promotionId,
      affectedProducts: affectedProductIds,
      timestamp: new Date(),
      source: 'admin',
      reason: 'Promoción activada por administrador'
    });
  }

  /**
   * 🔴 Notifica desactivación de promoción
   */
  notifyPromotionDeactivated(promotionId: string, affectedProductIds?: string[]): void {
    this.broadcastGlobalUpdate({
      type: 'deactivated',
      promotionId,
      affectedProducts: affectedProductIds,
      timestamp: new Date(),
      source: 'admin',
      reason: 'Promoción desactivada por administrador'
    });
  }

  // ==================== MÉTODOS EXISTENTES (sin cambios) ====================

  /**
   * 👂 Escucha todos los cambios de promociones
   */
  onPromotionChange(): Observable<PromotionChangeEvent> {
    return this.promotionChanges$.asObservable();
  }

  /**
   * 🎯 Escucha cambios específicos de un tipo
   */
  onPromotionChangeByType(type: PromotionChangeEvent['type']): Observable<PromotionChangeEvent> {
    return this.promotionChanges$.asObservable().pipe(
      filter(event => event.type === type)
    );
  }

  /**
   * 📦 Escucha cambios para un producto específico
   */
  onProductPromotionChange(productId: string): Observable<PromotionChangeEvent> {
    return this.promotionChanges$.asObservable().pipe(
      filter(event => event.productId === productId)
    );
  }

  /**
   * 🗺️ Obtiene estado actual de productos con promociones
   */
  getProductsWithPromotions(): Observable<Map<string, Promotion[]>> {
    return this.productsWithPromotions$.asObservable();
  }

  /**
   * 📊 Obtiene promociones activas
   */
  getActivePromotions(): Observable<Promotion[]> {
    return this.activePromotions$.asObservable();
  }

  // ==================== MÉTODOS PRIVADOS (sin cambios) ====================

  /**
   * 🔄 Actualiza cache de promociones activas
   */
  private updateActivePromotionsCache(): void {
    console.log('🔄 [PROMOTION STATE] Actualizando cache de promociones activas');
  }

  /**
   * ➕ Agrega promoción a producto en el estado
   */
  private addPromotionToProduct(productId: string, promotion: Promotion): void {
    const currentMap = this.productsWithPromotions$.value;
    const existingPromotions = currentMap.get(productId) || [];

    const updatedPromotions = existingPromotions.filter(p => p.id !== promotion.id);
    updatedPromotions.push(promotion);

    currentMap.set(productId, updatedPromotions);
    this.productsWithPromotions$.next(new Map(currentMap));
  }

  /**
   * ➖ Elimina promoción específica de producto
   */
  private removePromotionFromProduct(productId: string, promotionId: string): void {
    const currentMap = this.productsWithPromotions$.value;
    const existingPromotions = currentMap.get(productId) || [];

    const updatedPromotions = existingPromotions.filter(p => p.id !== promotionId);

    if (updatedPromotions.length > 0) {
      currentMap.set(productId, updatedPromotions);
    } else {
      currentMap.delete(productId);
    }

    this.productsWithPromotions$.next(new Map(currentMap));
  }

  /**
   * 🗑️ Elimina promoción de todos los productos
   */
  private removePromotionFromProducts(promotionId: string): void {
    const currentMap = this.productsWithPromotions$.value;

    for (const [productId, promotions] of currentMap.entries()) {
      const updatedPromotions = promotions.filter(p => p.id !== promotionId);

      if (updatedPromotions.length > 0) {
        currentMap.set(productId, updatedPromotions);
      } else {
        currentMap.delete(productId);
      }
    }

    this.productsWithPromotions$.next(new Map(currentMap));
  }

  // ==================== MÉTODOS DE UTILIDAD (sin cambios) ====================

  /**
   * 🔍 Verificar si un producto tiene promociones activas
   */
  hasActivePromotions(productId: string): boolean {
    const currentMap = this.productsWithPromotions$.value;
    const promotions = currentMap.get(productId) || [];
    return promotions.length > 0;
  }

  /**
   * 📋 Obtener promociones de un producto específico
   */
  getProductPromotions(productId: string): Promotion[] {
    const currentMap = this.productsWithPromotions$.value;
    return currentMap.get(productId) || [];
  }

  /**
   * 🧹 Limpiar estado (útil para testing)
   */
  clearState(): void {
    this.productsWithPromotions$.next(new Map());
    this.activePromotions$.next([]);
  }


  /**
 * Fuerza limpieza completa de caché y estado
 */
  forceFullCacheInvalidation(): void {

    // Limpiar estado interno
    this.clearState();

    // Notificar limpieza global
    this.broadcastGlobalUpdate({
      type: 'deleted',
      promotionId: 'ALL',
      affectedProducts: [],
      timestamp: new Date(),
      source: 'admin',
      reason: 'Limpieza manual de caché'
    });
  }


  /**
   * 🔧 Limpiar estado de producto específico
   */
  clearProductPromotions(productId: string): void {
    const currentMap = this.productsWithPromotions$.value;
    currentMap.delete(productId);
    this.productsWithPromotions$.next(new Map(currentMap));
  }

  /**
   * 🔧 Validar consistencia de estado
   */
  validateProductState(productId: string, expectedPromotions: string[]): boolean {
    const currentPromotions = this.getProductPromotions(productId);
    const currentIds = currentPromotions.map(p => p.id).sort();
    const expectedIds = expectedPromotions.sort();

    const isConsistent = JSON.stringify(currentIds) === JSON.stringify(expectedIds);

    if (!isConsistent) {
      console.warn(`⚠️ [PROMOTION STATE] Estado inconsistente para ${productId}:`, {
        current: currentIds,
        expected: expectedIds
      });
    }

    return isConsistent;
  }

  /**
 * 📡 Notifica un update global específico (MÉTODO NUEVO - SEGURO DE AGREGAR)
 */
  notifyGlobalUpdate(update: GlobalUpdateEvent): void {

    // Convertir el GlobalUpdateEvent a tu formato existente GlobalPromotionUpdate
    const promotionUpdate: GlobalPromotionUpdate = {
      action: 'promotion_changed',
      data: {
        type: update.data.type || 'updated',
        promotionId: update.data.promotionId || '',
        productId: update.data.affectedProducts?.[0],
        affectedProducts: update.data.affectedProducts,
        timestamp: update.timestamp,
        source: 'admin'
      },
      affectedComponents: Array.from(this.componentRegistrations$.value)
    };

    // Usar tu método existente
    this.globalUpdates$.next(promotionUpdate);
  }
}