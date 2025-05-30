import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subject, BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, takeUntil, finalize, catchError, of, switchMap, take } from 'rxjs';

// Services
import { ProductService } from '../../../services/admin/product/product.service';
import { ProductPriceService } from '../../../services/admin/price/product-price.service';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { ColorService } from '../../../services/admin/color/color.service';
import { SizeService } from '../../../services/admin/size/size.service';
import { CartService } from '../../../pasarela-pago/services/cart/cart.service';

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

interface ProductFilters {
  searchQuery: string;
  categories: string[];
  colors: string[];
  sizes: string[];
  priceRange: [number, number];
  priceRanges: string[];
  brands: string[];
  hasDiscount: boolean;
  isNew: boolean;
  isBestSeller: boolean;
  sortBy: string;
  inStock: boolean;
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
    private router: Router,
    private route: ActivatedRoute,
    private message: NzMessageService,
    private modal: NzModalService,
    public cdr: ChangeDetectorRef
  ) {
    this.initFilterForm();
  }

  ngOnInit(): void {
    this.loadFilterOptions();
    this.setupFilterSubscriptions();
    this.loadProducts();
    this.handleUrlParams();
    this.updateActiveFiltersCount();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initFilterForm(): void {
    this.filterForm = this.fb.group({
      categories: [[]],
      colors: [[]],
      sizes: [[]],
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

  private async loadFilterOptions(): Promise<void> {
    try {
      const [categories, colors, sizes] = await Promise.all([
        this.categoryService.getCategories().pipe(take(1)).toPromise(),
        this.colorService.getColors().pipe(take(1)).toPromise(),
        this.sizeService.getSizes().pipe(take(1)).toPromise()
      ]);

      this.filterOptions = {
        categories: categories || [],
        colors: colors || [],
        sizes: sizes || [],
        priceRange: { min: 0, max: 1000 },
        brands: [] // Se puede obtener de los productos
      };

      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  }

  private loadProducts(): void {
    this.loading = true;
    this.cdr.detectChanges();

    this.productService.getProducts().pipe(
      take(1),
      switchMap(products =>
        this.productPriceService.calculateDiscountedPrices(products).pipe(take(1))
      ),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (products) => {
        this.products = products.map(p => this.initializeProductVariantState(p));
        this.updatePriceRange();
        this.applyFilters();
      },
      error: (error) => {
        console.error('Error loading products:', error);
        this.message.error('Error al cargar productos');
      }
    });
  }

  private initializeProductVariantState(product: Product): ProductWithSelectedVariant {
    const productWithVariant: ProductWithSelectedVariant = {
      ...product,
      selectedColorIndex: 0,
      displayImageUrl: product.imageUrl
    };

    // Inicializar con primera imagen de color si existe
    if (product.colors && product.colors.length > 0) {
      const firstColor = product.colors[0];
      if (firstColor.imageUrl) {
        productWithVariant.displayImageUrl = firstColor.imageUrl;
      }
    }

    // Seleccionar primera variante disponible con stock
    if (product.variants && product.variants.length > 0) {
      const availableVariant = product.variants.find(v => v.stock > 0) || product.variants[0];
      productWithVariant.selectedVariant = availableVariant;
    }

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

  private applyFilters(): void {
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

    // Filtro por categorías
    if (filters.categories?.length) {
      filtered = filtered.filter(p => filters.categories.includes(p.category));
    }

    // Filtro por colores
    if (filters.colors?.length) {
      filtered = filtered.filter(p =>
        p.colors?.some(color => filters.colors.includes(color.name))
      );
    }

    // Filtro por tallas
    if (filters.sizes?.length) {
      filtered = filtered.filter(p =>
        p.sizes?.some(size => filters.sizes.includes(size.name))
      );
    }

    // Filtro por rango de precio (slider)
    if (filters.priceRange) {
      const [minPrice, maxPrice] = filters.priceRange;
      filtered = filtered.filter(p => {
        const price = p.currentPrice || p.price;
        return price >= minPrice && price <= maxPrice;
      });
    }

    // Filtro por rangos de precio predefinidos
    if (filters.priceRanges?.length) {
      filtered = filtered.filter(p => {
        const price = p.currentPrice || p.price;
        return filters.priceRanges.some((range: { split: (arg0: string) => { (): any; new(): any; map: { (arg0: NumberConstructor): [any, any]; new(): any; }; }; }) => {
          const [min, max] = range.split('-').map(Number);
          if (max) {
            return price >= min && price <= max;
          } else {
            return price >= min; // Para el rango "150+"
          }
        });
      });
    }

    // Filtros booleanos
    if (filters.hasDiscount) {
      filtered = filtered.filter(p => (p.discountPercentage || 0) > 0);
    }
    if (filters.isNew) {
      filtered = filtered.filter(p => p.isNew);
    }
    if (filters.isBestSeller) {
      filtered = filtered.filter(p => p.isBestSeller);
    }
    if (filters.inStock) {
      filtered = filtered.filter(p => (p.totalStock || 0) > 0);
    }

    // Aplicar ordenamiento
    filtered = this.sortProducts(filtered, sortBy);

    this.filteredProducts = filtered;
    this.total = filtered.length;
    this.cdr.detectChanges();
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

    // Actualizar imagen usando la lógica mejorada
    if (color.imageUrl) {
      product.displayImageUrl = color.imageUrl;
    } else {
      product.displayImageUrl = product.imageUrl;
    }

    // Buscar variante que coincida con el color seleccionado
    const matchingVariant = product.variants?.find(v => v.colorName === color.name);
    if (matchingVariant) {
      product.selectedVariant = matchingVariant;
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
      const success = await this.cartService.addToCart(
        product.id,
        product.selectedVariant.id,
        1,
        product,
        product.selectedVariant
      ).pipe(take(1)).toPromise();

      if (success) {
        this.message.success(`${product.name} agregado al carrito`);
      } else {
        this.message.error('No se pudo agregar el producto al carrito');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      this.message.error('Error al agregar al carrito');
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
  });
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