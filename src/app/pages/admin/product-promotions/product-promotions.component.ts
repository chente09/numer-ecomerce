import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../../services/admin/product/product.service';
import { ProductPriceService } from '../../../services/admin/price/product-price.service';
import { Product, Promotion } from '../../../models/models';
import { NzMessageService } from 'ng-zorro-antd/message';
import { finalize } from 'rxjs';

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

  promotions: Promotion[] = [];
  loading = false;

  constructor(
    private productService: ProductService,
    private productPriceService: ProductPriceService,
    private message: NzMessageService,
    private modal: NzModalService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    if (this.product) {
      this.loadPromotions();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product'] && this.product) {
      this.loadPromotions();
    }
  }

  loadPromotions(): void {
    if (!this.product) return;

    this.loading = true;
    this.cdr.detectChanges(); // Añadido para actualizar la UI inmediatamente

    this.productPriceService.getPromotionsForProduct(this.product.id)
      .subscribe({
        next: (promotions) => {
          this.promotions = promotions;
          this.loading = false; // Cambiamos el estado aquí directamente
          console.log('Promociones cargadas:', promotions.length);
          this.cdr.detectChanges(); // Forzamos la detección de cambios
        },
        error: (error) => {
          console.error('Error al cargar promociones:', error);
          this.message.error('Error al cargar promociones: ' + (error.message || 'Error desconocido'));
          this.loading = false; // También lo cambiamos en caso de error
          this.cdr.detectChanges();
        },
        complete: () => {
          // Este callback asegura que loading sea false incluso si el observable completa sin emitir valores
          this.loading = false;
          console.log('Observable de promociones completado');
          this.cdr.detectChanges();
        }
      });
  }

  applyPromotion(promotionId: string): void {
    if (!this.product) return;

    this.loading = true;
    this.cdr.detectChanges();

    this.productPriceService.applyPromotionToProduct(this.product, promotionId)
      .subscribe({
        next: (updatedProduct) => {
          // Actualizar producto en el componente padre
          this.product = updatedProduct;
          this.loading = false;
          this.message.success('Promoción aplicada correctamente');
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.loading = false;
          this.message.error('Error al aplicar promoción: ' + (error.message || 'Error desconocido'));
          this.cdr.detectChanges();
        },
        complete: () => {
          this.loading = false;
          this.cdr.detectChanges();
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
        this.loading = true;
        this.cdr.detectChanges();

        // Extraer solo las propiedades que queremos actualizar
        const { activePromotion, promotions, currentPrice, discountPercentage, ...productWithoutPromotions } = this.product!;

        // Crear un objeto con solo las propiedades que queremos cambiar
        const updatedFields = {
          promotions: [] as any[] // Array vacío para limpiar promociones
        };

        // Actualizar solo los campos específicos
        this.productService.updateProduct(this.product!.id, updatedFields)
          .subscribe({
            next: () => {
              // Crear una copia local actualizada del producto
              const updatedLocalProduct = {
                ...this.product!,
                promotions: [],
                activePromotion: undefined,
                currentPrice: undefined,
                discountPercentage: undefined
              };

              // Recalcular precio
              const updatedWithPrice = this.productPriceService.calculateDiscountedPrice(updatedLocalProduct);

              this.product = updatedWithPrice;
              this.loading = false;
              this.message.success('Promociones eliminadas correctamente');
              this.cdr.detectChanges();
            },
            error: (error) => {
              this.loading = false;
              this.message.error('Error al eliminar promociones: ' + (error.message || 'Error desconocido'));
              this.cdr.detectChanges();
            }
          });
      }
    });
  }

  // Utilidades
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

  isActivePromotion(promotionId: string): boolean {
    return this.product?.activePromotion === promotionId;
  }
}