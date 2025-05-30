import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, ViewChildren, QueryList, AfterViewInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { ProductService } from '../../services/admin/product/product.service';
import { ProductPriceService } from '../../services/admin/price/product-price.service';
import { Product, Color } from '../../models/models';
import { NzMessageService } from 'ng-zorro-antd/message';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, finalize, catchError, of, switchMap, take, map } from 'rxjs';

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
    FormsModule
  ],
  templateUrl: './productos-section.component.html',
  styleUrls: ['./productos-section.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductosSectionComponent implements OnInit, OnDestroy, AfterViewInit {
  
  // 🎨 Referencias a los contenedores de colores para manejo de scroll
  @ViewChildren('colorsContainer') colorsContainers!: QueryList<ElementRef>;
  
  private destroy$ = new Subject<void>();
  
  // Estados de carga y datos
  productsLoading = false;
  hasError = false;
  allProducts: Product[] = [];
  featuredProducts: ProductWithSelectedColor[] = [];
  
  // Configuración mejorada
  private readonly MAX_FEATURED_PRODUCTS = 8;
  private readonly MAX_COLORS_VISIBLE = 4; // Umbral para activar scroll
  private readonly SCROLL_AMOUNT = 120; // Cantidad de scroll en píxeles
  private readonly FALLBACK_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOGY4Ii8+PGcgZmlsbD0iIzk5OSI+PGNpcmNsZSBjeD0iMTIwIiBjeT0iMTAwIiByPSIyMCIvPjxwYXRoIGQ9Im05MCAx NjBoNjB2NDBINTB6Ii8+PC9nPjx0ZXh0IHg9IjUwJSIgeT0iODAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlByb2R1Y3RvPC90ZXh0Pjwvc3ZnPg==';

  constructor(
    private productService: ProductService,
    private productPriceService: ProductPriceService,
    private message: NzMessageService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadFeaturedProducts();
    
    // ✅ SAFETY NET: Si después de 10 segundos sigue cargando, forzar parada
    setTimeout(() => {
      if (this.productsLoading) {
        this.productsLoading = false;
        this.hasError = true;
        this.cdr.detectChanges();
      }
    }, 10000);
  }

  ngAfterViewInit(): void {
    // 🎨 Inicializar scroll de colores después de que la vista esté lista
    this.initializeColorScrolls();
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

          // 🎨 Reinicializar scroll después de cargar productos
          setTimeout(() => this.initializeColorScrolls(), 100);
        },
        error: (error) => {
          console.error('❌ ERROR ejecutado:', error);
          this.hasError = true;
          this.productsLoading = false;
          this.message.error('Error al cargar los productos destacados');
          this.cdr.detectChanges();
        },
        complete: () => {
          console.log('🎯 COMPLETE ejecutado');
          this.productsLoading = false;
          this.cdr.detectChanges();
        }
      });
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

      let candidateProducts = validProducts.filter(product => this.isFeaturedProduct(product));

      if (candidateProducts.length < this.MAX_FEATURED_PRODUCTS) {
        const additionalProducts = validProducts
          .filter(product => !candidateProducts.some(fp => fp.id === product.id))
          .slice(0, this.MAX_FEATURED_PRODUCTS - candidateProducts.length);
        
        candidateProducts = [...candidateProducts, ...additionalProducts];
      }

      this.featuredProducts = candidateProducts
        .slice(0, this.MAX_FEATURED_PRODUCTS)
        .map(product => this.initializeProductColorState(product));

    } catch (error) {
      console.error('❌ Error al procesar productos destacados:', error);
      this.featuredProducts = [];
      this.hasError = true;
    }
  }

  // ==================== 🎨 GESTIÓN DE COLORES CON SCROLL ====================

  /**
   * 🎨 Inicializa el estado de color para un producto
   */
  private initializeProductColorState(product: Product): ProductWithSelectedColor {
    const productWithColor: ProductWithSelectedColor = {
      ...product,
      selectedColorIndex: 0,
      displayImageUrl: product.imageUrl
    };

    if (this.hasColors(product) && product.colors[0]?.imageUrl) {
      productWithColor.displayImageUrl = product.colors[0].imageUrl;
    }

    return productWithColor;
  }

  /**
   * 🎨 Inicializa los scroll de colores para todos los productos
   */
  private initializeColorScrolls(): void {
    if (!this.colorsContainers) return;

    this.colorsContainers.forEach((containerRef, index) => {
      const container = containerRef.nativeElement;
      const colorOptions = container.closest('.color-options');
      
      if (container && colorOptions) {
        this.setupColorScroll(container, colorOptions);
      }
    });
  }

  /**
   * 🎨 Configura el scroll para un contenedor de colores específico
   */
  private setupColorScroll(container: HTMLElement, colorOptions: HTMLElement): void {
    // Verificar si necesita scroll
    const needsScroll = container.scrollWidth > container.clientWidth;
    
    if (needsScroll) {
      colorOptions.classList.add('has-scroll');
      this.updateScrollIndicators(colorOptions);
      
      // Agregar listener para actualizar indicadores durante scroll
      container.addEventListener('scroll', () => {
        this.updateScrollIndicators(colorOptions);
      }, { passive: true });
    } else {
      colorOptions.classList.remove('has-scroll');
    }
  }

  /**
   * 🎨 Actualiza la visibilidad de los indicadores de scroll
   */
  private updateScrollIndicators(colorOptions: HTMLElement): void {
    const container = colorOptions.querySelector('.colors-container') as HTMLElement;
    const leftIndicator = colorOptions.querySelector('.scroll-left') as HTMLElement;
    const rightIndicator = colorOptions.querySelector('.scroll-right') as HTMLElement;
    
    if (!container || !leftIndicator || !rightIndicator) return;
    
    const canScrollLeft = container.scrollLeft > 5; // Pequeño margen
    const canScrollRight = container.scrollLeft < (container.scrollWidth - container.clientWidth - 5);
    
    leftIndicator.style.opacity = canScrollLeft ? '1' : '0.3';
    rightIndicator.style.opacity = canScrollRight ? '1' : '0.3';
    leftIndicator.style.pointerEvents = canScrollLeft ? 'auto' : 'none';
    rightIndicator.style.pointerEvents = canScrollRight ? 'auto' : 'none';
  }

  /**
   * 🎨 Hace scroll del contenedor de colores
   */
  scrollColors(productId: string, direction: 'left' | 'right'): void {
    const colorOptions = document.querySelector(`[data-product-id="${productId}"]`)?.closest('.color-options') as HTMLElement;
    if (!colorOptions) return;

    const container = colorOptions.querySelector('.colors-container') as HTMLElement;
    if (!container) return;

    const scrollAmount = direction === 'left' ? -this.SCROLL_AMOUNT : this.SCROLL_AMOUNT;
    
    container.scrollBy({
      left: scrollAmount,
      behavior: 'smooth'
    });

    // Actualizar indicadores después del scroll
    setTimeout(() => {
      this.updateScrollIndicators(colorOptions);
    }, 300);
  }

  /**
   * 🎨 Selecciona un color y actualiza la imagen
   */
  selectColor(product: ProductWithSelectedColor, color: Color, colorIndex: number): void {
    if (!product || !color || colorIndex < 0) {
      return;
    }

    // Actualizar el índice del color seleccionado
    product.selectedColorIndex = colorIndex;

    // Actualizar la imagen mostrada
    if (color.imageUrl) {
      product.displayImageUrl = color.imageUrl;
    } else {
      product.displayImageUrl = product.imageUrl;
    }

    // Scroll automático para mantener el color seleccionado visible
    setTimeout(() => {
      this.scrollToSelectedColor(product.id, colorIndex);
    }, 50);

    this.cdr.detectChanges();
  }

  /**
   * 🎨 Hace scroll automático para mostrar el color seleccionado
   */
  private scrollToSelectedColor(productId: string, colorIndex: number): void {
    const colorOptions = document.querySelector(`[data-product-id="${productId}"]`)?.closest('.color-options') as HTMLElement;
    if (!colorOptions) return;

    const container = colorOptions.querySelector('.colors-container') as HTMLElement;
    const colorElement = container?.children[colorIndex] as HTMLElement;
    
    if (!container || !colorElement) return;

    const containerRect = container.getBoundingClientRect();
    const colorRect = colorElement.getBoundingClientRect();
    
    // Verificar si el color está fuera del área visible
    const isOutOfView = colorRect.left < containerRect.left || colorRect.right > containerRect.right;
    
    if (isOutOfView) {
      const scrollPosition = colorElement.offsetLeft - (container.clientWidth / 2) + (colorElement.clientWidth / 2);
      
      container.scrollTo({
        left: Math.max(0, scrollPosition),
        behavior: 'smooth'
      });
    }
  }

  /**
   * ✅ Verifica si un color está activo/seleccionado
   */
  isColorActive(product: ProductWithSelectedColor, colorIndex: number): boolean {
    return product?.selectedColorIndex === colorIndex;
  }


  /**
   * 🔍 Verifica si el producto tiene colores
   */
  hasColors(product: Product): boolean {
    return !!(product?.colors && Array.isArray(product.colors) && product.colors.length > 0);
  }

  /**
   * 📏 Verifica si hay muchos colores para activar scroll
   */
  hasManyColors(product: Product): boolean {
    return !!(product?.colors && product.colors.length > this.MAX_COLORS_VISIBLE);
  }

  /**
   * 🎨 Obtiene información del color activo
   */
  getActiveColorName(product: ProductWithSelectedColor): string {
    if (!this.hasColors(product) || product.selectedColorIndex === undefined) {
      return '';
    }

    const activeColor = product.colors[product.selectedColorIndex];
    return activeColor?.name || '';
  }

  /**
   * 📊 Obtiene el número de colores disponibles
   */
  getColorCount(product: Product): number {
    return product?.colors?.length || 0;
  }

  /**
   * 🖼️ Obtiene la URL de imagen a mostrar
   */
  getDisplayImageUrl(product: ProductWithSelectedColor): string {
    return product?.displayImageUrl || product?.imageUrl || this.FALLBACK_IMAGE;
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
    const isFeatured = !!(
      product?.isBestSeller || 
      product?.isNew || 
      (product?.discountPercentage && product.discountPercentage > 0) ||
      product?.activePromotion ||
      (product?.promotions && product.promotions.length > 0) ||
      (product?.popularityScore && product.popularityScore > 0.8) ||
      (product?.sales && product.sales > 100)
    );

    return isFeatured;
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