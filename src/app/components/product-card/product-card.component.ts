import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { Color, Product } from '../../models/models';
import { FormsModule } from '@angular/forms';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';

interface ProductWithSelectedColor extends Product {
  selectedColorIndex?: number;
  displayImageUrl?: string;
}

@Component({
  selector: 'app-product-card',
  imports: [
    CommonModule,
    RouterLink,
    NzRateModule,
    FormsModule,
    NzSpinModule,
    NzEmptyModule,
  ],
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductCardComponent {

  @Input() product!: ProductWithSelectedColor;
  @Input() showColorOptions = true;
  @Input() cardSize: 'small' | 'medium' | 'large' = 'medium';

  @Output() colorChanged = new EventEmitter<{ product: Product, color: Color, index: number }>();

  selectColor(color: Color, index: number): void {
    this.product.selectedColorIndex = index;
    this.product.displayImageUrl = color.imageUrl || this.product.imageUrl;
    this.colorChanged.emit({ product: this.product, color, index });
  }

  // Reutilizar métodos de ProductosSectionComponent
  hasColors(): boolean {
    return !!(this.product?.colors && this.product.colors.length > 0);
  }

  isColorActive(index: number): boolean {
    return this.product?.selectedColorIndex === index;
  }

  getDisplayImageUrl(): string {
    return this.product?.displayImageUrl || this.product?.imageUrl || '';
  }

  hasDiscount(): boolean {
    return !!(this.product?.discountPercentage && this.product.discountPercentage > 0);
  }

  getDiscountPercentage(): number {
    return Math.round(this.product?.discountPercentage || 0);
  }

  getCurrentPrice(): number {
    return this.product?.currentPrice || this.product?.price || 0;
  }

  getOriginalPrice(): number {
    return this.product?.originalPrice || this.product?.price || 0;
  }

  formatPrice(price: number): string {
    return price.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

}
