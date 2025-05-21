import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgZone, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../services/admin/product/product.service';
import { PromotionService } from '../../../services/admin/promotion/promotion.service';
import { ProductInventoryService, StockUpdate } from '../../../services/admin/inventario/product-inventory.service';
import { Product, ProductVariant, Color, Promotion } from '../../../models/models';
import { NzMessageService } from 'ng-zorro-antd/message';
import { finalize, switchMap, throwError } from 'rxjs';

// Importar módulos ng-zorro necesarios
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { ProductPriceService } from '../../../services/admin/price/product-price.service';

@Component({
  selector: 'app-product-inventory',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzTableModule,
    NzInputModule,
    NzInputNumberModule,
    NzButtonModule,
    NzIconModule,
    NzTagModule,
    NzPopconfirmModule,
    NzToolTipModule,
    NzSpinModule,
    NzEmptyModule,
    NzDividerModule,
    NzModalModule,
    NzAvatarModule,
    NzCardModule,
    NzPopoverModule
  ],
  templateUrl: './product-inventory.component.html',
  styleUrls: ['./product-inventory.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductInventoryComponent implements OnInit, OnChanges {
  @Input() product: Product | null = null;

  variants: ProductVariant[] = [];
  loading = false;
  editingVariantId: string | null = null;
  editingStock: number = 0;
  promotions: Promotion[] = [];
  selectedVariantForPromotion: ProductVariant | null = null;
  promotionModalVisible = false;

  constructor(
    private productService: ProductService,
    private inventoryService: ProductInventoryService,
    private message: NzMessageService,
    private modal: NzModalService,
    private cdr: ChangeDetectorRef,
    private promotionService: PromotionService,
    private productPriceService: ProductPriceService,
    private zone: NgZone
  ) { }

  ngOnInit(): void {
    if (this.product) {
      this.loadVariants();
      this.loadPromotions();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product'] && this.product) {
      this.loadVariants();
    }
  }

  loadVariants(): void {
    if (!this.product) return;

    this.loading = true;
    this.cdr.detectChanges();

    this.productService.getProductVariants(this.product.id)
      .pipe(
        finalize(() => {
          this.zone.run(() => {
            this.loading = false;
            this.cdr.detectChanges();
          });
        })
      )
      .subscribe({
        next: (variants) => {
          this.zone.run(() => {
            this.variants = [...variants];
            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('Error al cargar variantes:', error);
            this.message.error('Error al cargar variantes: ' + (error.message || 'Error desconocido'));
            this.cdr.detectChanges();
          });
        }
      });
  }

  // Dentro de la clase ProductInventoryComponent
  getColorByName(colorName: string): Color | undefined {
    if (!this.product || !colorName) return undefined;

    // Si el producto tiene un array de colores, busca el que coincida por nombre
    return this.product.colors?.find(c => c.name === colorName);
  }

  startEditStock(variant: ProductVariant): void {
    this.editingVariantId = variant.id;
    this.editingStock = variant.stock || 0;
    this.cdr.markForCheck();
  }

  saveStock(variant: ProductVariant): void {
    if (this.editingStock < 0) {
      this.message.error('La cantidad de stock no puede ser negativa');
      return;
    }

    const currentStock = variant.stock || 0;
    const stockChange = this.editingStock - currentStock;

    if (stockChange === 0) {
      this.cancelEdit();
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();

    const update: StockUpdate = {
      productId: this.product!.id,
      variantId: variant.id,
      quantity: stockChange
    };

    this.inventoryService.updateStock(update).subscribe({
      next: () => {
        // Actualizar variante con nuevo stock
        variant.stock = this.editingStock;
        this.editingVariantId = null;

        // Actualizar el producto con nuevo stock total (creando nueva referencia)
        if (this.product) {
          this.product = {
            ...this.product,
            totalStock: (this.product.totalStock || 0) + stockChange
          };
          console.log('Stock total actualizado:', this.product.totalStock);
        }

        this.message.success('Stock actualizado correctamente');
        this.cdr.detectChanges(); // Usar detectChanges en lugar de markForCheck
      },
      error: (error) => {
        console.error('Error al actualizar stock:', error);
        this.message.error('Error al actualizar stock: ' + (error.message || 'Error desconocido'));
        this.loading = false;
        this.cdr.detectChanges();
      },
      complete: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  cancelEdit(): void {
    this.editingVariantId = null;
    this.cdr.markForCheck();
  }

  confirmTransferStock(variant: ProductVariant): void {
    if (!this.product) return;

    this.modal.create({
      nzTitle: 'Transferir Stock',
      nzContent: 'Implementar modal de transferencia de stock con selección de variante destino',
      nzFooter: [
        {
          label: 'Cancelar',
          onClick: () => {
            // Cerrar modal
          }
        },
        {
          label: 'Transferir',
          type: 'primary',
          onClick: () => {
            // Implementar lógica de transferencia
            this.message.info('Funcionalidad de transferencia a implementar');
          }
        }
      ]
    });
  }

  // Formateo y utilidades
  getStockStatusColor(stock: number): string {
    if (stock <= 0) return 'error';
    if (stock <= 5) return 'warning';
    return 'success';
  }

  getStockStatusText(stock: number): string {
    if (stock <= 0) return 'Sin stock';
    if (stock <= 5) return 'Stock bajo';
    return 'En stock';
  }

  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'assets/images/product-placeholder.png';
      imgElement.classList.add('error-image');
    }
  }

  // Función para cargar promociones
  loadPromotions(): void {
    this.promotionService.getActivePromotions().subscribe({
      next: (promotions) => {
        this.promotions = promotions;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error al cargar promociones:', error);
        this.message.error('Error al cargar promociones: ' + error.message);
      }
    });
  }

  // Función para abrir modal de promociones
  // En ProductInventoryComponent

  applyPromotion(variant: ProductVariant): void {
    this.selectedVariantForPromotion = variant;
    this.loading = true;

    // Cargar promociones cada vez que se abre el modal
    this.promotionService.getActivePromotions().pipe(
      finalize(() => {
        this.loading = false;
        // Usar detectChanges en lugar de markForCheck
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (promotions) => {
        console.log('Promociones recibidas en el componente:', promotions);
        this.promotions = promotions;
        this.promotionModalVisible = true;
        // Usar detectChanges para forzar actualización del DOM
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error al cargar promociones:', error);
        this.message.error('Error al cargar promociones. Intente nuevamente.');
        this.cdr.detectChanges();
      }
    });
  }

  // Función para aplicar la promoción seleccionada
  confirmApplyPromotion(promotionId: string): void {
    if (!this.selectedVariantForPromotion || !this.product) {
      this.message.error('No se ha seleccionado una variante de producto.');
      return;
    }

    // Obtenemos la promoción primero
    this.promotionService.getPromotionById(promotionId).pipe(
      switchMap(promotion => {
        if (!promotion) {
          return throwError(() => new Error('La promoción no existe'));
        }

        // Mostrar estado de carga
        this.loading = true;
        this.cdr.detectChanges();

        // Usamos el servicio existente para aplicar la promoción
        return this.productPriceService.applyPromotionToVariant(
          this.product!.id,
          this.selectedVariantForPromotion!.id,
          promotion
        );
      }),
      finalize(() => {
        this.promotionModalVisible = false;
        this.selectedVariantForPromotion = null;
        this.loading = false;

        // Después de finalizar la operación, volver a cargar las variantes
        this.loadVariants();
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.message.success('Promoción aplicada correctamente');
      },
      error: (error) => {
        this.message.error('Error al aplicar promoción: ' + error.message);
        this.cdr.detectChanges();
      }
    });
  }

  // Función para cancelar la aplicación de promoción
  cancelApplyPromotion(): void {
    this.promotionModalVisible = false;
    this.selectedVariantForPromotion = null;
    this.cdr.markForCheck();
  }

  formatDate(date: Date): string {
    if (!date) return '';

    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date instanceof Date ? date : new Date(date));
  }

  // Método para mostrar información de promoción en un tag
  getPromotionBadgeText(variant: ProductVariant): string {
    if (!variant.promotionId) return '';

    if (variant.discountType === 'percentage') {
      return `${variant.discountValue}% OFF`;
    } else {
      return `$${(variant.discountValue ?? 0).toFixed(2)} OFF`;
    }
  }

  // Método para mostrar información detallada de la promoción
  getPromotionInfo(variant: ProductVariant): string {
    if (!variant.promotionId) return '';

    let text = '';

    // Buscar la promoción en la lista de promociones cargadas
    const promotion = this.promotions.find(p => p.id === variant.promotionId);

    if (promotion) {
      text = `${promotion.name} - `;
    }

    if (variant.discountType === 'percentage') {
      text += `Descuento del ${variant.discountValue}%`;
      if (variant.originalPrice && variant.discountedPrice) {
        const saved = variant.originalPrice - variant.discountedPrice;
        text += ` (Ahorro: $${saved.toFixed(2)})`;
      }
    } else {
      text += `Descuento fijo de $${(variant.discountValue ?? 0).toFixed(2)}`;
    }

    if (promotion) {
      text += `\nVálido hasta: ${this.formatDate(promotion.endDate)}`;
    }

    return text;
  }

  // Método para eliminar promoción de una variante
  removePromotion(variant: ProductVariant): void {
    this.modal.confirm({
      nzTitle: '¿Eliminar promoción?',
      nzContent: '¿Está seguro de eliminar la promoción aplicada a esta variante?',
      nzOkText: 'Sí, eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.loading = true;
        this.cdr.detectChanges();

        this.productPriceService.removePromotionFromVariant(
          this.product!.id,
          variant.id
        ).pipe(
          finalize(() => {
            this.loading = false;
            // Recargar explícitamente las variantes después de eliminar
            this.loadVariants();
            this.cdr.detectChanges();
          })
        ).subscribe({
          next: () => {
            this.message.success('Promoción eliminada correctamente');
          },
          error: (error) => {
            this.message.error('Error al eliminar promoción: ' + error.message);
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  trackByVariant(index: number, variant: ProductVariant): string {
    return variant.id;
  }
}