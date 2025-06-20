// src/app/services/admin/promotion/promotion-state.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, filter, Observable, Subject } from 'rxjs';
import { Product, Promotion } from '../../../models/models';

export interface PromotionChangeEvent {
  type: 'created' | 'updated' | 'deleted' | 'applied' | 'removed';
  promotionId: string;
  productId?: string;
  promotion?: Promotion;
  affectedProducts?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class PromotionStateService {
  // 📡 EVENTOS DE CAMBIO DE PROMOCIONES
  private promotionChanges$ = new Subject<PromotionChangeEvent>();
  
  // 🔄 ESTADO DE PRODUCTOS CON PROMOCIONES APLICADAS
  private productsWithPromotions$ = new BehaviorSubject<Map<string, Promotion[]>>(new Map());
  
  // 📊 CACHE DE PROMOCIONES ACTIVAS
  private activePromotions$ = new BehaviorSubject<Promotion[]>([]);

  constructor() {
  }

  // ==================== EMISIÓN DE EVENTOS ====================

  /**
   * 🚀 Notifica cambios en promociones (CRUD)
   */
  notifyPromotionChange(event: PromotionChangeEvent): void {
    console.log('📢 [PROMOTION STATE] Cambio notificado:', event);
    this.promotionChanges$.next(event);
  }

  /**
   * 🎯 Notifica creación de promoción
   */
  notifyPromotionCreated(promotion: Promotion): void {
    this.notifyPromotionChange({
      type: 'created',
      promotionId: promotion.id,
      promotion
    });
    
    // Actualizar cache de promociones activas
    this.updateActivePromotionsCache();
  }

  /**
   * 🔄 Notifica actualización de promoción
   */
  notifyPromotionUpdated(promotionId: string, promotion: Promotion): void {
    this.notifyPromotionChange({
      type: 'updated',
      promotionId,
      promotion
    });
    
    this.updateActivePromotionsCache();
  }

  /**
   * 🗑️ Notifica eliminación de promoción
   */
  notifyPromotionDeleted(promotionId: string): void {
    this.notifyPromotionChange({
      type: 'deleted',
      promotionId
    });
    
    this.updateActivePromotionsCache();
    this.removePromotionFromProducts(promotionId);
  }

  /**
   * ✅ Notifica aplicación de promoción a producto
   */
  notifyPromotionApplied(productId: string, promotion: Promotion): void {
    this.notifyPromotionChange({
      type: 'applied',
      promotionId: promotion.id,
      productId,
      promotion
    });
    
    // Actualizar mapa de productos con promociones
    this.addPromotionToProduct(productId, promotion);
  }

  /**
   * ❌ Notifica eliminación de promoción de producto
   */
  notifyPromotionRemoved(productId: string, promotionId: string): void {
    this.notifyPromotionChange({
      type: 'removed',
      promotionId,
      productId
    });
    
    // Actualizar mapa de productos con promociones
    this.removePromotionFromProduct(productId, promotionId);
  }

  // ==================== SUSCRIPCIÓN A EVENTOS ====================

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

  // ==================== GESTIÓN DE ESTADO ====================

  /**
   * 🔄 Actualiza cache de promociones activas
   */
  private updateActivePromotionsCache(): void {
    // Este método se podría integrar con PromotionService
    // Por ahora es un placeholder
    console.log('🔄 [PROMOTION STATE] Actualizando cache de promociones activas');
  }

  /**
   * ➕ Agrega promoción a producto en el estado
   */
  private addPromotionToProduct(productId: string, promotion: Promotion): void {
    const currentMap = this.productsWithPromotions$.value;
    const existingPromotions = currentMap.get(productId) || [];
    
    // Evitar duplicados
    const updatedPromotions = existingPromotions.filter(p => p.id !== promotion.id);
    updatedPromotions.push(promotion);
    
    currentMap.set(productId, updatedPromotions);
    this.productsWithPromotions$.next(new Map(currentMap));
    
    console.log(`✅ [PROMOTION STATE] Promoción ${promotion.id} agregada al producto ${productId}`);
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
    
    console.log(`➖ [PROMOTION STATE] Promoción ${promotionId} eliminada del producto ${productId}`);
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
    
    console.log(`🗑️ [PROMOTION STATE] Promoción ${promotionId} eliminada de todos los productos`);
  }

  // ==================== UTILIDADES ====================

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
    console.log('🧹 [PROMOTION STATE] Estado limpiado');
  }

  /**
   * 📊 Debug: Mostrar estado actual
   */
  debugState(): void {
    console.group('🎯 [PROMOTION STATE DEBUG]');
    
    const productsMap = this.productsWithPromotions$.value;
    const activePromotions = this.activePromotions$.value;
    
    console.log('📦 Productos con promociones:', productsMap.size);
    productsMap.forEach((promotions, productId) => {
      console.log(`   ${productId}: ${promotions.length} promociones`);
    });
    
    console.log('📊 Promociones activas:', activePromotions.length);
    
    console.groupEnd();
  }
}