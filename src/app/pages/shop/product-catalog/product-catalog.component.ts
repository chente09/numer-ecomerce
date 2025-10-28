import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subject, BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, takeUntil, finalize, catchError, of, switchMap, take, firstValueFrom } from 'rxjs';

// Services
import { ProductService } from '../../../services/admin/product/product.service';
import { ProductPriceService } from '../../../services/admin/price/product-price.service';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { ColorService } from '../../../services/admin/color/color.service';
import { SizeService } from '../../../services/admin/size/size.service';
import { CartService } from '../../../pasarela-pago/services/cart/cart.service';
import { SeoService } from '../../../services/seo/seo.service';
import { CacheService } from '../../../services/admin/cache/cache.service';
import { PromotionStateService } from '../../../services/admin/promotionState/promotion-state.service';
import { PromotionService } from '../../../services/admin/promotion/promotion.service';
// Models
import { Product, Color, Size, ProductVariant } from '../../../models/models';

// NG-ZORRO
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { FormsModule } from '@angular/forms';

interface ProductWithSelectedVariant extends Product {
  selectedVariant?: ProductVariant;
  selectedColorIndex?: number;
  displayImageUrl?: string;
  hoveredVariant?: ProductVariant;
}

interface FilterOptions {
  categories: Category[];
  colors: Color[];
  sizes: Size[];
  priceRange: { min: number; max: number };
  brands: string[];
}

interface FilterTag {
  type: string;
  value: any;
  label: string;
}

@Component({
  selector: 'app-product-catalog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    NzGridModule,
    NzCardModule,
    NzButtonModule,
    NzInputModule,
    NzSelectModule,
    NzSliderModule,
    NzCheckboxModule,
    NzTagModule,
    NzRateModule,
    NzSpinModule,
    NzEmptyModule,
    NzPaginationModule,
    NzDrawerModule,
    NzIconModule,
    NzToolTipModule,
    NzDividerModule,
    NzCollapseModule,
    RouterModule,
  ],
  providers: [NzModalService],
  templateUrl: './product-catalog.component.html',
  styleUrls: ['./product-catalog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductCatalogComponent implements OnInit, OnDestroy {
  @ViewChild('filterDrawer') filterDrawer!: ElementRef;

  // State
  private destroy$ = new Subject<void>();
  loading = false;
  products: ProductWithSelectedVariant[] = [];
  filteredProducts: ProductWithSelectedVariant[] = [];
  private readonly COMPONENT_NAME = 'ProductCatalogComponent';

  searchControl = new FormControl('');
  sortControl = new FormControl('relevance');

  // Filter state
  filterForm!: FormGroup;
  filterOptions: FilterOptions = {
    categories: [],
    colors: [],
    sizes: [],
    priceRange: { min: 0, max: 1000 },
    brands: [],
  };

  // UI State
  showMobileFilters = false;
  showDesktopFilters = true;
  viewMode: 'grid' | 'list' = 'grid';
  gridCols = 4; // Para desktop
  activeFiltersCount = 0;

  // Pagination
  currentPage = 1;
  pageSize = 20;
  total = 0;


  // Sort options
  sortOptions = [
    { label: 'Relevancia', value: 'relevance' },
    { label: 'Precio: Menor a Mayor', value: 'price_asc' },
    { label: 'Precio: Mayor a Menor', value: 'price_desc' },
    { label: 'Más Nuevos', value: 'newest' },
    { label: 'Mejor Valorados', value: 'rating' },
    { label: 'Más Vendidos', value: 'bestseller' },
    { label: 'Nombre A-Z', value: 'name_asc' },
    { label: 'Nombre Z-A', value: 'name_desc' }
  ];

  // Price ranges predefinidos
  priceRanges = [
    { label: '$0 - $50', value: '0-50' },
    { label: '$50 - $100', value: '50-100' },
    { label: '$100 - $150', value: '100-150' },
    { label: '$150+', value: '150+' }
  ];

  // Responsive grid settings
  gridResponsive = {
    xs: 1,  // 1 columna en móviles
    sm: 2,  // 2 columnas en tablets pequeñas
    md: 3,  // 3 columnas en tablets
    lg: 4,  // 4 columnas en desktop
    xl: 5,  // 5 columnas en pantallas grandes
    xxl: 6  // 6 columnas en pantallas muy grandes
  };

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private productPriceService: ProductPriceService,
    private categoryService: CategoryService,
    private colorService: ColorService,
    private sizeService: SizeService,
    private cartService: CartService,
    private cacheService: CacheService,
    private router: Router,
    private route: ActivatedRoute,
    private message: NzMessageService,
    private promotionStateService: PromotionStateService,
    private promotionService: PromotionService,
    public cdr: ChangeDetectorRef,
    private seoService: SeoService
  ) {
    this.initFilterForm();
  }

  async ngOnInit(): Promise<void> {
    this.promotionStateService.registerComponent(this.COMPONENT_NAME);
    this.seoService.updatePageSEO('shop');

    try {
      // 🆕 Detectar si venimos de flujo de pago
      const shouldReload = sessionStorage.getItem('reloadAfterPurchase');
      if (shouldReload) {
        console.log('🔄 Recarga después de flujo de pago');
        sessionStorage.removeItem('reloadAfterPurchase');
        await this.forceCompleteReload();
      }

      this.setupFilterSubscriptions();
      this.setupPromotionUpdateListener();
      await this.loadFilterOptions();

      if (!shouldReload) {
        await this.loadProductsAsync();
      }

      this.handleUrlParams();
      this.updateActiveFiltersCount();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('❌ Error en inicialización:', error);
      this.message.error('Error al cargar el catálogo');
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async forceCompleteReload(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();

    try {
      await this.loadProductsAsync(true);

      this.filterForm.reset({
        categories: [],
        colors: [],
        sizes: [],
        gender: '',
        priceRange: [0, 1000],
        priceRanges: [],
        brands: [],
        hasDiscount: false,
        isNew: false,
        isBestSeller: false,
        inStock: false
      });

      this.searchControl.setValue('');
      this.sortControl.setValue('relevance');

      console.log('✅ Recarga completa exitosa');
    } catch (error) {
      console.error('❌ Error en recarga:', error);
      window.location.reload();
    }
  }

  ngOnDestroy(): void {
    this.promotionStateService.unregisterComponent(this.COMPONENT_NAME);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // 🆕 NUEVO: Configurar escucha de actualizaciones de promociones
  private setupPromotionUpdateListener(): void {
    console.log('🛍️ [CATALOG] Configurando listener de promociones...');

    this.promotionStateService.onGlobalUpdate()
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(2000) // Más tiempo para evitar múltiples actualizaciones
      )
      .subscribe({
        next: (globalUpdate) => {
          console.log('🛍️ [CATALOG] ¡ACTUALIZACIÓN RECIBIDA!:', globalUpdate);
          this.handlePromotionUpdate(globalUpdate);
        },
        error: (error) => {
          console.error('🛍️ [CATALOG] Error en listener:', error);
        }
      });
  }

  // 🆕 NUEVO: Manejar actualizaciones de promociones
  private handlePromotionUpdate(globalUpdate: any): void {
    const event = globalUpdate.data;

    console.log(`🛍️ [CATALOG] Procesando evento: ${event.type}`);

    // Mostrar mensaje de actualización
    this.message.loading('Actualizando catálogo...', { nzDuration: 1500 });

    // Limpiar caché si tienes acceso
    if (this.cacheService) {
      this.cacheService.invalidate('products');
      this.cacheService.clearCache();
    }

    // Pequeño delay y luego forzar recarga
    setTimeout(() => {
      // Llamar con forceRefresh = true
      this.loadProductsAsync(true).then(() => {
        console.log('🛍️ [CATALOG] Productos actualizados');
      }).catch(error => {
        console.error('🛍️ [CATALOG] Error actualizando productos:', error);
      });
    }, 100);
  }

  private initFilterForm(): void {
    this.filterForm = this.fb.group({
      categories: [[]],
      colors: [[]],
      sizes: [[]],
      gender: [''],
      priceRange: [[0, 1000]],
      priceRanges: [[]],
      brands: [[]],
      hasDiscount: [false],
      isNew: [false],
      isBestSeller: [false],
      inStock: [false]
    });
  }

  private setupFilterSubscriptions(): void {
    // 🔄 CAMBIAR: Búsqueda usando searchControl
    this.searchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.applyFilters();
    });

    // 🔄 CAMBIAR: Ordenamiento usando sortControl
    this.sortControl.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(sortBy => {
      this.applyFilters();
    });

    // Cambios en filtros del formulario
    this.filterForm.valueChanges.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.currentPage = 1;
      this.updateActiveFiltersCount();
      this.applyFilters();
    });
  }

  // ✅ MEJORAR loadFilterOptions con más logging
  private async loadFilterOptions(): Promise<void> {
    try {
      const [categories, colors, sizes] = await Promise.all([
        firstValueFrom(this.categoryService.getCategories()).catch(err => {
          console.error('Error loading categories:', err);
          return [];
        }),
        firstValueFrom(this.colorService.getColors()).catch(err => {
          console.error('Error loading colors:', err);
          return [];
        }),
        firstValueFrom(this.sizeService.getSizes()).catch(err => {
          console.error('Error loading sizes:', err);
          return [];
        })
      ]);

      this.filterOptions = {
        categories: categories || [],
        colors: colors || [],
        sizes: sizes || [],
        priceRange: { min: 0, max: 1000 },
        brands: []
      };

      // ✅ AGREGAR LOGGING de categorías cargadas
      console.log('📂 Categorías cargadas:', this.filterOptions.categories);
      console.log('📊 Total categorías:', this.filterOptions.categories.length);

      this.cdr.detectChanges();
    } catch (error) {
      console.error('Critical error loading filter options:', error);
      this.message.error('Error al cargar opciones de filtro');
    }
  }

  // ✅ VERIFICAR si usas ID o Name para categorías
  private validateCategoryConsistency(): void {
    console.group('🔍 Validando consistencia de categorías');

    // Categorías disponibles
    const availableCategories = this.filterOptions.categories;
    console.log('Categorías disponibles:', availableCategories);

    // Categorías únicas en productos
    const productCategories = [...new Set(this.products.map(p => p.category).filter(Boolean))];
    console.log('Categorías en productos:', productCategories);

    // Verificar si coinciden
    productCategories.forEach(prodCat => {
      const exists = availableCategories.some(avCat =>
        avCat.id === prodCat || avCat.name === prodCat
      );

      if (!exists) {
        console.warn(`⚠️ Categoría de producto no encontrada en opciones: ${prodCat}`);
      }
    });

    console.groupEnd();
  }
  private async loadProductsAsync(forceRefresh: boolean = false): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();

    try {
      // 1. ✅ OBTENER PRODUCTOS: Llamamos al método apropiado del servicio.
      // La variable 'products' que recibimos aquí ya contiene los precios
      // finales calculados (currentPrice, discountPercentage, etc.).
      const productsObservable = forceRefresh
        ? this.productService.getProductsNoCache()
        : this.productService.getProducts();

      const products = await firstValueFrom(productsObservable);

      // 🗑️ LÓGICA ELIMINADA: Ya no necesitamos buscar promociones ni recalcular
      // precios aquí. El ProductService ya hizo todo ese trabajo por nosotros.

      // 2. ✅ ASIGNAR Y CONTINUAR: Asignamos los productos listos para usar.
      this.products = products.map(p => this.initializeProductVariantState(p));
      this.updatePriceRange();
      this.applyFilters();

    } catch (error) {
      console.error('❌ Error cargando productos en el catálogo:', error);
      this.message.error('Error al cargar productos');
    } finally {
      this.loading = false;
      // Forzamos una detección de cambios final para asegurar que la UI se renderice.
      this.cdr.detectChanges();
    }
  }


  private initializeProductVariantState(product: Product): ProductWithSelectedVariant {
    const productWithVariant: ProductWithSelectedVariant = {
      ...product,
      selectedColorIndex: 0,
      displayImageUrl: product.imageUrl
    };

    // ✅ MEJORADO: Buscar primera variante con stock
    if (product.variants?.length) {
      const variantWithStock = product.variants.find(v => (v.stock || 0) > 0);
      productWithVariant.selectedVariant = variantWithStock || product.variants[0];

      // Si encontramos variante con stock, actualizar color e imagen
      if (variantWithStock) {
        const colorIndex = product.colors?.findIndex(c => c.name === variantWithStock.colorName);
        if (colorIndex !== -1) {
          productWithVariant.selectedColorIndex = colorIndex;
        }
      }
    }

    // Inicializar imagen usando la nueva lógica
    productWithVariant.displayImageUrl = this.getProductDisplayImage(productWithVariant);

    return productWithVariant;
  }

  private updatePriceRange(): void {
    if (this.products.length === 0) return;

    const prices = this.products.map(p => p.currentPrice || p.price);
    const minPrice = Math.floor(Math.min(...prices));
    const maxPrice = Math.ceil(Math.max(...prices));

    this.filterOptions.priceRange = { min: minPrice, max: maxPrice };

    // Actualizar formulario solo si es la primera vez
    const currentRange = this.filterForm.get('priceRange')?.value;
    if (currentRange[0] === 0 && currentRange[1] === 1000) {
      this.filterForm.patchValue({
        priceRange: [minPrice, maxPrice]
      }, { emitEvent: false });
    }
  }

  // ✅ REEMPLAZAR el método applyFilters() - Buscar la sección de filtro de categorías
  private applyFilters(): void {
    console.log('🔍 Aplicando filtros...');

    // 🔑 VALIDACIÓN CRÍTICA
    if (!this.products?.length) {
      console.warn('⚠️ No hay productos - saltando filtros');
      this.filteredProducts = [];
      this.total = 0;
      this.cdr.detectChanges();
      return;
    }

    if (!this.filterOptions.categories?.length) {
      console.warn('⚠️ filterOptions.categories vacío - aplicando filtros básicos');
      this.applyBasicFiltersOnly();
      return;
    }

    // Tu lógica de filtros actual...
    const filters = this.filterForm.value;
    const searchQuery = this.searchControl.value || '';
    const sortBy = this.sortControl.value || 'relevance';
    let filtered = [...this.products];

    // Búsqueda por texto
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.tags?.some(tag => tag.toLowerCase().includes(query)) ||
        p.sku.toLowerCase().includes(query)
      );
    }

    // Filtro de categorías
    if (filters.categories?.length) {
      filtered = filtered.filter(p => {
        if (p.category && filters.categories.includes(p.category)) return true;
        if (p.categories && p.categories.length > 0) {
          return p.categories.some(productCategory =>
            filters.categories.includes(productCategory)
          );
        }
        return false;
      });
    }

    // Filtro por género
    if (filters.gender) {
      filtered = filtered.filter(p => {
        // Unisex siempre se incluye
        if (p.gender === 'unisex') return true;

        // Normalizar ambos valores para comparación
        const productGender = this.normalizeGender(p.gender);
        const filterGender = this.normalizeGender(filters.gender);

        return productGender === filterGender;
      });
    }

    // Resto de tus filtros...
    if (filters.colors?.length) {
      filtered = filtered.filter(p => {
        if (!p.colors || p.colors.length === 0) return false;
        return p.colors.some(productColor =>
          filters.colors.includes(productColor.name)
        );
      });
    }

    if (filters.sizes?.length) {
      filtered = filtered.filter(p => {
        if (!p.sizes || p.sizes.length === 0) return false;
        return p.sizes.some(productSize =>
          filters.sizes.includes(productSize.name)
        );
      });
    }

    if (filters.priceRange) {
      const [minPrice, maxPrice] = filters.priceRange;
      filtered = filtered.filter(p => {
        const price = p.currentPrice || p.price;
        return price >= minPrice && price <= maxPrice;
      });
    }

    if (filters.priceRanges?.length) {
      filtered = filtered.filter(p => {
        const price = p.currentPrice || p.price;
        return filters.priceRanges.some((range: string) => {
          if (range.includes('+')) {
            const min = parseInt(range.replace('+', ''));
            return price >= min;
          } else {
            const [min, max] = range.split('-').map(Number);
            return price >= min && price <= max;
          }
        });
      });
    }

    // Filtros booleanos
    if (filters.hasDiscount) {
      filtered = filtered.filter(p => (p.discountPercentage || 0) > 0);
    }
    if (filters.isNew) {
      filtered = filtered.filter(p => p.isNew === true);
    }
    if (filters.isBestSeller) {
      filtered = filtered.filter(p => p.isBestSeller === true);
    }
    if (filters.inStock) {
      filtered = filtered.filter(p => (p.totalStock || 0) > 0);
    }

    // Ordenar
    filtered = this.sortProducts(filtered, sortBy);

    // Actualizar
    this.filteredProducts = filtered;
    this.total = filtered.length;

    setTimeout(() => {
      this.syncProductsWithActiveFilters();
      this.cdr.detectChanges();
    }, 0);

    this.cdr.detectChanges();
  }

  private normalizeGender(gender: string | undefined): string {
    if (!gender) return '';

    const normalized = gender.toLowerCase();

    // Normalizar variaciones de "hombre"
    if (['hombre', 'men', 'male', 'man', 'masculino'].includes(normalized)) {
      return 'hombre';
    }

    // Normalizar variaciones de "mujer"
    if (['mujer', 'women', 'female', 'woman', 'femenino'].includes(normalized)) {
      return 'mujer';
    }

    // Unisex
    if (['unisex', 'todos', 'all'].includes(normalized)) {
      return 'unisex';
    }

    return normalized;
  }

  private applyBasicFiltersOnly(): void {
    console.log('🔧 Aplicando solo filtros básicos...');

    const filters = this.filterForm.value;
    const searchQuery = this.searchControl.value || '';
    const sortBy = this.sortControl.value || 'relevance';
    let filtered = [...this.products];

    // Solo filtros que no dependen de filterOptions
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.tags?.some(tag => tag.toLowerCase().includes(query)) ||
        p.sku.toLowerCase().includes(query)
      );
    }

    if (filters.gender) {
      filtered = filtered.filter(p => {
        if (p.gender === 'unisex') return true;
        return p.gender === filters.gender;
      });
    }

    if (filters.priceRange) {
      const [minPrice, maxPrice] = filters.priceRange;
      filtered = filtered.filter(p => {
        const price = p.currentPrice || p.price;
        return price >= minPrice && price <= maxPrice;
      });
    }

    if (filters.hasDiscount) {
      filtered = filtered.filter(p => (p.discountPercentage || 0) > 0);
    }
    if (filters.isNew) {
      filtered = filtered.filter(p => p.isNew === true);
    }
    if (filters.isBestSeller) {
      filtered = filtered.filter(p => p.isBestSeller === true);
    }
    if (filters.inStock) {
      filtered = filtered.filter(p => (p.totalStock || 0) > 0);
    }

    filtered = this.sortProducts(filtered, sortBy);

    this.filteredProducts = filtered;
    this.total = filtered.length;

    console.log(`✅ Filtros básicos aplicados: ${this.total} productos`);

    setTimeout(() => {
      this.syncProductsWithActiveFilters();
      this.cdr.detectChanges();
    }, 0);

    this.cdr.detectChanges();
  }


  // ✅ MÉTODO AUXILIAR: Obtener nombre de categoría por ID
  getCategoryNameById(categoryId: string | undefined): string {
    if (!categoryId) return 'Sin Categoría';

    const category = this.filterOptions.categories.find(cat => cat.id === categoryId);
    return category ? category.name : `ID: ${categoryId}`;
  }

  onColorChanged(event: { product: Product, color: Color, index: number }): void {
    const { product, color, index } = event;

    // Encontrar el producto en filteredProducts y actualizarlo
    const productIndex = this.filteredProducts.findIndex(p => p.id === product.id);
    if (productIndex !== -1) {
      this.filteredProducts[productIndex].selectedColorIndex = index;
      this.filteredProducts[productIndex].displayImageUrl = color.imageUrl || product.imageUrl;

      console.log(`🎨 Color cambiado en catálogo: ${product.name} → ${color.name}`);
      this.cdr.detectChanges();
    }
  }

  // ✅ NUEVO MÉTODO: Sincronizar productos con filtros activos
  private syncProductsWithActiveFilters(): void {
    const activeColors = this.filterForm.get('colors')?.value || [];

    if (activeColors.length === 0) {
      // Si no hay filtros de color activos, mantener selección actual
      return;
    }

    // Para cada producto visible, intentar seleccionar un color que coincida con los filtros
    this.filteredProducts.forEach(product => {
      this.syncProductColorWithFilters(product, activeColors);
    });

    this.cdr.detectChanges();
  }

  // ✅ VERSIÓN MEJORADA: Considerar también tallas y stock
  private syncProductColorWithFilters(product: ProductWithSelectedVariant, activeColors: string[]): void {
    if (!product.colors || product.colors.length === 0) {
      return;
    }

    const activeSizes = this.filterForm.get('sizes')?.value || [];

    // Buscar el mejor color que coincida con filtros y tenga stock
    let bestMatch: { color: Color; index: number; variant?: ProductVariant } | null = null;

    for (let i = 0; i < product.colors.length; i++) {
      const color = product.colors[i];

      // Verificar si el color coincide con el filtro
      if (!activeColors.includes(color.name)) {
        continue;
      }

      // Buscar variantes de este color
      const colorVariants = product.variants?.filter(v => v.colorName === color.name) || [];

      if (activeSizes.length > 0) {
        // Si hay filtros de talla, buscar variante que coincida con color Y talla
        const matchingVariant = colorVariants.find(v =>
          activeSizes.includes(v.sizeName) && v.stock > 0
        );

        if (matchingVariant) {
          bestMatch = { color, index: i, variant: matchingVariant };
          break; // Coincidencia perfecta
        }
      } else {
        // Si no hay filtros de talla, buscar cualquier variante con stock
        const stockVariant = colorVariants.find(v => v.stock > 0);

        if (stockVariant && !bestMatch) {
          bestMatch = { color, index: i, variant: stockVariant };
        }
      }
    }

    // Aplicar la mejor coincidencia encontrada
    if (bestMatch) {
      this.onColorSelect(product, bestMatch.color, bestMatch.index);

      if (bestMatch.variant) {
        product.selectedVariant = bestMatch.variant;
      }

      console.log(`🎯 ${product.name} → ${bestMatch.color.name}${bestMatch.variant ? ` (${bestMatch.variant.sizeName})` : ''}`);
    }
  }

  // ✅ MÉTODO PÚBLICO: Para activar sincronización manualmente
  syncAllProductsWithFilters(): void {
    console.log('🔄 Sincronizando todos los productos con filtros activos...');
    this.syncProductsWithActiveFilters();
  }

  // ✅ MÉTODO PÚBLICO: Para sincronizar cuando cambian los filtros
  onFilterColorChange(): void {
    // Esperar un tick para que se actualicen los filtros
    setTimeout(() => {
      this.syncProductsWithActiveFilters();
    }, 100);
  }

  private sortProducts(products: ProductWithSelectedVariant[], sortBy: string): ProductWithSelectedVariant[] {
    return products.sort((a, b) => {
      switch (sortBy) {
        case 'price_asc':
          return (a.currentPrice || a.price) - (b.currentPrice || b.price);
        case 'price_desc':
          return (b.currentPrice || b.price) - (a.currentPrice || a.price);
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'newest':
          return (b.id || '').localeCompare(a.id || '');
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'bestseller':
          return (b.sales || 0) - (a.sales || 0);
        default:
          return 0;
      }
    });
  }

  // Filter Management Methods
  onFilterChange(filterType: string, value: any): void {
    this.filterForm.patchValue({ [filterType]: value });
    this.updateActiveFiltersCount();
  }

  toggleColorFilter(colorName: string): void {
    const currentColors = this.filterForm.get('colors')?.value || [];
    const index = currentColors.indexOf(colorName);

    if (index > -1) {
      currentColors.splice(index, 1);
    } else {
      currentColors.push(colorName);
    }

    this.filterForm.patchValue({ colors: currentColors });
    this.updateActiveFiltersCount();
    this.onFilterColorChange();
  }

  isColorSelected(colorName: string): boolean {
    const selectedColors = this.filterForm.get('colors')?.value || [];
    return selectedColors.includes(colorName);
  }

  hasActiveFilters(): boolean {
    return this.activeFiltersCount > 0;
  }

  updateActiveFiltersCount(): void {
    const formValue = this.filterForm.value;
    let count = 0;

    if (formValue.categories?.length) count += formValue.categories.length;
    if (formValue.colors?.length) count += formValue.colors.length;
    if (formValue.sizes?.length) count += formValue.sizes.length;
    if (formValue.gender) count += 1;
    if (formValue.priceRanges?.length) count += formValue.priceRanges.length;
    if (formValue.inStock) count += 1;
    if (formValue.hasDiscount) count += 1;
    if (formValue.isNew) count += 1;
    if (formValue.isBestSeller) count += 1;

    this.activeFiltersCount = count;
    this.cdr.detectChanges();
  }

  getActiveFilterTags(): FilterTag[] {
    const tags: FilterTag[] = [];
    const formValue = this.filterForm.value;

    // Tags de categorías
    if (formValue.categories?.length) {
      formValue.categories.forEach((categoryId: string) => {
        const category = this.filterOptions.categories.find(c => c.id === categoryId);
        if (category) {
          tags.push({
            type: 'categories',
            value: categoryId,
            label: category.name
          });
        }
      });
    }

    // Tags de colores
    if (formValue.colors?.length) {
      formValue.colors.forEach((colorName: string) => {
        tags.push({
          type: 'colors',
          value: colorName,
          label: colorName
        });
      });
    }

    // Tags de tallas
    if (formValue.sizes?.length) {
      formValue.sizes.forEach((sizeName: string) => {
        tags.push({
          type: 'sizes',
          value: sizeName,
          label: sizeName
        });
      });
    }

    // Tags de rangos de precio
    if (formValue.priceRanges?.length) {
      formValue.priceRanges.forEach((range: string) => {
        const priceRange = this.priceRanges.find(pr => pr.value === range);
        if (priceRange) {
          tags.push({
            type: 'priceRanges',
            value: range,
            label: priceRange.label
          });
        }
      });
    }

    // Tags de filtros booleanos
    if (formValue.inStock) {
      tags.push({ type: 'inStock', value: true, label: 'En Stock' });
    }
    if (formValue.hasDiscount) {
      tags.push({ type: 'hasDiscount', value: true, label: 'Con Descuento' });
    }
    if (formValue.isNew) {
      tags.push({ type: 'isNew', value: true, label: 'Nuevo' });
    }
    if (formValue.isBestSeller) {
      tags.push({ type: 'isBestSeller', value: true, label: 'Más Vendido' });
    }

    return tags;
  }

  removeFilter(type: string, value: any): void {
    const currentValue = this.filterForm.get(type)?.value;

    if (Array.isArray(currentValue)) {
      const index = currentValue.indexOf(value);
      if (index > -1) {
        currentValue.splice(index, 1);
        this.filterForm.patchValue({ [type]: currentValue });
      }
    } else {
      this.filterForm.patchValue({ [type]: false });
    }

    this.updateActiveFiltersCount();
  }

  clearAllFilters(): void {
    // 🔄 CAMBIAR: Limpiar controles individuales
    this.searchControl.setValue('', { emitEvent: false });
    this.sortControl.setValue('relevance', { emitEvent: false });

    this.filterForm.reset({
      // searchQuery: '', // ❌ REMOVER
      categories: [],
      colors: [],
      sizes: [],
      priceRange: [this.filterOptions.priceRange.min, this.filterOptions.priceRange.max],
      priceRanges: [],
      brands: [],
      hasDiscount: false,
      isNew: false,
      isBestSeller: false,
      // sortBy: 'relevance', // ❌ REMOVER
      inStock: false
    });

    this.updateActiveFiltersCount();
  }

  // Método unificado para limpiar filtros (mantiene compatibilidad)
  clearFilters(): void {
    this.clearAllFilters();
  }


  onVariantSelect(product: ProductWithSelectedVariant, variant: ProductVariant): void {
    product.selectedVariant = variant;
    product.displayImageUrl = variant.imageUrl || product.imageUrl;

    // Actualizar índice de color si aplica
    const colorIndex = product.colors?.findIndex(c => c.name === variant.colorName);
    if (colorIndex !== -1) {
      product.selectedColorIndex = colorIndex;
    }

    this.cdr.detectChanges();
  }

  onVariantSelectFromDropdown(product: ProductWithSelectedVariant, variantId: string): void {
    const variant = product.variants?.find(v => v.id === variantId);
    if (variant) {
      this.onVariantSelect(product, variant);
    }
  }

  onColorSelect(product: ProductWithSelectedVariant, color: Color, colorIndex: number): void {
    product.selectedColorIndex = colorIndex;

    // Buscar variante que coincida con el color y que tenga stock
    const availableVariants = product.variants?.filter(v =>
      v.colorName === color.name && v.stock > 0
    ) || [];

    if (availableVariants.length > 0) {
      // Seleccionar la primera variante disponible del color
      product.selectedVariant = availableVariants[0];

      // Actualizar imagen usando imagen de variante si existe
      if (availableVariants[0].imageUrl) {
        product.displayImageUrl = availableVariants[0].imageUrl;
      } else if (color.imageUrl) {
        product.displayImageUrl = color.imageUrl;
      }
    } else {
      // Si no hay variantes con stock, mostrar imagen del color pero sin variante seleccionada
      product.selectedVariant = undefined;
      product.displayImageUrl = color.imageUrl || product.imageUrl;
    }

    this.cdr.detectChanges();
  }

  async addToCart(product: ProductWithSelectedVariant): Promise<void> {
    if (!product.selectedVariant) {
      this.message.warning('Por favor selecciona una variante del producto');
      return;
    }

    if (product.selectedVariant.stock <= 0) {
      this.message.warning('Producto sin stock disponible');
      return;
    }

    try {
      // ✅ CORRECCIÓN: Llamada al servicio solo con los 3 argumentos necesarios
      const success = await firstValueFrom(
        this.cartService.addToCart(
          product.id,
          product.selectedVariant.id,
          1 // La cantidad es 1 por defecto desde el catálogo
        )
      );

      if (success) {
        this.message.success(`${product.name} agregado al carrito`);
      }
      // Ya no se necesita un 'else', el servicio maneja el mensaje de error.

    } catch (error) {
      console.error('Error al agregar al carrito desde el catálogo:', error);
      // No mostramos un mensaje aquí porque el servicio ya lo hace.
    }
  }

  viewProductDetails(productId: string): void {
    this.router.navigate(['/products', productId]);
  }

  toggleMobileFilters(): void {
    this.showMobileFilters = !this.showMobileFilters;
  }

  changeViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
    this.cdr.detectChanges();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private handleUrlParams(): void {
    this.route.queryParams.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      if (params['category']) {
        this.filterForm.patchValue({ categories: [params['category']] });
      }
      if (params['search']) {
        // 🔄 CAMBIAR: Usar searchControl
        this.searchControl.setValue(params['search']);
      }
      if (params['gender']) {
        this.filterForm.patchValue({ gender: params['gender'] });
      }
    });
  }

  // ✅ AGREGAR método para manejar imágenes de variantes
  getProductDisplayImage(product: ProductWithSelectedVariant): string {
    // 1. Prioridad: Imagen de variante seleccionada
    if (product.selectedVariant?.imageUrl) {
      return product.selectedVariant.imageUrl;
    }

    // 2. Fallback: Imagen del color activo
    if (product.selectedColorIndex !== undefined && product.colors) {
      const activeColor = product.colors[product.selectedColorIndex];
      if (activeColor?.imageUrl) {
        return activeColor.imageUrl;
      }
    }

    // 3. Fallback: displayImageUrl calculada
    if (product.displayImageUrl) {
      return product.displayImageUrl;
    }

    // 4. Fallback final: imagen principal
    return product.imageUrl || this.getDefaultImage();
  }

  private getDefaultImage(): string {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOGY4Ii8+PC9nPjwvc3ZnPg==';
  }

  // Color scroll methods
  hasManyColors(product: Product): boolean {
    return !!(product?.colors && product.colors.length > 4);
  }

  scrollColors(productId: string, direction: 'left' | 'right'): void {
    const colorOptions = document.querySelector(`[data-product-id="${productId}"]`)?.closest('.color-options') as HTMLElement;
    if (!colorOptions) return;

    const container = colorOptions.querySelector('.colors-container') as HTMLElement;
    if (!container) return;

    const scrollAmount = direction === 'left' ? -120 : 120;

    container.scrollBy({
      left: scrollAmount,
      behavior: 'smooth'
    });
  }

  // Utility methods
  hasDiscount(product: Product): boolean {
    return (product.discountPercentage || 0) > 0;
  }

  formatPrice(price: number): string {
    return price.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  getDisplayedProducts(): ProductWithSelectedVariant[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.filteredProducts.slice(startIndex, endIndex);
  }

  trackByProductId(index: number, product: ProductWithSelectedVariant): string {
    return product.id;
  }

  hasColors(product: Product): boolean {
    return !!(product.colors && product.colors.length > 0);
  }

  hasVariants(product: Product): boolean {
    return !!(product.variants && product.variants.length > 0);
  }

  getAvailableVariants(product: Product): ProductVariant[] {
    return product.variants?.filter(v => v.stock > 0) || [];
  }

  isColorActive(product: ProductWithSelectedVariant, colorIndex: number): boolean {
    return product.selectedColorIndex === colorIndex;
  }

  getActiveColorName(product: ProductWithSelectedVariant): string {
    if (!this.hasColors(product) || product.selectedColorIndex === undefined) {
      return '';
    }
    return product.colors[product.selectedColorIndex]?.name || '';
  }

  handleImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOGY4Ii8+PGcgZmlsbD0iIzk5OSI+PGNpcmNsZSBjeD0iMTIwIiBjeT0iMTAwIiByPSIyMCIvPjxwYXRoIGQ9Im05MCAx NjBoNjB2NDBINTB6Ii8+PC9nPjx0ZXh0IHg9IjUwJSIgeT0iODAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlByb2R1Y3RvPC90ZXh0Pjwvc3ZnPg==';
    }
  }

  // Utility method for safe type casting in templates
  $any(value: any): any {
    return value;
  }

  getStockText(stock: number): string {
    if (stock <= 0) {
      return 'Sin stock';
    } else if (stock <= 5) {
      return 'Últimas unidades';
    } else {
      return 'En stock';
    }
  }

  getAddToCartText(product: ProductWithSelectedVariant): string {
    if (!product.selectedVariant) {
      return 'Seleccionar variante';
    }

    if (product.selectedVariant.stock <= 0) {
      return 'Sin stock';
    }

    return 'Agregar al carrito';
  }
}