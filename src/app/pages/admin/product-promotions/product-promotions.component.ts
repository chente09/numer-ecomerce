import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
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
  @Output() promotionChanged = new EventEmitter<{
    productId: string;
    updatedProduct?: Product;
  }>();

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
    
    this.productPriceService.getPromotionsForProduct(this.product.id)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (promotions) => {
          this.promotions = promotions;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error al cargar promociones:', error);
          this.message.error('Error al cargar promociones: ' + (error.message || 'Error desconocido'));
        }
      });
  }

  applyPromotion(promotionId: string): void {
    if (!this.product) return;
    
    this.loading = true;
    
    this.productPriceService.applyPromotionToProduct(this.product, promotionId)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (updatedProduct) => {
          // 🚀 ACTUALIZACIÓN OPTIMISTA LOCAL
          this.product = updatedProduct;
          
          // 🚀 EMITIR CAMBIO AL PADRE
          this.promotionChanged.emit({
            productId: updatedProduct.id,
            updatedProduct: updatedProduct
          });
          
          this.message.success('Promoción aplicada correctamente');
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.message.error('Error al aplicar promoción: ' + (error.message || 'Error desconocido'));
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
        
        // 🚀 ACTUALIZACIÓN OPTIMISTA LOCAL
        const optimisticProduct = {
          ...this.product!,
          promotions: [],
          activePromotion: undefined,
          currentPrice: this.product!.price, // Restaurar precio original
          discountPercentage: 0
        };
        
        this.product = optimisticProduct;
        
        // 🚀 EMITIR CAMBIO AL PADRE INMEDIATAMENTE
        this.promotionChanged.emit({
          productId: optimisticProduct.id,
          updatedProduct: optimisticProduct
        });
        
        this.message.success('Promociones eliminadas correctamente');
        this.cdr.markForCheck();
        
        // Procesar en servidor en segundo plano
        this.productService.updateProduct(this.product!.id, {
          promotions: [],
          activePromotion: undefined,
          currentPrice: undefined,
          discountPercentage: undefined
        })
        .pipe(
          finalize(() => {
            this.loading = false;
            this.cdr.markForCheck();
          })
        )
        .subscribe({
          next: () => {
            console.log('✅ Promociones eliminadas en servidor');
            // La UI ya está actualizada optimísticamente
          },
          error: (error) => {
            console.error('❌ Error al eliminar promociones en servidor:', error);
            
            // 🔄 ROLLBACK: Restaurar promociones si falla
            this.loadPromotions(); // Recargar estado desde servidor
            this.message.error('Error al eliminar promociones: ' + (error.message || 'Error desconocido'));
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