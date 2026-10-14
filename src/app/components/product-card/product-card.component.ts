import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { Color, Product } from '../../models/models';
import { FormsModule } from '@angular/forms';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { resolveEffectivePrice } from '../../core/pricing';

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
export class ProductCardComponent implements AfterViewInit {
  @ViewChild('colorsContainer') colorsContainer!: ElementRef;

  @Input() product!: ProductWithSelectedColor;
  @Input() showColorOptions = true;
  @Input() cardSize: 'small' | 'medium' | 'large' = 'medium';

  @Output() colorChanged = new EventEmitter<{ product: Product, color: Color, index: number }>();

  private readonly SCROLL_AMOUNT = 120;

  selectColor(color: Color, index: number): void {
    this.product.selectedColorIndex = index;
    this.product.displayImageUrl = color.imageUrl || this.product.imageUrl;
    this.colorChanged.emit({ product: this.product, color, index });

    // Scroll automático y actualizar indicadores
    setTimeout(() => {
      this.scrollToSelectedColor(index);
      this.updateScrollIndicators();
    }, 50);
  }

  ngAfterViewInit(): void {
    // Inicializar indicadores después de que la vista esté lista
    setTimeout(() => this.initializeScrollIndicators(), 100);
  }

  private initializeScrollIndicators(): void {
    const container = this.colorsContainer?.nativeElement;
    if (!container) return;

    const colorOptions = container.closest('.color-options') as HTMLElement;
    if (!colorOptions) return;

    // Verificar si necesita scroll
    const needsScroll = container.scrollWidth > container.clientWidth;

    if (needsScroll) {
      colorOptions.classList.add('has-scroll');
      this.updateScrollIndicators();

      // Agregar listener para actualizar indicadores durante scroll
      container.addEventListener('scroll', () => {
        this.updateScrollIndicators();
      }, { passive: true });
    } else {
      colorOptions.classList.remove('has-scroll');
    }
  }

  // ✅ CORREGIDO: Método de scroll sin productId
  scrollColors(direction: 'left' | 'right'): void {
    const container = this.colorsContainer?.nativeElement;
    if (!container) return;

    const scrollAmount = direction === 'left' ? -this.SCROLL_AMOUNT : this.SCROLL_AMOUNT;

    container.scrollBy({
      left: scrollAmount,
      behavior: 'smooth'
    });

    // ✅ CRÍTICO: Actualizar indicadores después del scroll
    setTimeout(() => this.updateScrollIndicators(), 100);
  }

  // ✅ CORREGIDO: Scroll automático al color seleccionado
  private scrollToSelectedColor(colorIndex: number): void {
    const container = this.colorsContainer?.nativeElement;
    if (!container) return;

    const colorElement = container.children[colorIndex] as HTMLElement;
    if (!colorElement) return;

    const containerRect = container.getBoundingClientRect();
    const colorRect = colorElement.getBoundingClientRect();

    // Verificar si está fuera del área visible
    const isOutOfView = colorRect.left < containerRect.left || colorRect.right > containerRect.right;

    if (isOutOfView) {
      const scrollPosition = colorElement.offsetLeft - (container.clientWidth / 2) + (colorElement.clientWidth / 2);

      container.scrollTo({
        left: Math.max(0, scrollPosition),
        behavior: 'smooth'
      });
    }
  }

  // ✅ CORREGIDO: Método para actualizar indicadores
  private updateScrollIndicators(): void {
    const container = this.colorsContainer?.nativeElement;
    if (!container) return;

    const colorOptions = container.closest('.color-options') as HTMLElement;
    if (!colorOptions) return;

    const leftIndicator = colorOptions.querySelector('.scroll-left') as HTMLElement;
    const rightIndicator = colorOptions.querySelector('.scroll-right') as HTMLElement;

    if (!leftIndicator || !rightIndicator) return;

    const canScrollLeft = container.scrollLeft > 5;
    const canScrollRight = container.scrollLeft < (container.scrollWidth - container.clientWidth - 5);

    // ✅ FUNCIONALIDAD COMPLETA como en ProductosSectionComponent
    leftIndicator.style.opacity = canScrollLeft ? '1' : '0.3';
    rightIndicator.style.opacity = canScrollRight ? '1' : '0.3';
    leftIndicator.style.pointerEvents = canScrollLeft ? 'auto' : 'none';
    rightIndicator.style.pointerEvents = canScrollRight ? 'auto' : 'none';
  }

  // ✅ CORREGIDO: Métodos sin parámetros para uso en template
  hasColors(): boolean {
    return !!(this.product?.colors && this.product.colors.length > 0);
  }

  hasManyColors(): boolean {
    return !!(this.product?.colors && this.product.colors.length > 4);
  }

  isColorActive(index: number): boolean {
    return this.product?.selectedColorIndex === index;
  }

  getColorCount(): number {
    return this.product?.colors?.length || 0;
  }

  getActiveColorName(): string {
    if (!this.hasColors() || this.product.selectedColorIndex === undefined) {
      return '';
    }
    const activeColor = this.product.colors[this.product.selectedColorIndex];
    return activeColor?.name || '';
  }

  getDisplayImageUrl(): string {
    return this.product?.displayImageUrl || this.product?.imageUrl || '';
  }

  /** Whole-product discount (every variant is cheaper). */
  hasDiscount(): boolean {
    return resolveEffectivePrice(this.product).hasDiscount;
  }

  getDiscountPercentage(): number {
    return resolveEffectivePrice(this.product).discountPercentage;
  }

  // ── Variant-level offers: only some color/size combinations are discounted ──

  private discountedVariants(colorName?: string) {
    if (!this.product || this.hasDiscount()) return [];
    return (this.product.variants ?? [])
      .map(variant => ({ variant, price: resolveEffectivePrice(this.product, variant) }))
      .filter(x => x.price.hasDiscount && (!colorName || x.variant.colorName === colorName));
  }

  private selectedColorName(): string | undefined {
    const index = this.product?.selectedColorIndex;
    return index === undefined ? undefined : this.product.colors?.[index]?.name;
  }

  /** True when this color has at least one discounted size (shown as a dot on the swatch). */
  colorHasOffer(color: Color): boolean {
    return this.discountedVariants(color.name).length > 0;
  }

  /** Badge text for variant-level offers, e.g. "-10% en Negro · S, M". Empty when there is none. */
  variantOfferLabel(): string {
    const offers = this.discountedVariants();
    if (offers.length === 0) return '';
    const percent = Math.max(...offers.map(o => o.price.discountPercentage));
    const colors = [...new Set(offers.map(o => o.variant.colorName).filter(Boolean))];
    const sizes = [...new Set(offers.map(o => o.variant.sizeName).filter(Boolean))];
    if (colors.length === 1) {
      return `-${percent}% en ${colors[0]}${sizes.length > 0 && sizes.length <= 3 ? ' · ' + sizes.join(', ') : ''}`;
    }
    return `-${percent}% en ${offers.length} variantes`;
  }

  /** Price block: product discount, else the selected color's discounted variant, else regular price. */
  private displayPrice() {
    const whole = resolveEffectivePrice(this.product);
    if (whole.hasDiscount) return whole;
    const offers = this.discountedVariants(this.selectedColorName());
    if (offers.length === 0) return whole;
    return offers.reduce((best, o) => (o.price.unitPrice < best.unitPrice ? o.price : best), offers[0].price);
  }

  showsDiscountedPrice(): boolean {
    return this.displayPrice().hasDiscount;
  }

  /** The discounted price only holds for some sizes of this color. */
  showsFromPrice(): boolean {
    return !this.hasDiscount() && this.showsDiscountedPrice();
  }

  getCurrentPrice(): number {
    return this.displayPrice().unitPrice;
  }

  getOriginalPrice(): number {
    return this.displayPrice().originalUnitPrice;
  }

  formatPrice(price: number): string {
    return price.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // ✅ NUEVO: Método para manejar errores de imagen
  handleImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target && !target.classList.contains('fallback-applied')) {
      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOGY4Ii8+PC9zdmc+';
      target.classList.add('fallback-applied');
      target.alt = 'Imagen no disponible';
    }
  }
}