import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, finalize, switchMap, take, firstValueFrom } from 'rxjs';

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
  gridCols = 4;
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

    // Debug después de 3 segundos
    setTimeout(() => {
      this.validateColorDataConsistency();
      this.debugColorSystem();
    }, 3000);
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
    // Búsqueda usando searchControl
    this.searchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.applyFilters();
    });

    // Ordenamiento usando sortControl
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

      console.log('✅ Opciones de filtro cargadas:');
      console.log('📂 Categorías:', this.filterOptions.categories.length);
      console.log('🎨 Colores:', this.filterOptions.colors.length);
      console.log('📏 Tallas:', this.filterOptions.sizes.length);

      this.cdr.detectChanges();
    } catch (error) {
      console.error('Critical error loading filter options:', error);
      this.message.error('Error al cargar opciones de filtro');
    }
  }

  private validateCategoryConsistency(): void {
    console.group('🔍 Validando consistencia de categorías');

    const availableCategories = this.filterOptions.categories;
    console.log('Categorías disponibles:', availableCategories);

    const productCategories = [...new Set(this.products.map(p => p.category).filter(Boolean))];
    console.log('Categorías en productos:', productCategories);

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
        this.validateCategoryConsistency();
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

    // Buscar primera variante con stock
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

  private applyFilters(): void {
    if (!this.products?.length || !this.filterOptions.categories?.length) {
      console.warn('⚠️ Datos no listos para filtrar');
      return;
    }

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
      console.log('🔍 Aplicando filtro de categorías:', filters.categories);

      filtered = filtered.filter(p => {
        // Verificar campo singular (legacy)
        if (p.category && filters.categories.includes(p.category)) {
          console.log(`✅ ${p.name} coincide con categoría singular: ${p.category}`);
          return true;
        }

        // Verificar campo plural (múltiples categorías)
        if (p.categories && p.categories.length > 0) {
          const hasMatch = p.categories.some(productCategory =>
            filters.categories.includes(productCategory)
          );

          if (hasMatch) {
            const matchingCategories = p.categories.filter(cat => filters.categories.includes(cat));
            console.log(`✅ ${p.name} coincide con categorías: ${matchingCategories.join(', ')}`);
            return true;
          }
        }

        console.log(`❌ ${p.name} no coincide - categoria: "${p.category}", categorias: [${p.categories?.join(', ') || 'vacío'}]`);
        return false;
      });

      console.log(`📊 Productos después de filtro categoría: ${filtered.length}`);
    }

    // Filtro por colores
    if (filters.colors?.length) {
      filtered = filtered.filter(p => {
        if (!p.colors || p.colors.length === 0) return false;
        return p.colors.some(productColor =>
          filters.colors.includes(productColor.name)
        );
      });
    }

    // Filtro por tallas
    if (filters.sizes?.length) {
      filtered = filtered.filter(p => {
        if (!p.sizes || p.sizes.length === 0) return false;
        return p.sizes.some(productSize =>
          filters.sizes.includes(productSize.name)
        );
      });
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

    // Aplicar ordenamiento
    filtered = this.sortProducts(filtered, sortBy);

    this.filteredProducts = filtered;
    this.total = filtered.length;
    setTimeout(() => {
      this.syncProductsWithActiveFilters();
    }, 0);
    this.cdr.detectChanges();
  }

  private syncProductsWithActiveFilters(): void {
    const activeColors = this.filterForm.get('colors')?.value || [];

    if (activeColors.length === 0) {
      return;
    }

    this.filteredProducts.forEach(product => {
      this.syncProductColorWithFilters(product, activeColors);
    });

    this.cdr.detectChanges();
  }

  private syncProductColorWithFilters(product: ProductWithSelectedVariant, activeColors: string[]): void {
    if (!product.colors || product.colors.length === 0) {
      return;
    }

    console.log(`🔍 Sincronizando ${product.name} con colores:`, activeColors);

    const activeSizes = this.filterForm.get('sizes')?.value || [];
    let bestMatch: { color: Color; index: number; variant?: ProductVariant } | null = null;

    for (let i = 0; i < product.colors.length; i++) {
      const color = product.colors[i];
      const colorName = typeof color === 'string' ? color : color.name;

      console.log(`🎨 Verificando color: ${colorName} contra filtros:`, activeColors);

      if (!activeColors.includes(colorName)) {
        continue;
      }

      const colorVariants = product.variants?.filter(v => v.colorName === colorName) || [];

      if (activeSizes.length > 0) {
        const matchingVariant = colorVariants.find(v =>
          activeSizes.includes(v.sizeName) && v.stock > 0
        );

        if (matchingVariant) {
          bestMatch = { color, index: i, variant: matchingVariant };
          break;
        }
      } else {
        const stockVariant = colorVariants.find(v => v.stock > 0);

        if (stockVariant && !bestMatch) {
          bestMatch = { color, index: i, variant: stockVariant };
        }
      }
    }

    if (bestMatch) {
      console.log(`🎯 Aplicando color: ${bestMatch.color.name} a ${product.name}`);
      this.onColorSelect(product, bestMatch.color, bestMatch.index);

      if (bestMatch.variant) {
        product.selectedVariant = bestMatch.variant;
      }
    } else {
      console.log(`❌ No se encontró coincidencia de color para ${product.name}`);
    }
  }

  validateColorDataConsistency(): void {
    console.group('🔧 VALIDANDO CONSISTENCIA DE COLORES');

    if (this.filterOptions.colors?.length) {
      const sampleFilterColor = this.filterOptions.colors[0];
      console.log('📋 Estructura de filterOptions.colors[0]:', {
        name: sampleFilterColor.name,
        code: sampleFilterColor.code,
        id: sampleFilterColor.id
      });
    }

    if (this.products?.length) {
      const productWithColors = this.products.find(p => p.colors?.length > 0);
      if (productWithColors) {
        const sampleProductColor = productWithColors.colors[0];
        console.log('📋 Estructura de product.colors[0]:', {
          name: sampleProductColor.name,
          code: sampleProductColor.code,
          imageUrl: sampleProductColor.imageUrl
        });

        const filterColorNames = this.filterOptions.colors.map(c => c.name);
        const productColorNames = productWithColors.colors.map(c => c.name);

        console.log('🔍 Coincidencias de nombres:', {
          filterColors: filterColorNames,
          productColors: productColorNames,
          intersection: filterColorNames.filter(fc => productColorNames.includes(fc))
        });
      }
    }

    console.groupEnd();
  }

  debugColorSystem(): void {
    console.group('🎨 DEBUG SISTEMA DE COLORES');

    console.log('🌈 Colores disponibles:', this.filterOptions.colors);

    if (this.products?.length) {
      const productColors = new Set();
      this.products.forEach(p => {
        p.colors?.forEach(color => {
          if (typeof color === 'string') {
            productColors.add(color);
          } else {
            productColors.add(color.name);
          }
        });
      });
      console.log('🎭 Colores únicos en productos:', Array.from(productColors));
    }

    console.log('🎛️ Filtros de color activos:', this.filterForm.get('colors')?.value);

    if (this.products?.[0]?.colors) {
      console.log('📋 Estructura de colores del primer producto:', this.products[0].colors);
    }

    console.groupEnd();
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

    console.log('🎨 Colores actualizados:', currentColors);

    this.filterForm.patchValue({ colors: currentColors });
    this.updateActiveFiltersCount();

    setTimeout(() => {
      this.onFilterColorChange();
    }, 100);
  }

  isColorSelected(colorName: string): boolean {
    const selectedColors = this.filterForm.get('colors')?.value || [];
    const isSelected = selectedColors.includes(colorName);

    console.log(`🔍 Color ${colorName} selected:`, isSelected, 'Lista:', selectedColors);

    return isSelected;
  }

  onFilterColorChange(): void {
    console.log('🔄 Sincronizando colores con filtros...');

    const activeColors = this.filterForm.get('colors')?.value || [];
    console.log('🎨 Colores activos para sincronizar:', activeColors);

    if (activeColors.length === 0) {
      console.log('📝 No hay filtros de color activos');
      return;
    }

    setTimeout(() => {
      this.syncProductsWithActiveFilters();
    }, 100);
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
    this.searchControl.setValue('', { emitEvent: false });
    this.sortControl.setValue('relevance', { emitEvent: false });

    this.filterForm.reset({
      categories: [],
      colors: [],
      sizes: [],
      priceRange: [this.filterOptions.priceRange.min, this.filterOptions.priceRange.max],
      priceRanges: [],
      brands: [],
      hasDiscount: false,
      isNew: false,
      isBestSeller: false,
      inStock: false
    });

    this.updateActiveFiltersCount();
  }

  onVariantSelect(product: ProductWithSelectedVariant, variant: ProductVariant): void {
    product.selectedVariant = variant;
    product.displayImageUrl = variant.imageUrl || product.imageUrl;

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

    const availableVariants = product.variants?.filter(v =>
      v.colorName === color.name && v.stock > 0
    ) || [];

    if (availableVariants.length > 0) {
      product.selectedVariant = availableVariants[0];

      if (availableVariants[0].imageUrl) {
        product.displayImageUrl = availableVariants[0].imageUrl;
      } else if (color.imageUrl) {
        product.displayImageUrl = color.imageUrl;
      }
    } else {
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
      const success = await firstValueFrom(
        this.cartService.addToCart(
          product.id,
          product.selectedVariant.id,
          1,
          product,
          product.selectedVariant
        )
      );

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

  onPageChange(page: number): void {
    this.currentPage = page;
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
        this.searchControl.setValue(params['search']);
      }
    });
  }

  getProductDisplayImage(product: ProductWithSelectedVariant): string {
    if (product.selectedVariant?.imageUrl) {
      return product.selectedVariant.imageUrl;
    }

    if (product.selectedColorIndex !== undefined && product.colors) {
      const activeColor = product.colors[product.selectedColorIndex];
      if (activeColor?.imageUrl) {
        return activeColor.imageUrl;
      }
    }

    if (product.displayImageUrl) {
      return product.displayImageUrl;
    }

    return product.imageUrl || this.getDefaultImage();
  }

  private getDefaultImage(): string {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOGY4Ii8+PC9nPjwvc3ZnPg==';
  }

  // Utility methods
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
      target.src = this.getDefaultImage();
    }
  }

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

    if ((product.selectedVariant.stock || 0) <= 0) {
      return 'Sin stock';
    }

    return 'Agregar al carrito';
  }
}