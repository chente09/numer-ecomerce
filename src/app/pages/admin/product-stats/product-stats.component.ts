import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../../services/admin/product/product.service';
import { ProductInventoryService, InventorySummary } from '../../../services/admin/inventario/product-inventory.service';
import { Product } from '../../../models/models';
import { finalize } from 'rxjs';

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
export class ProductStatsComponent implements OnInit, OnChanges {
  @Input() product: Product | null = null;
  @Output() statsChanged = new EventEmitter<{
    productId: string;
    updatedProduct?: Product;
  }>();

  loading = false;
  salesHistory: { date: Date, sales: number }[] = [];
  stockData: any = null;
  viewsData: { period: string, count: number }[] = [];

  constructor(
    private productService: ProductService,
    private inventoryService: ProductInventoryService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    if (this.product) {
      this.loadProductStats();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product'] && this.product) {
      this.loadProductStats();
    }
  }

  loadProductStats(): void {
    if (!this.product) return;

    this.loading = true;

    // Simulación de datos de ventas históricas
    this.salesHistory = [
      { date: new Date(2025, 4, 10), sales: 5 },
      { date: new Date(2025, 4, 11), sales: 3 },
      { date: new Date(2025, 4, 12), sales: 7 },
      { date: new Date(2025, 4, 13), sales: 2 },
      { date: new Date(2025, 4, 14), sales: 6 }
    ];

    // Simulación de datos de vistas
    this.viewsData = [
      { period: 'Hoy', count: 12 },
      { period: 'Ayer', count: 8 },
      { period: 'Última semana', count: 45 },
      { period: 'Último mes', count: 180 }
    ];

    // Obtener datos reales del producto
    this.productService.getCompleteProduct(this.product.id)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (product) => {
          if (product) {
            this.stockData = {
              totalStock: product.totalStock || 0,
              variantsWithStock: product.variants?.filter(v => (v.stock || 0) > 0).length || 0,
              variantsWithoutStock: product.variants?.filter(v => (v.stock || 0) === 0).length || 0,
              totalVariants: product.variants?.length || 0
            };

            // 🚀 EMITIR CAMBIO AL PADRE SI HAY DIFERENCIAS
            if (this.hasStatsChanged(product)) {
              this.statsChanged.emit({
                productId: product.id,
                updatedProduct: product
              });
            }
          }
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error al cargar estadísticas del producto:', error);
        }
      });
  }

  // 🔍 Verificar si las estadísticas han cambiado
  private hasStatsChanged(updatedProduct: Product): boolean {
    if (!this.product) return false;

    return (
      this.product.views !== updatedProduct.views ||
      this.product.sales !== updatedProduct.sales ||
      this.product.totalStock !== updatedProduct.totalStock ||
      this.product.popularityScore !== updatedProduct.popularityScore
    );
  }

  // Formateo de datos para visualización
  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  private emitStatsChange(): void {
    if (this.product) {
      this.statsChanged.emit({
        productId: this.product.id,
        updatedProduct: this.product
      });
    }
  }
}