import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../../services/admin/product/product.service';
import { PromotionStateService, PromotionChangeEvent } from '../../../services/admin/promotionState/promotion-state.service';
import { Product } from '../../../models/models';
import { finalize, Subject, takeUntil, switchMap, take, debounceTime } from 'rxjs';

// Importar módulos ng-zorro necesarios
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-product-stats',
  standalone: true,
  imports: [
    CommonModule,
    NzStatisticModule,
    NzCardModule,
    NzGridModule,
    NzSpinModule,
    NzEmptyModule,
    NzDividerModule,
    NzTableModule,
    NzIconModule,
    NzTagModule,
    NzRateModule,
    FormsModule,
    NzIconModule
  ],
  templateUrl: './product-stats.component.html',
  styleUrls: ['./product-stats.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductStatsComponent implements OnInit, OnChanges, OnDestroy {
  @Input() product: Product | null = null;
  @Output() statsChanged = new EventEmitter<{
    productId: string;
    updatedProduct?: Product;
  }>();

  loading = false;
  salesHistory: { date: Date, sales: number }[] = [];
  stockData: any = null;
  viewsData: { period: string, count: number }[] = [];

  private destroy$ = new Subject<void>();
  private readonly COMPONENT_NAME = 'ProductStatsComponent';

  constructor(
    private productService: ProductService,
    private promotionStateService: PromotionStateService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    // 🔗 Registrar componente para actualizaciones de promociones
    this.promotionStateService.registerComponent(this.COMPONENT_NAME);
    
    // 📡 Suscribirse a cambios de promociones
    this.subscribeToPromotionChanges();
    
    if (this.product) {
      this.loadProductStats();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product'] && this.product) {
      this.loadProductStats();
    }
  }

  ngOnDestroy(): void {
    this.promotionStateService.unregisterComponent(this.COMPONENT_NAME);
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * 📡 Suscribirse a cambios de promociones
   */
  private subscribeToPromotionChanges(): void {
    // Escuchar cambios globales de promociones
    this.promotionStateService.onGlobalUpdate()
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500) // Evitar spam de actualizaciones
      )
      .subscribe(globalUpdate => {
        this.handlePromotionUpdate(globalUpdate);
      });

    // Escuchar cambios específicos del producto
    if (this.product) {
      this.promotionStateService.onProductPromotionChange(this.product.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe(event => {
          console.log(`📊 [STATS] Cambio de promoción en producto ${this.product?.id}:`, event);
          this.refreshProductStats();
        });
    }
  }

  /**
   * 🔄 Manejar actualizaciones de promociones
   */
  private handlePromotionUpdate(globalUpdate: any): void {
    const event = globalUpdate.data;
    
    // Solo actualizar si afecta a nuestro producto
    if (this.product && this.affectsCurrentProduct(event)) {
      console.log(`📊 [STATS] Actualizando estadísticas por cambio de promoción`);
      this.refreshProductStats();
    }
  }

  /**
   * 🎯 Verificar si el evento afecta al producto actual
   */
  private affectsCurrentProduct(event: PromotionChangeEvent): boolean {
    if (!this.product) return false;

    // Verificar si es el producto específico
    if (event.productId === this.product.id) return true;

    // Verificar si está en la lista de productos afectados
    if (event.affectedProducts?.includes(this.product.id)) return true;

    // Para eventos globales, asumir que puede afectar
    if (['activated', 'deactivated', 'updated'].includes(event.type) && !event.productId) {
      return true;
    }

    return false;
  }

  /**
   * 📊 Cargar estadísticas del producto
   */
  loadProductStats(): void {
    if (!this.product) return;

    this.loading = true;
    console.log(`📊 [STATS] Cargando estadísticas para producto: ${this.product.name}`);

    this.productService.getProductCompleteStats(this.product.id)
      .pipe(
        take(1),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (stats) => {
          console.log(`📊 [STATS] Estadísticas cargadas:`, stats);
          
          this.salesHistory = stats.salesHistory;
          this.viewsData = stats.viewsData;
          this.stockData = stats.stockData;

          // 🚀 Verificar si hay cambios y emitir evento
          if (this.hasStatsChanged(stats.product)) {
            this.statsChanged.emit({
              productId: stats.product.id,
              updatedProduct: stats.product
            });
          }

          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('❌ [STATS] Error al cargar estadísticas:', error);
        }
      });
  }

  /**
   * 🔄 Refrescar estadísticas forzando recarga
   */
  private refreshProductStats(): void {
    if (!this.product) return;
    
    console.log(`🔄 [STATS] Refrescando estadísticas del producto ${this.product.id}`);
    this.loadProductStats();
  }

  /**
   * 🔍 Verificar si las estadísticas han cambiado
   */
  private hasStatsChanged(updatedProduct: Product): boolean {
    if (!this.product) return false;

    const hasChanges = (
      this.product.views !== updatedProduct.views ||
      this.product.sales !== updatedProduct.sales ||
      this.product.totalStock !== updatedProduct.totalStock ||
      this.product.popularityScore !== updatedProduct.popularityScore ||
      this.product.discountPercentage !== updatedProduct.discountPercentage ||
      this.product.currentPrice !== updatedProduct.currentPrice
    );

    if (hasChanges) {
      console.log(`📊 [STATS] Cambios detectados en estadísticas:`, {
        views: `${this.product.views} → ${updatedProduct.views}`,
        sales: `${this.product.sales} → ${updatedProduct.sales}`,
        totalStock: `${this.product.totalStock} → ${updatedProduct.totalStock}`,
        discountPercentage: `${this.product.discountPercentage} → ${updatedProduct.discountPercentage}`
      });
    }

    return hasChanges;
  }

  /**
   * 📅 Formateo de datos para visualización
   */
  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  /**
   * 📊 Obtener estadísticas de rendimiento
   */
  getPerformanceStats(): {
    conversionRate: number;
    viewsToSalesRatio: number;
    stockTurnover: string;
  } {
    if (!this.product) {
      return { conversionRate: 0, viewsToSalesRatio: 0, stockTurnover: 'N/A' };
    }

    const views = this.product.views || 0;
    const sales = this.product.sales || 0;
    const totalStock = this.product.totalStock || 0;

    const conversionRate = views > 0 ? (sales / views) * 100 : 0;
    const viewsToSalesRatio = sales > 0 ? views / sales : 0;
    
    let stockTurnover = 'Bajo';
    if (totalStock === 0) {
      stockTurnover = 'Agotado';
    } else if (sales > totalStock * 0.5) {
      stockTurnover = 'Alto';
    } else if (sales > totalStock * 0.2) {
      stockTurnover = 'Medio';
    }

    return {
      conversionRate: Number(conversionRate.toFixed(2)),
      viewsToSalesRatio: Number(viewsToSalesRatio.toFixed(1)),
      stockTurnover
    };
  }

  /**
   * 🏷️ Verificar si el producto tiene promociones activas
   */
  hasActivePromotions(): boolean {
    if (!this.product) return false;
    
    return this.promotionStateService.hasActivePromotions(this.product.id) ||
           (typeof this.product.discountPercentage === 'number' && this.product.discountPercentage > 0);
  }

  /**
   * 🎯 Obtener información de promociones
   */
  getPromotionInfo(): string {
    if (!this.product) return '';
    
    const promotions = this.promotionStateService.getProductPromotions(this.product.id);
    
    if (promotions.length > 0) {
      return `${promotions.length} promoción(es) activa(s)`;
    }
    
    if (this.product.discountPercentage && this.product.discountPercentage > 0) {
      return `Descuento directo: ${this.product.discountPercentage}%`;
    }
    
    return 'Sin promociones activas';
  }
}