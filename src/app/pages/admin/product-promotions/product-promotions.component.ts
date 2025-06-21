import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../../services/admin/product/product.service';
import { ProductPriceService } from '../../../services/admin/price/product-price.service';
import { PromotionService } from '../../../services/admin/promotion/promotion.service';
import { PromotionStateService } from '../../../services/admin/promotionState/promotion-state.service';
import { CacheService } from '../../../services/admin/cache/cache.service';
import { Product, Promotion, ProductVariant } from '../../../models/models';
import { NzMessageService } from 'ng-zorro-antd/message';
import { finalize, forkJoin, take } from 'rxjs';

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
import { deleteField } from '@angular/fire/firestore';

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
  allPromotions: Promotion[] = []; // 🆕 NUEVO: Todas las promociones disponibles
  loading = false;
  applying = false;

  constructor(
    private productService: ProductService,
    private productPriceService: ProductPriceService,
    private promotionService: PromotionService, // 🆕 NUEVO: Agregar PromotionService
    private promotionStateService: PromotionStateService, // 🆕 NUEVO: Agregar PromotionStateService
    private cacheService: CacheService,
    private message: NzMessageService,
    private modal: NzModalService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    if (this.product) {
      this.loadPromotions();
      this.loadAllPromotions(); // 🆕 NUEVO: Cargar todas las promociones
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product'] && this.product) {
      this.loadPromotions();
      this.loadAllPromotions(); // 🆕 NUEVO
    }
  }

  // 🆕 NUEVO: Cargar todas las promociones disponibles
  loadAllPromotions(): void {
    this.promotionService.getPromotions()
      .pipe(
        take(1),
        finalize(() => this.cdr.markForCheck())
      )
      .subscribe({
        next: (promotions) => {
          this.allPromotions = promotions;
          console.log('📢 Promociones disponibles:', promotions.length);
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

    // 🆕 NUEVO: Debug del producto para entender su estado
    console.log('🔍 [DEBUG] Estado del producto:', {
      name: this.product.name,
      activePromotion: this.product.activePromotion,
      discountPercentage: this.product.discountPercentage,
      currentPrice: this.product.currentPrice,
      originalPrice: this.product.price,
      promotions: this.product.promotions?.length || 0,
      variantsWithPromo: this.product.variants?.filter(v => v.promotionId).length || 0
    });

    // Obtener TODAS las promociones activas
    this.promotionService.getActivePromotions()
      .pipe(
        take(1),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (allActivePromotions) => {
          console.log('🔍 [DEBUG] Promociones activas totales:', allActivePromotions.length);

          // 🆕 NUEVO: Buscar promociones que están aplicadas al producto
          this.promotions = allActivePromotions.filter(promo => {
            const isApplied = this.isPromotionReallyApplied(promo.id);
            console.log(`🔍 [DEBUG] Promoción ${promo.name}: aplicada = ${isApplied}`);
            return isApplied;
          });

          console.log(`📢 Promociones aplicadas al producto ${this.product?.name}:`, this.promotions.length);
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error al cargar promociones del producto:', error);
          this.message.error('Error al cargar promociones: ' + (error.message || 'Error desconocido'));
        }
      });
  }

  private isPromotionReallyApplied(promotionId: string): boolean {
    if (!this.product) return false;

    console.log(`🔍 [DEBUG] Verificando promoción ${promotionId}:`);

    // ✅ 1. Verificar activePromotion
    if (this.product.activePromotion === promotionId) {
      console.log(`   ✅ Encontrada en activePromotion`);
      return true;
    }

    // ✅ 2. Verificar array de promociones
    if (this.product.promotions?.some(p => p.id === promotionId)) {
      console.log(`   ✅ Encontrada en array promotions`);
      return true;
    }

    // ✅ 3. Verificar variantes
    if (this.product.variants?.some(v => v.promotionId === promotionId)) {
      console.log(`   ✅ Encontrada en variantes`);
      return true;
    }

    // ✅ 4. Verificar por descuento calculado (NUEVA LÓGICA)
    if (this.product.discountPercentage && this.product.discountPercentage > 0) {
      console.log(`   🔍 Producto tiene descuento ${this.product.discountPercentage}%`);

      // Buscar la promoción en allPromotions que coincida con el descuento
      const matchingPromotion = this.allPromotions.find(p => {
        if (p.id !== promotionId) return false;

        // Verificar si esta promoción es aplicable al producto
        const isApplicable = this.isPromotionApplicableToProduct(p);
        if (!isApplicable) return false;

        // Calcular el descuento esperado
        const preview = this.calculatePromotionPreview(p);
        const discountMatch = Math.abs(preview.discount - this.product!.discountPercentage!) < 1; // Margen de 1%

        console.log(`   🔍 Promoción ${p.name}: aplicable=${isApplicable}, descuento esperado=${preview.discount}%, actual=${this.product!.discountPercentage}%, coincide=${discountMatch}`);

        return discountMatch;
      });

      if (matchingPromotion) {
        console.log(`   ✅ Encontrada por coincidencia de descuento: ${matchingPromotion.name}`);
        return true;
      }
    }

    console.log(`   ❌ No encontrada`);
    return false;
  }

  private isPromotionApplicableToProduct(promotion: Promotion): boolean {
    if (!this.product) return false;

    // Verificar si aplica a este producto específicamente
    if (promotion.applicableProductIds && promotion.applicableProductIds.length > 0) {
      return promotion.applicableProductIds.includes(this.product.id);
    }

    // Verificar si aplica a la categoría del producto
    if (promotion.applicableCategories && promotion.applicableCategories.length > 0) {
      return promotion.applicableCategories.includes(this.product.category) ||
        (this.product.categories && this.product.categories.some(cat =>
          promotion.applicableCategories!.includes(cat)
        ));
    }

    // Si no tiene restricciones específicas, aplica a todos
    return true;
  }



  applyPromotion(promotionId: string): void {
    if (!this.product) return;

    this.applying = true;

    // 🔧 CORREGIDO: Usar ProductPriceService correctamente
    this.productPriceService.applyPromotionToProduct(this.product, promotionId)
      .pipe(
        take(1),
        finalize(() => {
          this.applying = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (updatedProduct) => {
          // Encontrar la promoción aplicada
          const appliedPromotion = this.allPromotions.find(p => p.id === promotionId);

          if (appliedPromotion) {
            // 🚀 NOTIFICAR APLICACIÓN
            this.promotionStateService.notifyPromotionApplied(
              updatedProduct.id,
              appliedPromotion
            );
          }

          // 🚀 ACTUALIZACIÓN OPTIMISTA LOCAL
          this.product = updatedProduct;

          // 🚀 EMITIR CAMBIO AL PADRE
          this.promotionChanged.emit({
            productId: updatedProduct.id,
            updatedProduct: updatedProduct
          });

          this.message.success('Promoción aplicada correctamente');

          // Recargar promociones para actualizar la vista
          this.loadPromotions();
        },
        error: (error) => {
          console.error('❌ Error aplicando promoción:', error);
          this.message.error('Error al aplicar promoción: ' + (error.message || 'Error desconocido'));
        }
      });
  }

  // 🔧 CORREGIDO: Método para remover promociones específicas
  removePromotion(promotionId: string): void {
    if (!this.product) return;

    this.modal.confirm({
      nzTitle: '¿Eliminar promoción?',
      nzContent: '¿Está seguro de que desea eliminar esta promoción del producto?',
      nzOkText: 'Eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.applying = true;

        // Verificar si hay variantes con esta promoción
        const variantsWithPromotion = this.product!.variants.filter(
          variant => variant.promotionId === promotionId
        );

        if (variantsWithPromotion.length > 0) {
          // Eliminar promoción de variantes específicas
          const removeObservables = variantsWithPromotion.map(variant =>
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
                this.updateProductAfterPromotionRemoval(promotionId);
                this.message.success('Promoción eliminada correctamente');
                this.loadPromotions();
              },
              error: (error) => {
                console.error('❌ Error eliminando promoción de variantes:', error);
                this.message.error('Error al eliminar promoción');
                this.loadPromotions();
              }
            });
        } else {
          // La promoción está a nivel de producto, no de variantes
          this.removePromotionFromProduct(promotionId);
        }
      }
    });

    this.promotionStateService.notifyPromotionRemoved(
      this.product!.id,
      promotionId
    );
  }

  // 🆕 NUEVO: Actualizar producto después de remover promoción
  private updateProductAfterPromotionRemoval(promotionId: string): void {
    if (!this.product) return;

    // Actualizar variantes localmente
    const updatedVariants = this.product.variants.map(variant => {
      if (variant.promotionId === promotionId) {
        const { promotionId: _, discountType, discountValue, discountedPrice, ...cleanVariant } = variant;
        return cleanVariant;
      }
      return variant;
    });

    // Actualizar producto
    this.product = {
      ...this.product,
      activePromotion: this.product.activePromotion === promotionId ? undefined : this.product.activePromotion,
      promotions: this.product.promotions?.filter(p => p.id !== promotionId),
      currentPrice: this.product.activePromotion === promotionId ? this.product.price : this.product.currentPrice,
      discountPercentage: this.product.activePromotion === promotionId ? 0 : this.product.discountPercentage,
      variants: updatedVariants
    };

    this.promotionChanged.emit({
      productId: this.product.id,
      updatedProduct: this.product
    });
  }

  // 🆕 NUEVO: Método para promociones a nivel de producto
  private removePromotionFromProduct(promotionId: string): void {
    const updatedProduct = {
      ...this.product!,
      promotions: this.product!.promotions?.filter(p => p.id !== promotionId),
      activePromotion: this.product!.activePromotion === promotionId ? undefined : this.product!.activePromotion,
      currentPrice: this.product!.activePromotion === promotionId ? this.product!.price : this.product!.currentPrice,
      discountPercentage: this.product!.activePromotion === promotionId ? 0 : this.product!.discountPercentage
    };

    this.productService.updateProduct(this.product!.id, {
      promotions: updatedProduct.promotions,
      activePromotion: updatedProduct.activePromotion,
      currentPrice: updatedProduct.currentPrice,
      discountPercentage: updatedProduct.discountPercentage
    })
      .pipe(
        take(1),
        finalize(() => {
          this.applying = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.product = updatedProduct;
          this.promotionChanged.emit({
            productId: this.product.id,
            updatedProduct: this.product
          });
          this.message.success('Promoción eliminada correctamente');
          this.loadPromotions();
        },
        error: (error) => {
          console.error('❌ Error eliminando promoción:', error);
          this.message.error('Error al eliminar promoción');
          this.loadPromotions();
        }
      });
  }

  removeAllPromotions(): void {
  if (!this.product) return;

  this.modal.confirm({
    nzTitle: '¿Está seguro de eliminar todas las promociones?',
    nzContent: 'Esta acción eliminará todas las promociones asociadas a este producto.',
    nzOkText: 'Eliminar',
    nzOkType: 'primary',
    nzOkDanger: true,
    nzOnOk: () => {
      this.applying = true;

      // 🔧 SOLUCIÓN: Usar el método de sanitización del ProductService
      const rawUpdateData = {
        promotions: [],
        activePromotion: deleteField(),
        currentPrice: deleteField(),
        discountPercentage: deleteField()
      };

      // ✅ CORRECCIÓN: Usar el método de sanitización
      const sanitizedData = this.productService.sanitizeDataForFirestore(rawUpdateData);

      this.productService.updateProduct(this.product!.id, sanitizedData)
        .pipe(
          take(1),
          finalize(() => {
            this.applying = false;
            this.cdr.markForCheck();
          })
        )
        .subscribe({
          next: () => {
            console.log('✅ Promociones eliminadas en servidor');
            
            // 🔧 LIMPIAR ESTADO EN PROMOTION STATE SERVICE
            this.promotionStateService.clearProductPromotions(this.product!.id);

            // 🔧 INVALIDACIÓN COMPLETA Y FORZADA
            this.cacheService.invalidateProductCache(this.product!.id);
            this.cacheService.clearCache();

            // 🔧 NOTIFICAR AL PROMOTION STATE SERVICE
            this.promotionStateService.notifyPromotionRemoved(
              this.product!.id,
              this.product!.activePromotion || 'unknown'
            );

            // 🔧 REFRESCO FORZADO CON DELAY
            setTimeout(() => {
              this.productService.forceRefreshProduct(this.product!.id)
                .pipe(take(1))
                .subscribe({
                  next: (refreshedProduct) => {
                    if (refreshedProduct) {
                      console.log('🔄 Producto refrescado:', {
                        activePromotion: refreshedProduct.activePromotion,
                        discountPercentage: refreshedProduct.discountPercentage
                      });

                      this.product = refreshedProduct;
                      this.promotionChanged.emit({
                        productId: refreshedProduct.id,
                        updatedProduct: refreshedProduct
                      });
                    }
                    this.loadPromotions();
                    this.message.success('Promociones eliminadas correctamente');
                  },
                  error: (error) => {
                    console.error('Error refrescando producto:', error);
                    this.loadPromotions();
                  }
                });
            }, 1500);
          },
          error: (error) => {
            console.error('❌ Error al eliminar promociones en servidor:', error);
            this.loadPromotions();
            this.message.error('Error al eliminar promociones: ' + (error.message || 'Error desconocido'));
          }
        });
    }
  });
}


  // 🆕 NUEVO: Obtener detalles de dónde está aplicada la promoción
  getPromotionApplicationDetails(promotionId: string): {
    isProductLevel: boolean;
    affectedVariants: ProductVariant[];
    totalAffectedVariants: number;
  } {
    if (!this.product) {
      return { isProductLevel: false, affectedVariants: [], totalAffectedVariants: 0 };
    }

    const isProductLevel = this.product.activePromotion === promotionId;
    const affectedVariants = this.product.variants.filter(v => v.promotionId === promotionId);

    return {
      isProductLevel,
      affectedVariants,
      totalAffectedVariants: affectedVariants.length
    };
  }

  // 🆕 NUEVO: Verificar si una promoción está activa
  isPromotionActive(promotionId: string): boolean {
    if (!this.product) return false;

    // Verificar si está activa a nivel de producto
    const isProductLevelActive = this.product.activePromotion === promotionId ||
      this.product.promotions?.some(p => p.id === promotionId) || false;

    // Verificar si alguna variante tiene esta promoción
    const isVariantLevelActive = this.product.variants?.some(v => v.promotionId === promotionId) || false;

    return isProductLevelActive || isVariantLevelActive;
  }

  // 🆕 NUEVO: Verificar si una promoción es aplicable
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
    if (promotion.applicableProductIds && promotion.applicableProductIds.length > 0) {
      return promotion.applicableProductIds.includes(this.product.id);
    }

    // Verificar si aplica a la categoría
    if (promotion.applicableCategories && promotion.applicableCategories.length > 0) {
      return promotion.applicableCategories.includes(this.product.category) ||
        (this.product.categories && this.product.categories.some(cat =>
          promotion.applicableCategories!.includes(cat)
        ));
    }

    return true; // Si no tiene restricciones específicas, aplica a todos
  }

  // Utilidades existentes mejoradas
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

  // 🆕 NUEVO: Calcular precio con promoción preview
  calculatePromotionPreview(promotion: Promotion): {
    newPrice: number;
    discount: number;
    savings: number
  } {
    if (!this.product) return { newPrice: 0, discount: 0, savings: 0 };

    const originalPrice = this.product.currentPrice || this.product.price;
    let discount = 0;

    if (promotion.discountType === 'percentage') {
      discount = (originalPrice * promotion.discountValue) / 100;
      if (promotion.maxDiscountAmount && discount > promotion.maxDiscountAmount) {
        discount = promotion.maxDiscountAmount;
      }
    } else {
      discount = promotion.discountValue;
    }

    const newPrice = Math.max(0, originalPrice - discount);
    const discountPercentage = originalPrice > 0 ? (discount / originalPrice) * 100 : 0;

    return {
      newPrice,
      discount: discountPercentage,
      savings: discount
    };
  }

  getVariantNames(variants: ProductVariant[]): string {
    if (!variants || !Array.isArray(variants) || variants.length === 0) {
      return 'Ninguna';
    }

    return variants
      .map(variant => `${variant.colorName}-${variant.sizeName}`)
      .join(', ');
  }
}