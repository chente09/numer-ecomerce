import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subject, takeUntil, forkJoin, map, catchError, of } from 'rxjs';

// Services
import { ProductService } from '../../services/admin/product/product.service';
import { ProductPriceService } from '../../services/admin/price/product-price.service';

// Models
import { Product, Color } from '../../models/models';

// Components
import { ProductCardComponent } from '../product-card/product-card.component';

interface ProductWithSelectedColor extends Product {
  selectedColorIndex?: number;
  displayImageUrl?: string;
}

interface TrendingProducts {
  mostPopular: ProductWithSelectedColor[];
  newArrivals: ProductWithSelectedColor[];
  onSale: ProductWithSelectedColor[];
}

@Component({
  selector: 'app-tendencias-section',
  standalone: true,
  imports: [
    CommonModule,
    NzTabsModule,
    NzSpinModule,
    NzEmptyModule,
    FormsModule,
    NzGridModule,
    NzRateModule,
    ProductCardComponent
  ],
  templateUrl: './tendencias-section.component.html',
  styleUrl: './tendencias-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TendenciasSectionComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  // Estados de carga
  loading = false;
  hasError = false;

  // Productos organizados por categoría
  trendingProducts: TrendingProducts = {
    mostPopular: [],
    newArrivals: [],
    onSale: []
  };

  // Configuración
  private readonly MAX_PRODUCTS_PER_TAB = 8;

  constructor(
    private productService: ProductService,
    private productPriceService: ProductPriceService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.loadTrendingProducts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * 🚀 Carga todos los productos de tendencias desde los servicios
   */
  private loadTrendingProducts(): void {
    this.loading = true;
    this.hasError = false;
    this.cdr.detectChanges();

    // Cargar productos en paralelo desde diferentes fuentes
    forkJoin({
      featured: this.productService.getFeaturedProducts(this.MAX_PRODUCTS_PER_TAB),
      newProducts: this.productService.getNewProducts(this.MAX_PRODUCTS_PER_TAB),
      discounted: this.productService.getDiscountedProducts(this.MAX_PRODUCTS_PER_TAB),
      bestSelling: this.productService.getBestSellingProducts(this.MAX_PRODUCTS_PER_TAB)
    }).pipe(
      takeUntil(this.destroy$),
      map(({ featured, newProducts, discounted, bestSelling }) => {
        // Procesar y organizar productos
        return {
          // Más populares: combinar featured y bestselling
          mostPopular: this.processProducts([...featured, ...bestSelling])
            .slice(0, this.MAX_PRODUCTS_PER_TAB),

          // Nuevos lanzamientos
          newArrivals: this.processProducts(newProducts),

          // En promoción
          onSale: this.processProducts(discounted)
        };
      }),
      catchError(error => {
        console.error('❌ Error cargando productos de tendencias:', error);
        this.hasError = true;
        this.message.error('Error al cargar tendencias');
        return of({
          mostPopular: [],
          newArrivals: [],
          onSale: []
        });
      })
    ).subscribe({
      next: (products) => {
        this.trendingProducts = products;
        this.loading = false;
        this.cdr.detectChanges();

        console.log('✅ Productos de tendencias cargados:', {
          populares: products.mostPopular.length,
          nuevos: products.newArrivals.length,
          ofertas: products.onSale.length
        });
      },
      error: (error) => {
        console.error('❌ Error en suscripción:', error);
        this.loading = false;
        this.hasError = true;
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * 🔄 Procesa productos para inicializar estado de colores
   */
  private processProducts(products: Product[]): ProductWithSelectedColor[] {
    if (!products?.length) return [];

    // Eliminar duplicados por ID
    const uniqueProducts = products.filter((product, index, self) =>
      index === self.findIndex(p => p.id === product.id)
    );

    return uniqueProducts.map(product => this.initializeProductColorState(product));
  }

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

  /**
   * 🎨 Maneja el cambio de color desde ProductCardComponent
   */
  onColorChanged(event: { product: Product, color: Color, index: number }, tab: string): void {
    const { product, color, index } = event;

    let targetArray: ProductWithSelectedColor[] = [];

    switch (tab) {
      case 'popular':
        targetArray = this.trendingProducts.mostPopular;
        break;
      case 'new':
        targetArray = this.trendingProducts.newArrivals;
        break;
      case 'sale':
        targetArray = this.trendingProducts.onSale;
        break;
    }

    // Encontrar y actualizar el producto
    const productIndex = targetArray.findIndex(p => p.id === product.id);
    if (productIndex !== -1) {
      targetArray[productIndex].selectedColorIndex = index;
      targetArray[productIndex].displayImageUrl = color.imageUrl || product.imageUrl;

      console.log(`🎨 Color cambiado en ${tab}: ${product.name} → ${color.name}`);
      this.cdr.detectChanges();
    }
  }

  /**
   * 🔄 Recarga los productos
   */
  reloadProducts(): void {
    this.loadTrendingProducts();
  }

  /**
   * 🔄 TrackBy optimizado para rendimiento
   */
  trackByProductId(index: number, product: ProductWithSelectedColor): string {
    return product?.id || `product-${index}`;
  }

  /**
   * 📊 Verifica si hay productos en una categoría
   */
  hasProducts(category: keyof TrendingProducts): boolean {
    return this.trendingProducts[category]?.length > 0;
  }

  /**
   * 📊 Obtiene el total de productos
   */
  getTotalProducts(): number {
    return this.trendingProducts.mostPopular.length +
      this.trendingProducts.newArrivals.length +
      this.trendingProducts.onSale.length;
  }

  /**
   * 🫗 Verifica si debe mostrar estado vacío
   */
  shouldShowEmpty(): boolean {
    return !this.loading && !this.hasError && this.getTotalProducts() === 0;
  }

  /**
   * 📦 Verifica si debe mostrar contenido
   */
  shouldShowContent(): boolean {
    return !this.loading && !this.hasError && this.getTotalProducts() > 0;
  }
}