import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { ProductService } from '../../services/admin/product/product.service';
import { Product } from '../../models/models';
import { NzMessageService } from 'ng-zorro-antd/message';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, finalize, catchError, of } from 'rxjs';

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
export class ProductosSectionComponent implements OnInit, OnDestroy {
  
  private destroy$ = new Subject<void>();
  
  // Estados de carga y datos
  productsLoading = true;
  hasError = false;
  allProducts: Product[] = [];
  featuredProducts: Product[] = [];
  
  // Configuración
  private readonly MAX_FEATURED_PRODUCTS = 8;
  private readonly FALLBACK_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOGY4Ii8+PGcgZmlsbD0iIzk5OSI+PGNpcmNsZSBjeD0iMTIwIiBjeT0iMTAwIiByPSIyMCIvPjxwYXRoIGQ9Im05MCAx NjBoNjB2NDBIOTB6Ii8+PC9nPjx0ZXh0IHg9IjUwJSIgeT0iODAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlByb2R1Y3RvPC90ZXh0Pjwvc3ZnPg==';

  constructor(
    private productService: ProductService,
    private message: NzMessageService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('🚀 Componente inicializado');
    this.loadFeaturedProducts();
    
    // Timer de seguridad para forzar actualización después de 3 segundos
    setTimeout(() => {
      if (this.productsLoading) {
        console.log('⚠️ Timer de seguridad: Forzando fin de loading');
        this.productsLoading = false;
        this.cdr.detectChanges();
      }
    }, 3000);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Carga los productos destacados con manejo de errores mejorado
   */
  loadFeaturedProducts(): void {
    console.log('🔄 Iniciando carga de productos destacados...');
    
    // Resetear estados
    this.productsLoading = true;
    this.hasError = false;
    this.featuredProducts = [];
    
    // Forzar detección de cambios para mostrar el loading
    this.cdr.detectChanges();
    console.log('✅ Loading state activado:', this.productsLoading);

    this.productService.getProducts()
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          console.error('❌ Error al cargar productos destacados:', error);
          this.hasError = true;
          this.productsLoading = false;
          this.message.error('Error al cargar los productos destacados');
          this.cdr.detectChanges();
          return of([]); // Retorna array vacío en caso de error
        }),
        finalize(() => {
          console.log('🏁 Finalizando carga, cambiando loading a false');
          this.productsLoading = false;
          this.cdr.detectChanges(); // Forzar detección de cambios
          console.log('✅ Loading state final:', this.productsLoading);
          console.log('✅ Featured products final:', this.featuredProducts.length);
        })
      )
      .subscribe({
        next: (products) => {
          console.log('📦 Productos recibidos del servicio:', products?.length || 0);
          this.allProducts = products || [];
          this.processFeaturedProducts();
          
          // Asegurar que el loading se desactive aquí también
          this.productsLoading = false;
          this.cdr.detectChanges(); // Forzar detección después de procesar
          
          console.log('📊 Estado después del procesamiento:');
          console.log('- Loading:', this.productsLoading);
          console.log('- HasError:', this.hasError);
          console.log('- Featured products:', this.featuredProducts.length);
          console.log('- Should show products:', this.shouldShowProducts());
          console.log('- Should show empty:', this.shouldShowEmpty());
        },
        error: (error) => {
          console.error('❌ Error en subscribe:', error);
          this.hasError = true;
          this.productsLoading = false;
          this.cdr.detectChanges();
        }
      });
  }

  /**
   * Procesa y filtra los productos destacados
   */
  private processFeaturedProducts(): void {
    console.log('🔧 Procesando productos destacados...');
    console.log('- All products length:', this.allProducts?.length || 0);
    
    if (!this.allProducts?.length) {
      console.log('⚠️ No hay productos para procesar');
      this.featuredProducts = [];
      return;
    }

    try {
      // Filtrar productos destacados con validación
      this.featuredProducts = this.allProducts
        .filter(product => {
          const isValid = this.isValidProduct(product);
          const isFeatured = this.isFeaturedProduct(product);
          console.log(`- Producto ${product?.name}: valid=${isValid}, featured=${isFeatured}`);
          return isValid && isFeatured;
        })
        .slice(0, this.MAX_FEATURED_PRODUCTS);

      console.log(`✅ Productos destacados filtrados: ${this.featuredProducts.length}`);

      // Si no hay suficientes productos destacados, completar con productos válidos
      if (this.featuredProducts.length < this.MAX_FEATURED_PRODUCTS) {
        console.log('🔄 Completando con productos adicionales...');
        const additionalProducts = this.allProducts
          .filter(product => 
            this.isValidProduct(product) && 
            !this.featuredProducts.some(fp => fp.id === product.id)
          )
          .slice(0, this.MAX_FEATURED_PRODUCTS - this.featuredProducts.length);
        
        console.log(`✅ Productos adicionales encontrados: ${additionalProducts.length}`);
        this.featuredProducts = [...this.featuredProducts, ...additionalProducts];
      }

      console.log(`🎯 Productos destacados cargados: ${this.featuredProducts.length}`);
    } catch (error) {
      console.error('❌ Error al procesar productos destacados:', error);
      this.featuredProducts = [];
    }
  }

  /**
   * Verifica si un producto es válido para mostrar
   */
  private isValidProduct(product: Product): boolean {
    return !!(
      product?.id &&
      product?.name?.trim() &&
      product?.price !== undefined &&
      product?.price >= 0
    );
  }

  /**
   * Verifica si un producto es destacado
   */
  private isFeaturedProduct(product: Product): boolean {
    return !!(product?.isBestSeller || product?.isNew);
  }

  /**
   * Formatea el precio del producto
   */
  formatPrice(price: number): string {
    if (typeof price !== 'number' || isNaN(price)) {
      return '0.00';
    }
    return price.toFixed(2);
  }

  /**
   * Maneja errores de carga de imágenes
   */
  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement && !imgElement.classList.contains('fallback-applied')) {
      imgElement.src = this.FALLBACK_IMAGE;
      imgElement.classList.add('fallback-applied');
      imgElement.alt = 'Imagen no disponible';
    }
  }

  /**
   * Navega a la página de detalle del producto
   */
  navigateToProduct(productId: string): void {
    if (productId) {
      this.router.navigate(['/products', productId]);
    }
  }

  /**
   * TrackBy function para optimizar el rendimiento del *ngFor
   */
  trackByProductId(index: number, product: Product): string {
    return product?.id || index.toString();
  }

  /**
   * Obtiene el texto de accesibilidad para el rating
   */
  getRatingAriaLabel(rating: number): string {
    return `Calificación: ${rating} de 5 estrellas`;
  }

  /**
   * Verifica si el producto tiene descuento
   */
  hasDiscount(product: Product): boolean {
    return !!(
      product?.originalPrice && 
      product?.price && 
      product.originalPrice > product.price
    );
  }

  /**
   * Calcula el porcentaje de descuento
   */
  getDiscountPercentage(product: Product): number {
    if (!this.hasDiscount(product)) return 0;
    
    const original = product.originalPrice!;
    const current = product.price;
    return Math.round(((original - current) / original) * 100);
  }

  /**
   * Recarga los productos
   */
  reloadProducts(): void {
    this.loadFeaturedProducts();
  }

  /**
   * Verifica si hay productos para mostrar
   */
  hasProducts(): boolean {
    return this.featuredProducts?.length > 0;
  }

  /**
   * Verifica si debe mostrar el estado vacío
   */
  shouldShowEmpty(): boolean {
    const result = !this.productsLoading && !this.hasError && this.featuredProducts.length === 0;
    console.log('🔍 shouldShowEmpty():', {
      productsLoading: this.productsLoading,
      hasError: this.hasError,
      featuredProductsLength: this.featuredProducts.length,
      result
    });
    return result;
  }

  /**
   * Verifica si debe mostrar los productos
   */
  shouldShowProducts(): boolean {
    const result = !this.productsLoading && !this.hasError && this.featuredProducts.length > 0;
    console.log('🔍 shouldShowProducts():', {
      productsLoading: this.productsLoading,
      hasError: this.hasError,
      featuredProductsLength: this.featuredProducts.length,
      result
    });
    return result;
  }

  /**
   * Selecciona un color específico para un producto
   */
  selectColor(product: Product, color: any): void {
    if (product && color) {
      // Actualizar la imagen principal del producto con la imagen del color
      product.imageUrl = color.imageUrl || product.imageUrl;
      
      // Forzar detección de cambios para actualizar la vista
      this.cdr.detectChanges();
      
      console.log(`🎨 Color seleccionado para ${product.name}:`, color.name);
    }
  }

  /**
   * Verifica si un color está activo/seleccionado
   */
  isColorActive(product: Product, color: any): boolean {
    // Comparar por imageUrl si existe, sino por código de color
    if (color.imageUrl) {
      return product.imageUrl === color.imageUrl;
    }
    // Fallback: comparar por nombre o código si no hay imageUrl
    return false; // El primer color será activo por defecto
  }

  /**
   * Obtiene el estilo de fondo para una opción de color
   */
  getColorStyle(color: any): { [key: string]: string } {
    // Si el color tiene imagen, usar imagen como fondo
    if (color.imageUrl) {
      return {
        'background-image': `url(${color.imageUrl})`,
        'background-size': 'cover',
        'background-position': 'center',
        'background-repeat': 'no-repeat'
      };
    }
    
    // Si solo tiene código de color, aplicarlo como fondo sólido
    return {
      'background-color': color.code || color.colorCode || '#ccc'
    };
  }

  /**
   * Verifica si el producto tiene colores disponibles
   */
  hasColors(product: Product): boolean {
    return !!(product.colors && product.colors.length > 0);
  }

  /**
   * Verifica si hay muchos colores (más de 4) para mostrar scroll
   */
  hasManyColors(product: Product): boolean {
    return !!(product.colors && product.colors.length > 4);
  }
}