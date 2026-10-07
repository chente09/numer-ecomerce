import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductPriceService } from '../../../services/admin/price/product-price.service';
import { PromotionService } from '../../../services/admin/promotion/promotion.service';
import { PromotionStateService } from '../../../services/admin/promotionState/promotion-state.service';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { AppliedPromotionsService } from '../../../services/admin/applied-promotions/applied-promotions.service';
import { Product, Promotion, ProductVariant, AppliedPromotion } from '../../../models/models';
import { NzMessageService } from 'ng-zorro-antd/message';
import { finalize, forkJoin, of, switchMap, take } from 'rxjs';
import { Firestore, deleteField, doc, runTransaction, writeBatch } from '@angular/fire/firestore';

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

  private firestore = inject(Firestore);

  promotions: Promotion[] = [];
  allPromotions: Promotion[] = [];
  appliedPromotions: AppliedPromotion[] = []; // Para tracking interno
  categories: Category[] = [];
  loading = false;
  applying = false;

  // Nombre del componente para registro
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

  // ngOnDestroy para cleanup
  ngOnDestroy(): void {
    // 🗑️ Desregistrar componente
    this.promotionStateService.unregisterComponent(this.COMPONENT_NAME);
  }

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
    this.promotionService.getStandardPromotions() // <-- Ahora llama al nuevo método filtrado
      .pipe(
        take(1),
        finalize(() => this.cdr.markForCheck())
      )
      .subscribe({
        next: (standardPromotions) => {
          // La lista 'allPromotions' ahora solo contendrá promociones estándar
          this.allPromotions = standardPromotions;
        },
        error: (error) => {
          console.error('Error cargando las promociones estándar:', error);
          this.message.error('Error al cargar promociones disponibles');
        }
      });
  }

  loadPromotions(): void {
    if (!this.product) return;

    this.loading = true;
    this.cdr.markForCheck();

    // Paso 1: Obtener los registros de las promociones que han sido aplicadas a este producto.
    this.appliedPromotionsService.getAppliedPromotions(this.product.id).pipe(
      switchMap(appliedPromos => {
        this.appliedPromotions = appliedPromos;
        const appliedIds = appliedPromos.map(a => a.promotionId);

        if (appliedIds.length === 0) {
          // Si no hay promociones aplicadas, devolvemos un array vacío y terminamos.
          return of([]);
        }

        // Paso 2: Para cada ID de promoción aplicada, buscar sus detalles completos.
        // Usamos forkJoin para hacer todas las llamadas a la vez.
        const promotionObservables = appliedIds.map(id => this.promotionService.getPromotionById(id));
        return forkJoin(promotionObservables);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (promotionsDetails) => {
        // El resultado es un array con los objetos Promotion completos.
        // Filtramos por si alguna promoción fue eliminada pero su registro de aplicación quedó huérfano.
        this.promotions = promotionsDetails.filter(p => p !== null) as Promotion[];
      },
      error: (error) => {
        console.error('Error cargando promociones aplicadas:', error);
        this.message.error('Error al cargar las promociones aplicadas a este producto.');
      }
    });
  }

  async applyPromotion(promotionId: string): Promise<void> {
    if (!this.product) return;

    this.applying = true;
    this.cdr.markForCheck();

    const promotion = this.allPromotions.find(p => p.id === promotionId);
    if (!promotion) {
      this.message.error('Promoción no encontrada');
      this.applying = false;
      this.cdr.markForCheck();
      return;
    }

    // Definir las referencias a los documentos que vamos a modificar
    const productRef = doc(this.firestore, 'products', this.product.id);
    const appliedPromoRef = doc(this.firestore, 'appliedPromotions', `${this.product.id}_${promotionId}`);

    try {
      // ✅ CAMBIO CLAVE: Iniciar una transacción
      await runTransaction(this.firestore, async (transaction) => {
        // 1. Leer el estado actual del producto DENTRO de la transacción
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) {
          throw new Error("El producto no existe.");
        }
        const currentProductData = productDoc.data() as Product;

        // 2. Calcular el nuevo precio
        const pricing = this.productPriceService.calculatePriceWithPromotion(currentProductData, promotion);

        // 3. Preparar la actualización del producto
        const productUpdatePayload = {
          currentPrice: pricing.currentPrice,
          discountPercentage: pricing.discountPercentage,
          originalPrice: currentProductData.price
        };
        transaction.update(productRef, productUpdatePayload);

        // 4. Preparar la creación del registro de promoción aplicada
        const appliedPromotionPayload: AppliedPromotion = {
          promotionId,
          target: 'product',
          targetId: this.product!.id,
          appliedAt: new Date(),
          expiresAt: promotion.endDate,
          appliedBy: 'admin' // O el ID del admin actual si lo tienes
        };
        transaction.set(appliedPromoRef, appliedPromotionPayload);
      });

      // ✅ ÉXITO: Si la transacción se completa, actualiza el estado local y notifica
      this.message.success(`Promoción "${promotion.name}" aplicada correctamente.`);
      this.loadPromotions(); // Recargar la lista de promociones aplicadas
      this.promotionStateService.notifyPromotionActivated(promotionId, [this.product.id]);
      this.promotionChanged.emit({ productId: this.product.id });


    } catch (error) {
      // ❌ FALLO: Si algo falla, la transacción se revierte automáticamente
      console.error('❌ La transacción para aplicar la promoción falló:', error);
      this.message.error('No se pudo aplicar la promoción. La base de datos está segura.');
    } finally {
      // Siempre se ejecuta, para detener el spinner
      this.applying = false;
      this.cdr.markForCheck();
    }
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

  private async removePromotionFromVariants(promotionId: string, variants: ProductVariant[], promotionName: string): Promise<void> {
    if (!this.product) return;

    // Usaremos un "Batch Write" que es como una transacción para múltiples documentos
    const batch = writeBatch(this.firestore);

    variants.forEach(variant => {
      // 1. Preparar la actualización para limpiar la variante
      const variantRef = doc(this.firestore, 'productVariants', variant.id);
      batch.update(variantRef, {
        promotionId: deleteField(),
        discountType: deleteField(),
        discountValue: deleteField(),
        discountedPrice: deleteField(),
        originalPrice: deleteField()
      });

      // 2. Preparar la eliminación del registro en appliedPromotions
      const appliedPromoRef = doc(this.firestore, 'appliedPromotions', `${variant.id}_${promotionId}`);
      batch.delete(appliedPromoRef);
    });

    try {
      // 3. Ejecutar todas las operaciones del lote de forma atómica
      await batch.commit();

      // Éxito: notificar al usuario y actualizar el estado local
      this.message.success(`Promoción "${promotionName}" removida de ${variants.length} variante(s).`);
      this.loadPromotions(); // Recargar datos
      this.promotionStateService.notifyPromotionDeactivated(promotionId, [this.product.id]);
      this.promotionChanged.emit({ productId: this.product.id });

    } catch (error) {
      // Fallo: el lote se revierte, la base de datos queda intacta
      console.error('❌ El lote para remover la promoción de variantes falló:', error);
      this.message.error('No se pudo remover la promoción de las variantes.');
    } finally {
      this.applying = false;
      this.cdr.markForCheck();
    }
  }

  private async removePromotionFromProduct(promotionId: string, promotionName: string): Promise<void> {
    if (!this.product) return;

    this.applying = true;
    this.cdr.markForCheck();

    // Definir las referencias a los documentos que vamos a modificar
    const productRef = doc(this.firestore, 'products', this.product.id);
    const appliedPromoRef = doc(this.firestore, 'appliedPromotions', `${this.product.id}_${promotionId}`);

    try {
      // ✅ CAMBIO CLAVE: Iniciar una transacción
      await runTransaction(this.firestore, async (transaction) => {
        // 1. Leer el estado actual del producto DENTRO de la transacción
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) {
          throw new Error("El producto no existe.");
        }
        const currentProductData = productDoc.data() as Product;

        // 2. Preparar la reversión de precios en el producto
        const productUpdatePayload = {
          currentPrice: currentProductData.price, // Revertir al precio original
          discountPercentage: 0,
          originalPrice: currentProductData.price
        };
        transaction.update(productRef, productUpdatePayload);

        // 3. Preparar la eliminación del registro de promoción aplicada
        transaction.delete(appliedPromoRef);
      });

      // ✅ ÉXITO: Si la transacción se completa, actualiza el estado local y notifica
      this.message.success(`Promoción "${promotionName}" removida correctamente.`);
      this.loadPromotions();
      this.promotionStateService.notifyPromotionDeactivated(promotionId, [this.product.id]);
      this.promotionChanged.emit({ productId: this.product.id });

    } catch (error) {
      // ❌ FALLO: Si algo falla, la transacción se revierte automáticamente
      console.error('❌ La transacción para remover la promoción falló:', error);
      this.message.error('No se pudo remover la promoción. La base de datos está segura.');
    } finally {
      // Siempre se ejecuta, para detener el spinner
      this.applying = false;
      this.cdr.markForCheck();
    }
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

              // Broadcasting para múltiples promociones
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

    // Condición 1: La promoción no debe estar ya aplicada a este producto.
    if (this.isPromotionActive(promotion.id)) {
      return false;
    }

    // Condición 2: La promoción debe estar activa y dentro de su rango de fechas.
    const now = new Date();
    const startDate = promotion.startDate instanceof Date ? promotion.startDate : new Date(promotion.startDate);
    const endDate = promotion.endDate instanceof Date ? promotion.endDate : new Date(promotion.endDate);

    if (!promotion.isActive || startDate > now || endDate < now) {
      return false;
    }

    // Si pasa todas las validaciones, entonces el administrador PUEDE aplicarla.
    // Ya no llamamos a productPriceService para una validación automática.
    return true;
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