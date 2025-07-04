import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../../services/admin/product/product.service';
import { PromotionStateService, PromotionChangeEvent } from '../../../services/admin/promotionState/promotion-state.service';
import { Product } from '../../../models/models';
import { finalize, Subject, takeUntil, switchMap, take, debounceTime, firstValueFrom } from 'rxjs';

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
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzButtonModule } from 'ng-zorro-antd/button';

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
    NzIconModule,
    NzButtonModule
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
  syncingCount = false;

  private destroy$ = new Subject<void>();
  private readonly COMPONENT_NAME = 'ProductStatsComponent';

  constructor(
    private productService: ProductService,
    private promotionStateService: PromotionStateService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private message: NzMessageService
  ) { }

  ngOnInit(): void {
    this.promotionStateService.registerComponent(this.COMPONENT_NAME);
    this.subscribeToPromotionChanges();
    if (this.product) {
      this.loadProductStats();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Solo recargar si el ID del producto cambia o si el producto pasa de null a un objeto
    if (changes['product']) {
      const currentProduct = changes['product'].currentValue;
      const previousProduct = changes['product'].previousValue;

      // Importante: Solo recargar si el producto cambia o si el ID es diferente
      // y no si solo es una referencia de objeto diferente pero con el mismo ID
      if (currentProduct && (!previousProduct || currentProduct.id !== previousProduct.id)) {
        this.loadProductStats();
      }
    }
  }

  ngOnDestroy(): void {
    this.promotionStateService.unregisterComponent(this.COMPONENT_NAME);
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * 🔄 Sincronizar contador de ventas
   */
  async syncSalesCount(): Promise<void> {
    if (!this.product) return;

    this.syncingCount = true;
    console.log(`🔄 [STATS] Sincronizando contador de ventas para ${this.product.id}`);

    try {
      await this.productService.syncProductSalesCount(this.product.id);

      // Después de sincronizar, el valor en Firebase estará actualizado.
      // Emitir el evento para que el componente padre (ProductManagementComponent)
      // fuerce la recarga del producto completo desde el servicio.
      this.statsChanged.emit({
        productId: this.product.id,
        // No pasamos updatedProduct aquí, ya que el padre lo recargará
        // Esto evita que el padre intente actualizar el producto localmente
        // con un objeto que podría no ser el más fresco después de la sincronización.
      });

      this.message.success('Contador de ventas actualizado. La vista se refrescará.');

    } catch (error) {
      console.error('❌ [STATS] Error sincronizando ventas:', error);
      this.message.error('Error al sincronizar ventas');
    } finally {
      this.syncingCount = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * 📡 Suscribirse a cambios de promociones
   */
  private subscribeToPromotionChanges(): void {
    this.promotionStateService.onGlobalUpdate()
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500)
      )
      .subscribe(globalUpdate => {
        this.handlePromotionUpdate(globalUpdate);
      });

    if (this.product) {
      this.promotionStateService.onProductPromotionChange(this.product.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe(event => {
          this.refreshProductStats();
        });
    }
  }

  /**
   * 🔄 Manejar actualizaciones de promociones
   */
  private handlePromotionUpdate(globalUpdate: any): void {
    const event = globalUpdate.data;
    if (this.product && this.affectsCurrentProduct(event)) {
      this.refreshProductStats();
    }
  }

  /**
   * 🎯 Verificar si el evento afecta al producto actual
   */
  private affectsCurrentProduct(event: PromotionChangeEvent): boolean {
    if (!this.product) return false;
    if (event.productId === this.product.id) return true;
    if (event.affectedProducts?.includes(this.product.id)) return true;
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
    const productId = this.product.id;

    this.productService.getProductCompleteStats(productId)
      .pipe(
        take(1),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (stats) => {
          this.ngZone.run(async () => {
            this.salesHistory = stats.salesHistory;
            this.viewsData = stats.viewsData;
            this.stockData = stats.stockData;

            // FIX: Actualizar el producto del componente con los datos frescos de las estadísticas
            // Clonar para asegurar la detección de cambios por OnPush
            const oldProductSales = this.product ? this.product.sales || 0 : 0; // Guardar el valor actual de sales del componente
            this.product = { ...stats.product }; // Asignar el producto completo de las stats

            // 🔍 VERIFICAR DISCREPANCIAS
            const realSalesCount = this.salesHistory.reduce((sum, day) => sum + day.sales, 0);
            const storedSalesCount = this.product.sales || 0; // Usar el product actualizado del componente

            if (realSalesCount !== storedSalesCount) {
              console.warn(`⚠️ [STATS] Discrepancia detectada (después de carga):
              Ventas reales (historial): ${realSalesCount},
              Ventas almacenadas (producto): ${storedSalesCount}. Sincronizando...`);

              // Sincronizar automáticamente.
              await this.productService.syncProductSalesCount(productId);

              // Después de la sincronización, el valor en Firebase estará actualizado.
              // Emitir el evento para que el componente padre (ProductManagementComponent)
              // fuerce la recarga del producto completo desde el servicio.
              this.statsChanged.emit({
                productId: this.product.id,
                // No pasamos updatedProduct aquí, ya que el padre lo recargará
              });

              // Es importante no llamar a loadProductStats() aquí para evitar el bucle.
              // La recarga debe ser manejada por el componente padre o por el onChanges
              // cuando el input 'product' cambie.
              return; // Salir para evitar procesamiento duplicado y bucle
            }

            // Si no hay discrepancia o ya se sincronizó, emitir cambios si los hay
            // Comparar el estado actual (this.product) con el valor de sales que tenía antes de esta carga
            if (this.product.sales !== oldProductSales) { // Solo emitir si el sales ha cambiado
              this.statsChanged.emit({
                productId: this.product.id,
                updatedProduct: this.product
              });
            }

            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          console.error('❌ [STATS] Error al cargar estadísticas:', error);
          this.loadFallbackData();
        }
      });
  }

  // Agregar método fallback
  private loadFallbackData(): void {
    this.salesHistory = Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000),
      sales: Math.floor(Math.random() * 10)
    }));
    this.viewsData = [
      { period: 'Hoy', count: Math.floor(Math.random() * 20) + 5 },
      { period: 'Ayer', count: Math.floor(Math.random() * 15) + 3 },
      { period: 'Última semana', count: Math.floor(Math.random() * 100) + 20 },
      { period: 'Último mes', count: Math.floor(Math.random() * 400) + 100 }
    ];
    if (this.product) {
      this.stockData = {
        totalStock: this.product.totalStock || 0,
        variantsWithStock: this.product.variants?.filter(v => (v.stock || 0) > 0).length || 0,
        variantsWithoutStock: this.product.variants?.filter(v => (v.stock || 0) === 0).length || 0,
        totalVariants: this.product.variants?.length || 0
      };
    }
    this.cdr.detectChanges();
  }

  /**
   * 🔄 Refrescar estadísticas forzando recarga
   */
  private refreshProductStats(): void {
    if (!this.product) return;
    this.loadProductStats();
  }

  /**
   * 🔍 Verificar si las estadísticas han cambiado
   */
  private hasStatsChanged(oldProductState: Product): boolean {
    // Este método ya no se usa directamente para el bucle de sales,
    // pero se mantiene para otras comparaciones si son necesarias.
    if (!this.product) return false;

    const hasChanges = (
      this.product.views !== oldProductState.views ||
      this.product.sales !== oldProductState.sales || // Mantener esta línea si quieres detectar cambios en sales
      this.product.totalStock !== oldProductState.totalStock ||
      this.product.popularityScore !== oldProductState.popularityScore ||
      this.product.discountPercentage !== oldProductState.discountPercentage ||
      this.product.currentPrice !== oldProductState.currentPrice
    );
    return hasChanges;
  }

  /**
   * 📅 Formateo de datos para visualización
   */
  formatDate(date: Date): string {
    if (!(date instanceof Date)) {
      console.warn('⚠️ [COMPONENT] formatDate recibió un valor no-Date:', date);
      date = new Date(date);
    }
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
    salesVelocity: number;
  } {
    if (!this.product) {
      return { conversionRate: 0, viewsToSalesRatio: 0, stockTurnover: 'N/A', salesVelocity: 0 };
    }
    const views = this.product.views || 0;
    const sales = this.product.sales || 0;
    const totalStock = this.product.totalStock || 0;
    const conversionRate = views > 0 ? (sales / views) * 100 : 0;
    const viewsToSalesRatio = sales > 0 ? views / sales : 0;
    const recentSales = this.salesHistory
      .slice(-7)
      .reduce((sum, day) => sum + day.sales, 0);
    const salesVelocity = recentSales / 7;
    let stockTurnover = 'Bajo';
    if (totalStock === 0) {
      stockTurnover = 'Agotado';
    } else if (salesVelocity > 0) {
      const daysToSellOut = totalStock / salesVelocity;
      if (daysToSellOut < 30) stockTurnover = 'Alto';
      else if (daysToSellOut < 90) stockTurnover = 'Medio';
    }
    return {
      conversionRate: Number(conversionRate.toFixed(2)),
      viewsToSalesRatio: Number(viewsToSalesRatio.toFixed(1)),
      stockTurnover,
      salesVelocity: Number(salesVelocity.toFixed(1))
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
