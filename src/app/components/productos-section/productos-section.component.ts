import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, ViewChildren, QueryList, AfterViewInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { ProductService } from '../../services/admin/product/product.service';
import { Product, Color } from '../../models/models';
import { NzMessageService } from 'ng-zorro-antd/message';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, map } from 'rxjs';
import { ProductCardComponent } from '../product-card/product-card.component';

interface ProductWithSelectedColor extends Product {
  selectedColorIndex?: number;
  displayImageUrl?: string;
}

@Component({
  selector: 'app-productos-section',
  standalone: true,
  imports: [
    CommonModule,
    NzSpinModule,
    NzRateModule,
    NzEmptyModule,
    RouterLink,
    FormsModule,
    ProductCardComponent
  ],
  templateUrl: './productos-section.component.html',
  styleUrls: ['./productos-section.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductosSectionComponent implements OnInit, OnDestroy {


  private destroy$ = new Subject<void>();

  // Estados de carga y datos
  productsLoading = false;
  hasError = false;
  allProducts: Product[] = [];
  featuredProducts: ProductWithSelectedColor[] = [];

  // Configuración mejorada
  private readonly MAX_FEATURED_PRODUCTS = 8;
  private readonly FALLBACK_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOGY4Ii8+PGcgZmlsbD0iIzk5OSI+PGNpcmNsZSBjeD0iMTIwIiBjeT0iMTAwIiByPSIyMCIvPjxwYXRoIGQ9Im05MCAx NjBoNjB2NDBINTB6Ii8+PC9nPjx0ZXh0IHg9IjUwJSIgeT0iODAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlByb2R1Y3RvPC90ZXh0Pjwvc3ZnPg==';

  constructor(
    private productService: ProductService,
    private message: NzMessageService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.loadFeaturedProducts();

    // ✅ OPCIONAL: Safety net
    setTimeout(() => {
      if (this.productsLoading) {
        this.productsLoading = false;
        this.hasError = true;
        this.cdr.detectChanges();
      }
    }, 10000);
  }


  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * 🚀 SOLUCIONADO: Forzar finalize después de recibir datos
   */
  loadFeaturedProducts(): void {
    this.productsLoading = true;
    this.hasError = false;
    this.featuredProducts = [];
    this.cdr.detectChanges();

    this.productService.getProducts()
      .pipe(
        takeUntil(this.destroy$),
        map(products => {
          if (!products?.length) return [];

          return products.map(product => {
            if (product.currentPrice !== undefined) {
              return product;
            }

            if (product.originalPrice && product.originalPrice > product.price) {
              const discountPercentage = Math.round(
                ((product.originalPrice - product.price) / product.originalPrice) * 100
              );

              return {
                ...product,
                currentPrice: product.price,
                discountPercentage: discountPercentage
              };
            }

            if (product.discountPercentage && product.discountPercentage > 0) {
              const discountedPrice = product.price * (1 - (product.discountPercentage / 100));

              return {
                ...product,
                originalPrice: product.price,
                currentPrice: discountedPrice
              };
            }

            return {
              ...product,
              currentPrice: product.price,
              discountPercentage: 0
            };
          });
        }),
      )
      .subscribe({
        next: (products) => {
          this.allProducts = products || [];
          this.processFeaturedProducts();
          this.productsLoading = false;
          this.cdr.detectChanges();

        },
        error: (error) => {
          console.error('❌ ERROR ejecutado:', error);
          this.hasError = true;
          this.productsLoading = false;
          this.message.error('Error al cargar los productos destacados');
          this.cdr.detectChanges();
        },
        complete: () => {
          this.productsLoading = false;
          this.cdr.detectChanges();
        }
      });
  }

  onColorChanged(event: { product: Product, color: Color, index: number }): void {
    const { product, color, index } = event;

    // Encontrar el producto en featuredProducts y actualizarlo
    const productIndex = this.featuredProducts.findIndex(p => p.id === product.id);
    if (productIndex !== -1) {
      this.featuredProducts[productIndex].selectedColorIndex = index;
      this.featuredProducts[productIndex].displayImageUrl = color.imageUrl || product.imageUrl;

      this.cdr.detectChanges();
    }
  }

  /**
   * 🔄 MEJORADO: Procesa productos con mejor manejo de errores
   */

  private processFeaturedProducts(): void {
    if (!this.allProducts?.length) {
      this.featuredProducts = [];
      return;
    }

    try {
      const validProducts = this.allProducts.filter(product => this.isValidProduct(product));

      if (validProducts.length === 0) {
        this.featuredProducts = [];
        return;
      }

      // ✅ SOLO productos con etiquetas
      let candidateProducts = validProducts.filter(product => this.isFeaturedProduct(product));

      // 🎲 BARAJEAR los productos antes de limitar
      candidateProducts = this.shuffleArray(candidateProducts);

      this.featuredProducts = candidateProducts
        .slice(0, this.MAX_FEATURED_PRODUCTS)
        .map(product => this.initializeProductColorState(product));

    } catch (error) {
      console.error('❌ Error al procesar productos destacados:', error);
      this.featuredProducts = [];
      this.hasError = true;
    }
  }

  /**
 * 🎲 Baraja un array usando el algoritmo Fisher-Yates
 */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]; // Crear copia para no mutar el original

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  // ==================== 🎨 GESTIÓN DE COLORES CON SCROLL ====================

  /**
   * 🎨 Inicializa el estado de color para un producto
   */
  private initializeProductColorState(product: Product): ProductWithSelectedColor {
    return {
      ...product,
      selectedColorIndex: 0,
      displayImageUrl: product.colors?.[0]?.imageUrl || product.imageUrl
    };
  }

  // ==================== MÉTODOS DE VALIDACIÓN Y UTILIDADES ====================

  /**
   * ✅ Validación de productos basada en tu modelo Product
   */
  private isValidProduct(product: Product): boolean {
    if (!product) return false;

    const isValid = !!(
      product.id &&
      product.name?.trim() &&
      product.price !== undefined &&
      product.price >= 0 &&
      product.imageUrl &&
      product.totalStock !== undefined &&
      product.totalStock >= 0
    );

    return isValid;
  }

  /**
   * ⭐ ACTUALIZADO: Verifica si un producto es destacado según tu modelo
   */
  private isFeaturedProduct(product: Product): boolean {
    if (!product) return false;

    // ✅ SOLO verificar las 3 etiquetas que se muestran en la UI
    const hasNewBadge = product.isNew === true;
    const hasBestSellerBadge = product.isBestSeller === true;
    const hasDiscountBadge = this.hasRealDiscount(product);

    // Solo productos con AL MENOS una etiqueta visible
    return hasNewBadge || hasBestSellerBadge || hasDiscountBadge;
  }

  private hasRealDiscount(product: Product): boolean {
    if (!product) return false;

    // Verificar descuento por porcentaje
    if (product.discountPercentage && product.discountPercentage > 0) {
      return true;
    }

    // Verificar si currentPrice < originalPrice
    if (product.currentPrice !== undefined && product.originalPrice &&
      product.currentPrice < product.originalPrice) {
      return true;
    }

    // Verificar si currentPrice < price (precio base)
    if (product.currentPrice !== undefined && product.price &&
      product.currentPrice < product.price) {
      return true;
    }

    // Verificar promoción activa
    if (product.activePromotion) {
      return true;
    }

    return false;
  }

  /**
   * 💰 Formatea precio
   */
  formatPrice(price: number): string {
    if (typeof price !== 'number' || isNaN(price) || price < 0) {
      return '0.00';
    }
    return price.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /**
   * 🖼️ MEJORADO: Manejo más robusto de errores de imágenes
   */
  handleImageError(event: Event): void {
    const target = event.target;
    if (!target || !(target instanceof HTMLImageElement)) {
      return;
    }

    const imgElement = target as HTMLImageElement;

    if (imgElement.classList?.contains('fallback-applied')) {
      console.warn('🖼️ Fallback ya aplicado, evitando bucle');
      return;
    }

    imgElement.src = this.FALLBACK_IMAGE;
    imgElement.classList?.add('fallback-applied');
    imgElement.alt = 'Imagen no disponible';

    console.warn('🖼️ Imagen falló, aplicando fallback para:', imgElement.dataset['originalSrc'] || 'URL desconocida');
  }

  /**
   * 🧭 Navega a la página de detalle del producto
   */
  navigateToProduct(productId: string): void {
    if (!productId?.trim()) {
      console.warn('🧭 ID de producto inválido para navegación');
      return;
    }

    this.router.navigate(['/products', productId]).catch(error => {
      console.error('🧭 Error al navegar al producto:', error);
      this.message.error('Error al navegar al producto');
    });
  }

  /**
   * 🔄 TrackBy optimizado para rendimiento
   */
  trackByProductId(index: number, product: ProductWithSelectedColor): string {
    return product?.id || `product-${index}`;
  }

  /**
   * ♿ Accesibilidad para rating
   */
  getRatingAriaLabel(rating: number): string {
    const stars = Math.round(rating || 5);
    return `Calificación: ${stars} de 5 estrellas`;
  }

  /**
   * 💸 CORREGIDO: Lógica basada en tu ProductPriceService
   */
  hasDiscount(product: Product): boolean {
    if (!product) return false;

    if (product.discountPercentage && product.discountPercentage > 0) {
      return true;
    }

    if (product.currentPrice !== undefined && product.originalPrice &&
      product.currentPrice < product.originalPrice) {
      return true;
    }

    if (product.activePromotion) {
      return true;
    }

    if (product.currentPrice !== undefined && product.price &&
      product.currentPrice < product.price) {
      return true;
    }

    return false;
  }

  /**
   * 📊 CORREGIDO: Cálculo basado en tu ProductPriceService
   */
  getDiscountPercentage(product: Product): number {
    if (!product || !this.hasDiscount(product)) return 0;

    if (product.discountPercentage && product.discountPercentage > 0) {
      return Math.round(product.discountPercentage);
    }

    if (product.currentPrice !== undefined && product.originalPrice &&
      product.currentPrice < product.originalPrice) {
      return Math.round(((product.originalPrice - product.currentPrice) / product.originalPrice) * 100);
    }

    if (product.currentPrice !== undefined && product.price &&
      product.currentPrice < product.price) {
      return Math.round(((product.price - product.currentPrice) / product.price) * 100);
    }

    return 0;
  }

  /**
   * 🔄 CORREGIDO: Basado en la lógica de tu ProductPriceService
   */
  getCurrentPrice(product: Product): number {
    if (!product) return 0;

    if (product.currentPrice !== undefined && product.currentPrice >= 0) {
      return product.currentPrice;
    }

    return product.price || 0;
  }

  /**
   * 🔄 CORREGIDO: Basado en tu ProductPriceService
   */
  getOriginalPrice(product: Product): number | null {
    if (!product || !this.hasDiscount(product)) return null;

    if (product.originalPrice && product.originalPrice > 0) {
      return product.originalPrice;
    }

    if (product.currentPrice !== undefined && product.price &&
      product.currentPrice < product.price) {
      return product.price;
    }

    return null;
  }

  /**
   * 🔄 Recarga los productos
   */
  reloadProducts(): void {
    this.loadFeaturedProducts();
  }

  /**
   * 📦 Verifica si hay productos para mostrar
   */
  hasProducts(): boolean {
    return this.featuredProducts?.length > 0;
  }

  /**
   * 🫗 Estado vacío
   */
  shouldShowEmpty(): boolean {
    return !this.productsLoading && !this.hasError && this.featuredProducts.length === 0;
  }

  /**
   * 📦 Debe mostrar productos
   */
  shouldShowProducts(): boolean {
    return !this.productsLoading && !this.hasError && this.featuredProducts.length > 0;
  }
}