import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductPriceService } from '../../../services/admin/price/product-price.service';
import { PromotionService } from '../../../services/admin/promotion/promotion.service';
import { PromotionStateService } from '../../../services/admin/promotionState/promotion-state.service';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { AppliedPromotionsService } from '../../../services/admin/applied-promotions/applied-promotions.service';
import { Product, Promotion, ProductVariant, AppliedPromotion } from '../../../models/models';
import { NzMessageService } from 'ng-zorro-antd/message';
import { finalize, forkJoin, switchMap, take } from 'rxjs';

// Importar módulos ng-zorro necesarios
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzCardModule } from 'ng-zorro-antd/card';

@Component({
  selector: 'app-product-promotions',
  standalone: true,
  imports: [
    CommonModule,
    NzTableModule,
    NzButtonModule,
    NzTagModule,
    NzIconModule,
    NzToolTipModule,
    NzPopconfirmModule,
    NzSpinModule,
    NzEmptyModule,
    NzDividerModule,
    NzModalModule,
    NzCardModule
  ],
  templateUrl: './product-promotions.component.html',
  styleUrls: ['./product-promotions.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductPromotionsComponent implements OnInit, OnChanges {
  @Input() product: Product | null = null;
  @Output() promotionChanged = new EventEmitter<{
    productId: string;
    updatedProduct?: Product;
  }>();

  promotions: Promotion[] = [];
  allPromotions: Promotion[] = [];
  appliedPromotions: AppliedPromotion[] = []; // Para tracking interno
  categories: Category[] = [];
  loading = false;
  applying = false;

  // 🆕 NUEVO: Nombre del componente para registro
  private readonly COMPONENT_NAME = 'ProductPromotionsComponent';

  constructor(
    private productPriceService: ProductPriceService,
    private promotionService: PromotionService,
    private categoryService: CategoryService,
    private promotionStateService: PromotionStateService,
    private appliedPromotionsService: AppliedPromotionsService,
    private message: NzMessageService,
    private modal: NzModalService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.promotionStateService.registerComponent(this.COMPONENT_NAME);
    this.loadCategories();
    if (this.product) {
      this.loadPromotions();
      this.loadAllPromotions();
    }
  }

  // 🆕 NUEVO: ngOnDestroy para cleanup
  ngOnDestroy(): void {
    // 🗑️ Desregistrar componente
    this.promotionStateService.unregisterComponent(this.COMPONENT_NAME);
  }

  // ⬅️ AGREGAR ESTE MÉTODO
  loadCategories(): void {
    this.categoryService.getCategories()
      .pipe(
        take(1),
        finalize(() => this.cdr.markForCheck())
      )
      .subscribe({
        next: (categories) => {
          this.categories = categories;
        },
        error: (error) => {
          console.error('Error cargando categorías:', error);
          // No mostrar error al usuario ya que las categorías son solo para display
        }
      });
  }

  // ⬅️ AGREGAR ESTE MÉTODO PARA MÚLTIPLES CATEGORÍAS
  getCategoriesNames(): string {
    if (!this.product?.categories || this.product.categories.length === 0) {
      return 'Sin categorías';
    }

    const categoryNames = this.product.categories
      .map(categoryId => {
        const category = this.categories.find(c => c.id === categoryId);
        return category?.name || null;
      })
      .filter(name => name !== null) as string[];

    if (categoryNames.length === 0) {
      return 'Categorías no encontradas';
    }

    return categoryNames.join(', ');
  }

  // ⬅️ MÉTODO ALTERNATIVO SI NECESITAS MÁS CONTROL
  getCategoriesDisplay(): { names: string[], count: number, hasUnknown: boolean } {
    if (!this.product?.categories || this.product.categories.length === 0) {
      return { names: [], count: 0, hasUnknown: false };
    }

    const result = { names: [] as string[], count: 0, hasUnknown: false };

    this.product.categories.forEach(categoryId => {
      const category = this.categories.find(c => c.id === categoryId);
      if (category) {
        result.names.push(category.name);
      } else {
        result.hasUnknown = true;
      }
    });

    result.count = this.product.categories.length;
    return result;
  }

  getCategoryName(categoryId: string): string {
    if (!categoryId) return 'Sin categoría';

    const category = this.categories.find(c => c.id === categoryId);
    return category?.name || 'Categoría no encontrada';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product'] && this.product) {
      this.loadPromotions();
      this.loadAllPromotions();
    }
  }

  loadAllPromotions(): void {
    this.promotionService.getPromotions()
      .pipe(
        take(1),
        finalize(() => this.cdr.markForCheck())
      )
      .subscribe({
        next: (promotions) => {
          this.allPromotions = promotions;
        },
        error: (error) => {
          console.error('Error cargando todas las promociones:', error);
          this.message.error('Error al cargar promociones disponibles');
        }
      });
  }

  loadPromotions(): void {
    if (!this.product) return;

    this.loading = true;

    // Cargar promociones aplicadas desde el nuevo servicio
    forkJoin({
      applied: this.appliedPromotionsService.getAppliedPromotions(this.product.id),
      allActive: this.promotionService.getActivePromotions()
    }).pipe(
      take(1),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: ({ applied, allActive }) => {
        this.appliedPromotions = applied;
        const appliedIds = applied.map(a => a.promotionId);
        this.promotions = allActive.filter(p => appliedIds.includes(p.id));
        this.allPromotions = allActive;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error cargando promociones:', error);
        this.message.error('Error al cargar promociones');
      }
    });
  }

  applyPromotion(promotionId: string): void {
    if (!this.product) return;

    this.applying = true;

    const promotion = this.allPromotions.find(p => p.id === promotionId);
    if (!promotion) {
      this.message.error('Promoción no encontrada');
      this.applying = false;
      return;
    }

    const pricing = this.productPriceService.calculatePriceWithPromotion(this.product, promotion);

    this.appliedPromotionsService.applyPromotion(
      promotionId,
      'product',
      this.product.id,
      promotion.endDate,
      'admin'
    ).pipe(
      take(1),
      switchMap(() => {
        return this.productPriceService.updateProductPricing(this.product!.id, {
          currentPrice: pricing.currentPrice,
          discountPercentage: pricing.discountPercentage,
          originalPrice: this.product!.price
        });
      }),
      finalize(() => {
        this.applying = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: () => {
        // Actualizar producto local
        this.product = {
          ...this.product!,
          currentPrice: pricing.currentPrice,
          discountPercentage: pricing.discountPercentage,
          originalPrice: this.product!.price
        };

        // ✅ BROADCASTING EXISTENTE (mantener)
        this.promotionStateService.notifyPromotionApplied(this.product.id, promotion);
        this.promotionStateService.notifyPromotionActivated(promotionId, [this.product.id]);

        // 🆕 NUEVO: Broadcasting mejorado con información específica
        this.promotionStateService.notifyPromotionActivated(
          promotionId,
          [this.product.id]
        );

        this.promotionChanged.emit({
          productId: this.product.id,
          updatedProduct: this.product
        });

        this.loadPromotions();
      },
      error: (error) => {
        console.error('❌ Error aplicando promoción:', error);
        this.message.error('Error al aplicar promoción');
      }
    });
  }

  removePromotion(promotionId: string): void {
    if (!this.product) return;

    // Obtener información de la promoción antes de eliminar
    const promotion = this.allPromotions.find(p => p.id === promotionId);
    const promotionName = promotion?.name || 'promoción';

    this.modal.confirm({
      nzTitle: '¿Eliminar promoción?',
      nzContent: `¿Está seguro de eliminar "${promotionName}"? Los clientes dejarán de verla inmediatamente.`,
      nzOkText: 'Eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.applying = true;

        const variantsWithPromotion = this.product!.variants.filter(
          variant => variant.promotionId === promotionId
        );

        if (variantsWithPromotion.length > 0) {
          this.removePromotionFromVariants(promotionId, variantsWithPromotion, promotionName);
        } else {
          this.removePromotionFromProduct(promotionId, promotionName);
        }
      }
    });
  }

  private removePromotionFromVariants(promotionId: string, variants: ProductVariant[], promotionName: string): void {
    const removeObservables = variants.map(variant =>
      this.productPriceService.removePromotionFromVariant(this.product!.id, variant.id)
    );

    forkJoin(removeObservables)
      .pipe(
        take(1),
        finalize(() => {
          this.applying = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.product = {
            ...this.product!,
            variants: this.product!.variants.map(v => {
              if (v.promotionId === promotionId) {
                const { promotionId: _, discountType, discountValue, discountedPrice, originalPrice, ...cleanVariant } = v;
                return cleanVariant as ProductVariant;
              }
              return v;
            })
          };

          // ✅ BROADCASTING EXISTENTE (mantener)
          this.promotionStateService.notifyPromotionRemoved(this.product.id, promotionId);

          // 🆕 NUEVO: Broadcasting mejorado
          this.promotionStateService.notifyPromotionDeactivated(
            promotionId,
            [this.product.id]
          );

          this.promotionChanged.emit({
            productId: this.product.id,
            updatedProduct: this.product
          });

          // 🆕 NUEVO: Mensaje mejorado
          this.message.success(
            `✅ "${promotionName}" eliminada de variantes - Clientes notificados automáticamente`
          );

          this.loadPromotions();
        },
        error: (error) => {
          console.error('❌ Error eliminando promoción de variantes:', error);
          this.message.error('Error al eliminar promoción');
        }
      });
  }

  private removePromotionFromProduct(promotionId: string, promotionName: string): void {
    this.appliedPromotionsService.removePromotion(promotionId, this.product!.id)
      .pipe(
        take(1),
        switchMap(() => {
          return this.productPriceService.updateProductPricing(this.product!.id, {
            currentPrice: this.product!.price,
            discountPercentage: 0,
            originalPrice: this.product!.price
          });
        }),
        finalize(() => {
          this.applying = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.product = {
            ...this.product!,
            currentPrice: this.product!.price,
            discountPercentage: 0,
            originalPrice: this.product!.price
          };

          // ✅ BROADCASTING EXISTENTE (mantener)
          this.promotionStateService.notifyPromotionRemoved(this.product.id, promotionId);

          // 🆕 NUEVO: Broadcasting mejorado
          this.promotionStateService.notifyPromotionDeactivated(
            promotionId,
            [this.product.id]
          );

          this.promotionChanged.emit({
            productId: this.product.id,
            updatedProduct: this.product
          });

          this.loadPromotions();
        },
        error: (error) => {
          console.error('❌ Error eliminando promoción:', error);
          this.message.error('Error al eliminar promoción');
        }
      });
  }

  removeAllPromotions(): void {
    if (!this.product) return;

    this.modal.confirm({
      nzTitle: '¿Eliminar todas las promociones?',
      nzContent: 'Esta acción eliminará todas las promociones del producto. Los clientes serán notificados automáticamente.',
      nzOkText: 'Eliminar',
      nzOkDanger: true,
      nzOnOk: () => {
        this.applying = true;

        const removeObservables: any[] = [];
        const affectedPromotionIds: string[] = [];

        // Recopilar IDs de promociones afectadas
        this.appliedPromotions.forEach(ap => {
          if (ap.target === 'product') {
            removeObservables.push(
              this.appliedPromotionsService.removePromotion(ap.promotionId, ap.targetId)
            );
            affectedPromotionIds.push(ap.promotionId);
          }
        });

        this.product!.variants.forEach(variant => {
          if (variant.promotionId) {
            removeObservables.push(
              this.productPriceService.removePromotionFromVariant(this.product!.id, variant.id)
            );
            if (!affectedPromotionIds.includes(variant.promotionId)) {
              affectedPromotionIds.push(variant.promotionId);
            }
          }
        });

        if (removeObservables.length === 0) {
          this.message.info('No hay promociones para eliminar');
          this.applying = false;
          return;
        }

        forkJoin(removeObservables)
          .pipe(
            take(1),
            switchMap(() => {
              return this.productPriceService.updateProductPricing(this.product!.id, {
                currentPrice: this.product!.price,
                discountPercentage: 0,
                originalPrice: this.product!.price
              });
            }),
            finalize(() => {
              this.applying = false;
              this.cdr.markForCheck();
            })
          )
          .subscribe({
            next: () => {
              this.product = {
                ...this.product!,
                currentPrice: this.product!.price,
                discountPercentage: 0,
                originalPrice: this.product!.price,
                variants: this.product!.variants.map(v => {
                  if (v.promotionId) {
                    const { promotionId, discountType, discountValue, discountedPrice, originalPrice, ...cleanVariant } = v;
                    return cleanVariant as ProductVariant;
                  }
                  return v;
                })
              };

              // 🆕 NUEVO: Broadcasting para múltiples promociones
              affectedPromotionIds.forEach(promotionId => {
                this.promotionStateService.notifyPromotionDeactivated(
                  promotionId,
                  [this.product!.id]
                );
              });

              this.promotionChanged.emit({
                productId: this.product.id,
                updatedProduct: this.product
              });

              this.loadPromotions();
            },
            error: (error) => {
              console.error('Error:', error);
              this.message.error('Error al eliminar promociones');
            }
          });
      }
    });
  }

  getPromotionApplicationDetails(promotionId: string): {
    isProductLevel: boolean;
    affectedVariants: ProductVariant[];
    totalAffectedVariants: number;
  } {
    if (!this.product) {
      return { isProductLevel: false, affectedVariants: [], totalAffectedVariants: 0 };
    }

    // Verificar en las promociones aplicadas
    const appliedPromo = this.appliedPromotions.find(ap =>
      ap.promotionId === promotionId && ap.target === 'product'
    );

    const isProductLevel = !!appliedPromo;
    const affectedVariants = this.product.variants.filter(v => v.promotionId === promotionId);

    return {
      isProductLevel,
      affectedVariants,
      totalAffectedVariants: affectedVariants.length
    };
  }

  isPromotionActive(promotionId: string): boolean {
    if (!this.product) return false;

    // Verificar en promociones aplicadas
    const isInApplied = this.appliedPromotions.some(ap => ap.promotionId === promotionId);

    // Verificar en variantes
    const isInVariants = this.product.variants?.some(v => v.promotionId === promotionId) || false;

    return isInApplied || isInVariants;
  }

  isPromotionApplicable(promotion: Promotion): boolean {
    if (!this.product) return false;

    // Verificar si ya está aplicada
    if (this.isPromotionActive(promotion.id)) return false;

    // Verificar fechas
    const now = new Date();
    const startDate = promotion.startDate instanceof Date ? promotion.startDate : new Date(promotion.startDate);
    const endDate = promotion.endDate instanceof Date ? promotion.endDate : new Date(promotion.endDate);

    if (!promotion.isActive || startDate > now || endDate < now) return false;

    // Verificar si aplica a este producto
    return this.productPriceService.isPromotionApplicable(this.product, promotion);
  }

  calculatePromotionPreview(promotion: Promotion): {
    newPrice: number;
    discount: number;
    savings: number
  } {
    if (!this.product) return { newPrice: 0, discount: 0, savings: 0 };

    const result = this.productPriceService.calculatePriceWithPromotion(this.product, promotion);

    return {
      newPrice: result.currentPrice,
      discount: result.discountPercentage,
      savings: result.savings
    };
  }

  // Métodos de utilidad
  formatDiscountType(type: string): string {
    return type === 'percentage' ? 'Porcentaje' : 'Monto fijo';
  }

  formatDiscountValue(promotion: Promotion): string {
    return promotion.discountType === 'percentage'
      ? `${promotion.discountValue}%`
      : `$${promotion.discountValue.toFixed(2)}`;
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date instanceof Date ? date : new Date(date));
  }

  getVariantNames(variants: ProductVariant[]): string {
    if (!variants || !Array.isArray(variants) || variants.length === 0) {
      return 'Ninguna';
    }

    return variants
      .map(variant => `${variant.colorName}-${variant.sizeName}`)
      .join(', ');
  }

  /**
 * 🏷️ Verifica si el producto tiene promociones activas
 */
  hasActivePromotions(): boolean {
    if (!this.product) return false;

    if (this.product.discountPercentage && this.product.discountPercentage > 0) {
      return true;
    }

    if (this.product.currentPrice && this.product.currentPrice < this.product.price) {
      return true;
    }

    if (this.appliedPromotions && this.appliedPromotions.length > 0) {
      return true;
    }

    if (this.product.variants) {
      const hasVariantPromotions = this.product.variants.some(variant =>
        variant.promotionId ||
        (variant.discountedPrice && variant.discountedPrice < (variant.price || this.product!.price))
      );

      if (hasVariantPromotions) {
        return true;
      }
    }

    return false;
  }


  /**
   * 🔢 Cuenta el total de promociones activas
   */
  getTotalActivePromotions(): number {
    if (!this.product) return 0;

    let count = 0;

    count += this.appliedPromotions.filter(ap => ap.target === 'product').length;

    const variantPromotionIds = new Set(
      this.product.variants
        ?.filter(v => v.promotionId)
        .map(v => v.promotionId) || []
    );

    count += variantPromotionIds.size;

    return count;
  }

  /**
   * 📊 Obtiene información de descuento total
   */
  getTotalDiscountInfo(): { totalSavings: number; maxDiscount: number } {
    if (!this.product) return { totalSavings: 0, maxDiscount: 0 };

    let totalSavings = 0;
    let maxDiscount = 0;

    if (this.product.currentPrice && this.product.currentPrice < this.product.price) {
      const productSavings = this.product.price - this.product.currentPrice;
      totalSavings += productSavings;
      maxDiscount = Math.max(maxDiscount, this.product.discountPercentage || 0);
    }

    if (this.product.variants) {
      this.product.variants.forEach(variant => {
        if (variant.discountedPrice && variant.originalPrice) {
          const variantSavings = variant.originalPrice - variant.discountedPrice;
          totalSavings += variantSavings;

          const variantDiscountPercent = (variantSavings / variant.originalPrice) * 100;
          maxDiscount = Math.max(maxDiscount, variantDiscountPercent);
        }
      });
    }

    return {
      totalSavings: Math.round(totalSavings * 100) / 100,
      maxDiscount: Math.round(maxDiscount)
    };
  }

  /**
 * Obtiene el tooltip apropiado para el botón de acción
 */
  getActionTooltip(promo: Promotion): string {
    if (!this.isPromotionApplicable(promo)) {
      if (this.isPromotionActive(promo.id)) {
        return 'Promoción ya aplicada';
      }

      if (!promo.isActive) {
        return 'Promoción inactiva';
      }

      const now = new Date();
      const startDate = promo.startDate instanceof Date ? promo.startDate : new Date(promo.startDate);
      const endDate = promo.endDate instanceof Date ? promo.endDate : new Date(promo.endDate);

      if (startDate > now) {
        return 'Promoción no ha iniciado';
      }

      if (endDate < now) {
        return 'Promoción expirada';
      }

      return 'Promoción no aplicable';
    }

    return 'Aplicar promoción al producto';
  }

}