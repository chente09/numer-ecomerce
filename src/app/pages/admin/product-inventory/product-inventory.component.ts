import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
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

// 🚀 Interfaces para el backup y control de estado
interface VariantBackup {
  originalVariant: ProductVariant;
  index: number;
}

interface OptimisticOperation {
  type: 'promotion' | 'deletion' | 'stock';
  variantId: string;
  backup?: VariantBackup;
}

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
  @Output() inventoryChanged = new EventEmitter<{
    productId: string;
    updatedProduct?: Product;
    stockChange?: number;
  }>();

  @Output() productUpdated = new EventEmitter<{
    productId: string;
    updatedProduct: Product;
  }>();

  variants: ProductVariant[] = [];
  loading = false;
  editingVariantId: string | null = null;
  editingStock: number = 0;
  promotions: Promotion[] = [];
  selectedVariantForPromotion: ProductVariant | null = null;
  promotionModalVisible = false;

  // 🚀 Control de operaciones optimistas
  private pendingOperations = new Map<string, OptimisticOperation>();

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

  getColorByName(colorName: string): Color | undefined {
    if (!this.product || !colorName) return undefined;
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

    // 🚀 ACTUALIZACIÓN OPTIMISTA LOCAL INMEDIATA
    const oldTotalStock = this.product?.totalStock || 0;
    const newTotalStock = Math.max(0, oldTotalStock + stockChange);

    // Actualizar variante local inmediatamente
    variant.stock = this.editingStock;
    this.editingVariantId = null;

    // Actualizar producto local
    if (this.product) {
      this.product = {
        ...this.product,
        totalStock: newTotalStock
      };

      // 🚀 EMITIR EVENTO AL COMPONENTE PADRE INMEDIATAMENTE
      this.inventoryChanged.emit({
        productId: this.product.id,
        stockChange: stockChange,
        updatedProduct: this.product
      });

      console.log('📦 [INVENTORY] Evento emitido al padre:', {
        productId: this.product.id,
        stockChange,
        newTotalStock
      });
    }

    // Mostrar éxito inmediatamente
    this.message.success('Stock actualizado correctamente');
    this.cdr.detectChanges();

    // Procesar en servidor en segundo plano
    this.loading = true;

    const update: StockUpdate = {
      productId: this.product!.id,
      variantId: variant.id,
      quantity: stockChange
    };

    this.inventoryService.updateStock(update)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          console.log('✅ [INVENTORY] Actualización confirmada en servidor');
          // La UI ya está actualizada optimísticamente
        },
        error: (error) => {
          console.error('❌ [INVENTORY] Error en servidor, haciendo rollback:', error);

          // 🔄 ROLLBACK: Revertir cambios
          variant.stock = currentStock;

          if (this.product) {
            this.product = {
              ...this.product,
              totalStock: oldTotalStock
            };

            // Emitir rollback al padre
            this.inventoryChanged.emit({
              productId: this.product.id,
              stockChange: -stockChange, // Revertir el cambio
              updatedProduct: this.product
            });
          }

          this.message.error('Error al actualizar stock: ' + (error.message || 'Error desconocido'));
          this.cdr.detectChanges();
        }
      });
  }

  cancelEdit(): void {
    this.editingVariantId = null;
    this.cdr.markForCheck();
  }

  // 🚀 IMPLEMENTACIÓN OPTIMISTA PARA PROMOCIONES
  confirmApplyPromotion(promotionId: string): void {
    if (!this.selectedVariantForPromotion || !this.product) {
      this.message.error('No se ha seleccionado una variante de producto.');
      return;
    }

    const variant = this.selectedVariantForPromotion;
    const variantIndex = this.variants.findIndex(v => v.id === variant.id);

    if (variantIndex === -1) {
      this.message.error('Variante no encontrada.');
      return;
    }

    // 📦 CREAR BACKUP ANTES DE LA ACTUALIZACIÓN OPTIMISTA
    const backup: VariantBackup = {
      originalVariant: { ...variant },
      index: variantIndex
    };

    this.promotionService.getPromotionById(promotionId).pipe(
      switchMap(promotion => {
        if (!promotion) {
          return throwError(() => new Error('La promoción no existe'));
        }

        // 🚀 ACTUALIZACIÓN OPTIMISTA INMEDIATA
        console.log('🎯 Aplicando promoción optimísticamente...');
        this.applyPromotionOptimistically(variant, promotion, backup);

        // 🚀 EMITIR EVENTO AL PADRE CON PRODUCTO ACTUALIZADO
        const updatedProduct = this.calculateUpdatedProductWithPromotions();
        this.productUpdated.emit({
          productId: this.product!.id,
          updatedProduct
        });

        // Mostrar loading y actualizar UI
        this.loading = true;
        this.cdr.detectChanges();

        // Realizar operación en servidor
        return this.productPriceService.applyPromotionToVariant(
          this.product!.id,
          variant.id,
          promotion
        );
      }),
      finalize(() => {
        this.promotionModalVisible = false;
        this.selectedVariantForPromotion = null;
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        console.log('✅ Promoción aplicada exitosamente en servidor');
        this.message.success('Promoción aplicada correctamente');
        this.cleanupPendingOperation(variant.id);
      },
      error: (error) => {
        console.error('❌ Error al aplicar promoción en servidor:', error);

        // 🔄 ROLLBACK: Restaurar estado anterior
        this.rollbackPromotionChanges(variant.id);

        // Emitir rollback al padre
        const rolledBackProduct = this.calculateUpdatedProductWithPromotions();
        this.productUpdated.emit({
          productId: this.product!.id,
          updatedProduct: rolledBackProduct
        });

        this.message.error('Error al aplicar promoción: ' + error.message);
      }
    });
  }

  private calculateUpdatedProductWithPromotions(): Product {
    if (!this.product) return this.product!;

    // Recalcular precio del producto basado en variantes con promociones
    const hasPromotions = this.variants.some(v => v.promotionId);
    let productDiscount = 0;
    let productCurrentPrice = this.product.price;

    if (hasPromotions) {
      // Calcular descuento promedio ponderado por stock
      let totalStock = 0;
      let totalDiscountedValue = 0;

      this.variants.forEach(variant => {
        const variantStock = variant.stock || 0;
        totalStock += variantStock;

        if (variant.discountedPrice && variant.originalPrice) {
          const variantValue = variant.discountedPrice * variantStock;
          totalDiscountedValue += variantValue;
        } else {
          const variantPrice = variant.price || this.product!.price;
          totalDiscountedValue += variantPrice * variantStock;
        }
      });

      if (totalStock > 0) {
        productCurrentPrice = totalDiscountedValue / totalStock;
        productDiscount = Math.round(((this.product.price - productCurrentPrice) / this.product.price) * 100);
      }
    }

    return {
      ...this.product,
      currentPrice: productCurrentPrice,
      discountPercentage: productDiscount,
      variants: [...this.variants] // Incluir variantes actualizadas
    };
  }

  // 🎯 Aplicar promoción optimísticamente
  private applyPromotionOptimistically(
    variant: ProductVariant,
    promotion: Promotion,
    backup: VariantBackup
  ): void {
    // Registrar operación pendiente
    this.pendingOperations.set(variant.id, {
      type: 'promotion',
      variantId: variant.id,
      backup
    });

    // Calcular precio con descuento
    const originalPrice = variant.price || this.product?.price || 0;
    let discountedPrice = originalPrice;
    let maxDiscount = promotion.maxDiscountAmount || Infinity;

    if (promotion.discountType === 'percentage') {
      const discountAmount = originalPrice * (promotion.discountValue / 100);
      const finalDiscount = Math.min(discountAmount, maxDiscount);
      discountedPrice = originalPrice - finalDiscount;
    } else {
      discountedPrice = originalPrice - promotion.discountValue;
    }

    // 🔄 ACTUALIZAR VARIANTE INMEDIATAMENTE
    variant.promotionId = promotion.id;
    variant.discountType = promotion.discountType;
    variant.discountValue = promotion.discountValue;
    variant.originalPrice = originalPrice;
    variant.discountedPrice = Math.max(0, discountedPrice);

    console.log(`🎯 Promoción aplicada optimísticamente:`, {
      variantId: variant.id,
      promotionName: promotion.name,
      originalPrice,
      discountedPrice: variant.discountedPrice,
      discountValue: promotion.discountValue
    });

    // Forzar actualización visual
    this.cdr.detectChanges();
  }

  // 🔄 Rollback para promociones
  private rollbackPromotionChanges(variantId: string): void {
    const operation = this.pendingOperations.get(variantId);

    if (operation && operation.backup) {
      const { originalVariant, index } = operation.backup;

      if (index >= 0 && index < this.variants.length) {
        // Restaurar variante original
        this.variants[index] = { ...originalVariant };

        console.log('🔄 Rollback aplicado para promoción:', {
          variantId,
          restoredVariant: this.variants[index]
        });

        this.cdr.detectChanges();
      }
    }

    this.cleanupPendingOperation(variantId);
  }

  // 🚀 IMPLEMENTACIÓN OPTIMISTA PARA ELIMINACIÓN DE VARIANTES
  deleteVariant(variant: ProductVariant): void {
    this.modal.confirm({
      nzTitle: '¿Eliminar variante?',
      nzContent: `¿Está seguro de eliminar la variante ${variant.colorName} - ${variant.sizeName}?`,
      nzOkText: 'Eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        const variantIndex = this.variants.findIndex(v => v.id === variant.id);
        if (variantIndex === -1) {
          this.message.error('Variante no encontrada.');
          return;
        }

        const backup: VariantBackup = {
          originalVariant: { ...variant },
          index: variantIndex
        };

        // 🚀 ELIMINACIÓN OPTIMISTA INMEDIATA
        console.log('🗑️ Eliminando variante optimísticamente...');
        this.deleteVariantOptimistically(variant.id, backup);

        // Calcular nuevo stock total
        const newTotalStock = this.variants.reduce((total, v) => total + (v.stock || 0), 0);

        if (this.product) {
          this.product = {
            ...this.product,
            totalStock: newTotalStock
          };

          // 🚀 EMITIR EVENTO AL PADRE
          this.inventoryChanged.emit({
            productId: this.product.id,
            stockChange: -(variant.stock || 0), // Stock eliminado
            updatedProduct: this.product
          });
        }

        this.loading = true;
        this.message.success('Variante eliminada correctamente');

        this.inventoryService.deleteVariant(variant.id)
          .pipe(
            finalize(() => {
              this.loading = false;
              this.cdr.detectChanges();
            })
          )
          .subscribe({
            next: () => {
              console.log('✅ Variante eliminada exitosamente en servidor');
              this.cleanupPendingOperation(variant.id);
            },
            error: (error) => {
              console.error('❌ Error al eliminar variante en servidor:', error);

              // 🔄 ROLLBACK: Restaurar variante eliminada
              this.rollbackVariantDeletion(variant.id);

              // Emitir rollback al padre
              if (this.product) {
                const restoredTotalStock = this.variants.reduce((total, v) => total + (v.stock || 0), 0);
                this.product = {
                  ...this.product,
                  totalStock: restoredTotalStock
                };

                this.inventoryChanged.emit({
                  productId: this.product.id,
                  stockChange: variant.stock || 0, // Restaurar stock
                  updatedProduct: this.product
                });
              }

              this.message.error('Error al eliminar variante: ' + (error.message || 'Error desconocido'));
            }
          });
      }
    });
  }

  // 🗑️ Eliminar variante optimísticamente
  private deleteVariantOptimistically(variantId: string, backup: VariantBackup): void {
    // Registrar operación pendiente
    this.pendingOperations.set(variantId, {
      type: 'deletion',
      variantId,
      backup
    });

    // 🗑️ ELIMINAR DE LA LISTA INMEDIATAMENTE
    this.variants = this.variants.filter(v => v.id !== variantId);

    console.log(`🗑️ Variante eliminada optimísticamente:`, {
      variantId,
      remainingVariants: this.variants.length
    });

    // Forzar actualización visual
    this.cdr.detectChanges();
  }

  // 🔄 Rollback para eliminación
  private rollbackVariantDeletion(variantId: string): void {
    const operation = this.pendingOperations.get(variantId);

    if (operation && operation.backup) {
      const { originalVariant, index } = operation.backup;

      // 🔄 RESTAURAR VARIANTE EN SU POSICIÓN ORIGINAL
      this.variants.splice(index, 0, { ...originalVariant });

      console.log('🔄 Rollback aplicado para eliminación:', {
        variantId,
        restoredAtIndex: index,
        totalVariants: this.variants.length
      });

      this.cdr.detectChanges();
    }

    this.cleanupPendingOperation(variantId);
  }

  // 🧹 Limpiar operaciones pendientes
  private cleanupPendingOperation(variantId: string): void {
    this.pendingOperations.delete(variantId);
  }

  // 📊 Actualizar stock total del producto
  private updateProductTotalStock(): void {
    if (this.product) {
      const totalStock = this.variants.reduce((total, variant) => total + (variant.stock || 0), 0);

      this.product = {
        ...this.product,
        totalStock
      };

      console.log('📊 Stock total actualizado:', totalStock);
      this.cdr.detectChanges();
    }
  }

  // 🚀 ELIMINACIÓN OPTIMISTA DE PROMOCIONES
  removePromotion(variant: ProductVariant): void {
    this.modal.confirm({
      nzTitle: '¿Eliminar promoción?',
      nzContent: '¿Está seguro de eliminar la promoción aplicada a esta variante?',
      nzOkText: 'Sí, eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        const variantIndex = this.variants.findIndex(v => v.id === variant.id);
        if (variantIndex === -1) return;

        const backup: VariantBackup = {
          originalVariant: { ...variant },
          index: variantIndex
        };

        // 🚀 REMOVER PROMOCIÓN OPTIMÍSTICAMENTE
        console.log('🗑️ Removiendo promoción optimísticamente...');
        this.removePromotionOptimistically(variant, backup);

        // 🚀 EMITIR EVENTO AL PADRE
        const updatedProduct = this.calculateUpdatedProductWithPromotions();
        this.productUpdated.emit({
          productId: this.product!.id,
          updatedProduct
        });

        this.loading = true;
        this.cdr.detectChanges();
        this.message.success('Promoción eliminada correctamente');

        this.productPriceService.removePromotionFromVariant(
          this.product!.id,
          variant.id
        ).pipe(
          finalize(() => {
            this.loading = false;
            this.cdr.detectChanges();
          })
        ).subscribe({
          next: () => {
            console.log('✅ Promoción eliminada exitosamente en servidor');
            this.cleanupPendingOperation(variant.id);
          },
          error: (error) => {
            console.error('❌ Error al eliminar promoción en servidor:', error);

            // 🔄 ROLLBACK
            this.rollbackPromotionRemoval(variant.id);

            // Emitir rollback al padre
            const rolledBackProduct = this.calculateUpdatedProductWithPromotions();
            this.productUpdated.emit({
              productId: this.product!.id,
              updatedProduct: rolledBackProduct
            });

            this.message.error('Error al eliminar promoción: ' + error.message);
          }
        });
      }
    });
  }

  // 🗑️ Remover promoción optimísticamente
  private removePromotionOptimistically(variant: ProductVariant, backup: VariantBackup): void {
    // Registrar operación pendiente
    this.pendingOperations.set(variant.id, {
      type: 'promotion',
      variantId: variant.id,
      backup
    });

    // 🗑️ LIMPIAR DATOS DE PROMOCIÓN
    variant.promotionId = undefined;
    variant.discountType = undefined;
    variant.discountValue = undefined;
    variant.originalPrice = undefined;
    variant.discountedPrice = undefined;

    console.log(`🗑️ Promoción removida optimísticamente:`, {
      variantId: variant.id
    });

    this.cdr.detectChanges();
  }

  // 🔄 Rollback para remoción de promoción
  private rollbackPromotionRemoval(variantId: string): void {
    // Reutilizar la misma lógica de rollback de promociones
    this.rollbackPromotionChanges(variantId);
  }

  // ==================== RESTO DE MÉTODOS SIN CAMBIOS ====================

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

  applyPromotion(variant: ProductVariant): void {
    this.selectedVariantForPromotion = variant;
    this.loading = true;

    // Cargar promociones cada vez que se abre el modal
    this.promotionService.getActivePromotions().pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (promotions) => {
        console.log('Promociones recibidas en el componente:', promotions);
        this.promotions = promotions;
        this.promotionModalVisible = true;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error al cargar promociones:', error);
        this.message.error('Error al cargar promociones. Intente nuevamente.');
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

  trackByVariant(index: number, variant: ProductVariant): string {
    return variant.id;
  }
}