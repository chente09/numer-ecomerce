import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subject, takeUntil, forkJoin, map, catchError, of, filter, debounceTime, switchMap } from 'rxjs';

// Services
import { ProductService } from '../../services/admin/product/product.service';
import { ProductPriceService } from '../../services/admin/price/product-price.service';
import { CacheService } from '../../services/admin/cache/cache.service';
import { PromotionStateService } from '../../services/admin/promotionState/promotion-state.service';

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

  // 🆕 NUEVO: Nombre del componente para registro
  private readonly COMPONENT_NAME = 'TendenciasSectionComponent';

  constructor(
    private productService: ProductService,
    private productPriceService: ProductPriceService,
    private cacheService: CacheService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef,
    private promotionStateService: PromotionStateService
  ) { }

  ngOnInit(): void {
    // 📝 NUEVO: Registrar componente para broadcasting
    this.promotionStateService.registerComponent(this.COMPONENT_NAME);

    this.loadTrendingProducts();

    // 🆕 NUEVO: Escuchar actualizaciones globales de promociones
    this.setupPromotionUpdateListener();
  }

  ngOnDestroy(): void {
    // 🗑️ NUEVO: Desregistrar componente
    this.promotionStateService.unregisterComponent(this.COMPONENT_NAME);

    this.destroy$.next();
    this.destroy$.complete();
  }

  // 🆕 NUEVO: Configurar escucha de actualizaciones de promociones
  private setupPromotionUpdateListener(): void {

    this.promotionStateService.onGlobalUpdate()
      .pipe(
        takeUntil(this.destroy$),
        filter(globalUpdate => this.isPromotionUpdateRelevant(globalUpdate)),
        debounceTime(1500)
      )
      .subscribe({
        next: (globalUpdate) => {
          console.log('📈 [TENDENCIAS] ¡ACTUALIZACIÓN RECIBIDA!:', globalUpdate);
          this.handlePromotionUpdate(globalUpdate);
        },
        error: (error) => {
          console.error('📈 [TENDENCIAS] Error en listener:', error);
        },
        complete: () => {
          console.log('📈 [TENDENCIAS] Listener completado');
        }
      });

    console.log('📈 [TENDENCIAS] Listener configurado exitosamente');
  }

  // 🆕 NUEVO: Verificar si la actualización es relevante
  private isPromotionUpdateRelevant(globalUpdate: any): boolean {
    const event = globalUpdate.data;

    // Las actualizaciones de promociones siempre afectan las tendencias
    // especialmente la pestaña "En Promoción"
    return ['activated', 'deactivated', 'applied', 'removed', 'deleted', 'updated'].includes(event.type);
  }

  // 🆕 NUEVO: Manejar actualizaciones de promociones
  private handlePromotionUpdate(globalUpdate: any): void {
    const event = globalUpdate.data;

    // Mostrar indicador de carga suave
    this.message.loading('Actualizando productos...', { nzDuration: 1500 });

    // Pequeño delay para asegurar que el caché se limpió
    setTimeout(() => {
      // Forzar recarga completa con forceRefresh = true
      this.loadTrendingProducts(true);
    }, 100);
  }

  // Agregar este nuevo método después de invalidateRelatedCache:
  private clearAllRelatedCache(): void {
    // Limpiar caché específico con los límites correctos
    this.cacheService.invalidate('products');
    this.cacheService.invalidate(`products_featured_${this.MAX_PRODUCTS_PER_TAB}`);
    this.cacheService.invalidate(`products_new_${this.MAX_PRODUCTS_PER_TAB}`);
    this.cacheService.invalidate(`products_discounted_${this.MAX_PRODUCTS_PER_TAB}`);
    this.cacheService.invalidate(`products_bestselling_${this.MAX_PRODUCTS_PER_TAB}`);

    // Limpiar patrón completo
    this.cacheService.invalidatePattern('products_');

    // Si tienes método clearCache, úsalo para asegurar limpieza total
    if (typeof this.cacheService.clearCache === 'function') {
      this.cacheService.clearCache();
    }

  }

  /**
   * 🚀 Carga todos los productos de tendencias desde los servicios
   */
  private loadTrendingProducts(forceRefresh: boolean = false): void {
    this.loading = true;
    this.hasError = false;
    this.cdr.detectChanges();

    if (forceRefresh) {
      this.clearAllRelatedCache();
    }

    // Cargar productos en paralelo desde diferentes fuentes
    forkJoin({
      featured: this.productService.getFeaturedProducts(this.MAX_PRODUCTS_PER_TAB, forceRefresh),
      newProducts: this.productService.getNewProducts(this.MAX_PRODUCTS_PER_TAB, forceRefresh),
      discounted: this.productService.getDiscountedProducts(this.MAX_PRODUCTS_PER_TAB, forceRefresh),
      bestSelling: this.productService.getBestSellingProducts(this.MAX_PRODUCTS_PER_TAB, forceRefresh)
    }).pipe(
      takeUntil(this.destroy$),
      // 🆕 IMPORTANTE: Aplicar cálculo de precios a TODOS los productos
      switchMap(({ featured, newProducts, discounted, bestSelling }) => {
        const allProducts = [...featured, ...newProducts, ...discounted, ...bestSelling];

        // Calcular precios con promociones para todos
        return this.productPriceService.calculateDiscountedPrices(allProducts).pipe(
          map(productsWithPrices => {
            // Crear un mapa para búsqueda rápida
            const pricesMap = new Map(productsWithPrices.map(p => [p.id, p]));

            // Actualizar cada grupo con los precios calculados
            return {
              featured: featured.map(p => pricesMap.get(p.id) || p),
              newProducts: newProducts.map(p => pricesMap.get(p.id) || p),
              discounted: discounted.map(p => pricesMap.get(p.id) || p),
              bestSelling: bestSelling.map(p => pricesMap.get(p.id) || p)
            };
          })
        );
      }),
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

        // 🆕 Forzar múltiples detecciones
        this.cdr.detectChanges();
        this.cdr.markForCheck();

        setTimeout(() => {
          this.cdr.detectChanges();
        }, 100);

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

  // 🆕 NUEVO: Método para debugging (opcional)
  debugTrendingProducts(): void {
    console.group('📈 [TENDENCIAS DEBUG]');
    console.log('Estado actual:', {
      loading: this.loading,
      hasError: this.hasError,
      totalProducts: this.getTotalProducts()
    });

    console.log('Productos por categoría:', {
      popular: this.trendingProducts.mostPopular.map(p => ({
        id: p.id,
        name: p.name,
        hasDiscount: !!(p.discountPercentage && p.discountPercentage > 0)
      })),
      nuevos: this.trendingProducts.newArrivals.map(p => ({
        id: p.id,
        name: p.name,
        isNew: p.isNew
      })),
      promocion: this.trendingProducts.onSale.map(p => ({
        id: p.id,
        name: p.name,
        discount: p.discountPercentage,
        currentPrice: p.currentPrice,
        originalPrice: p.originalPrice
      }))
    });

    console.groupEnd();
  }
}