import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, Subject, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';

// Servicios
import { ProductService } from '../../../services/admin/product/product.service';
import { ColorService } from '../../../services/admin/color/color.service';
import { SizeService } from '../../../services/admin/size/size.service';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { CacheService } from '../../../services/admin/cache/cache.service';
import { StockUpdateService, StockUpdate } from '../../../services/admin/stockUpdate/stock-update.service';

// Modelos
import { Product, Color, Size } from '../../../models/models';

// Componentes
import { ProductFormComponent } from '../product-form/product-form.component';
import { ProductStatsComponent } from '../product-stats/product-stats.component';
import { ProductInventoryComponent } from '../product-inventory/product-inventory.component';
import { ProductPromotionsComponent } from '../product-promotions/product-promotions.component';

// Módulos de NG-ZORRO
import { NzTableModule, NzTableQueryParams } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { FormsModule } from '@angular/forms';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { PromotionManagementComponent } from "../promotion-management/promotion-management.component";

// 🚀 Interfaces para actualización optimista
interface ProductBackup {
  originalProduct: Product;
  index: number;
  timestamp: number;
}

interface OptimisticProductOperation {
  type: 'create' | 'update' | 'delete';
  productId: string;
  backup?: ProductBackup;
  newProduct?: Product;
}

@Component({
  selector: 'app-product-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    NzTableModule,
    NzButtonModule,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzTagModule,
    NzToolTipModule,
    NzIconModule,
    NzSpinModule,
    NzPopconfirmModule,
    NzModalModule,
    NzAvatarModule,
    NzEmptyModule,
    NzDropDownModule,
    NzDrawerModule,
    NzTabsModule,
    // Componentes hijo
    ProductFormComponent,
    ProductStatsComponent,
    ProductInventoryComponent,
    ProductPromotionsComponent,
    PromotionManagementComponent
  ],
  templateUrl: './product-management.component.html',
  styleUrls: ['./product-management.component.css']
})
export class ProductManagementComponent implements OnInit, OnDestroy {
  // Estado principal
  products: Product[] = [];
  categories: Category[] = [];
  allColors: Color[] = [];
  allSizes: Size[] = [];
  loading = false;
  formModalVisible = false;
  detailsModalVisible = false;

  // Producto seleccionado
  selectedProduct: Product | null = null;

  // Filtrado y paginación
  filterForm!: FormGroup;
  searchChangeSubject = new BehaviorSubject<string>('');
  total = 0;
  pageSize = 10;
  pageIndex = 1;

  // Control de suscripciones
  private destroy$ = new Subject<void>();

  // Control de visibilidad de drawers y modales
  showStatsDrawer = false;
  showInventoryDrawer = false;
  showPromotionsDrawer = false;

  // Control de acciones
  isEditMode = false;

  // 🚀 Control de operaciones optimistas
  private pendingOperations = new Map<string, OptimisticProductOperation>();
  private originalProductsBackup: Product[] = [];

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private colorService: ColorService,
    private sizeService: SizeService,
    private stockUpdateService: StockUpdateService,
    private categoryService: CategoryService,
    private cacheService: CacheService,
    private message: NzMessageService,
    private modal: NzModalService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) { }

  ngOnInit(): void {
    this.initFilterForm();
    this.loadCategories();
    this.loadColors();
    this.loadSizes();

    // Suscribirse a cambios de caché
    this.cacheService.getInvalidationNotifier('products')
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(1000), // 🆕 Evitar spam de recargas
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.loadProducts();
      });

    // Configurar búsqueda con debounce
    this.searchChangeSubject.pipe(
      takeUntil(this.destroy$),
      debounceTime(500)
    ).subscribe(() => {
      this.resetPagination();
      this.loadProducts();
    });

    // Carga inicial
    this.loadProducts();
    this.subscribeToStockUpdates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private subscribeToStockUpdates(): void {
    this.stockUpdateService.onStockUpdate()
      .pipe(takeUntil(this.destroy$))
      .subscribe(update => {
        this.handleStockUpdate(update);
      });
  }

  private handleStockUpdate(update: StockUpdate): void {
    console.log('📦 Actualizando stock en management:', update);

    const productIndex = this.products.findIndex(p => p.id === update.productId);

    if (productIndex !== -1) {
      // Actualizar solo el producto afectado
      this.products[productIndex] = {
        ...this.products[productIndex],
        totalStock: Math.max(0, this.products[productIndex].totalStock + update.stockChange)
      };

      // Actualizar producto seleccionado si coincide
      if (this.selectedProduct?.id === update.productId) {
        this.selectedProduct = { ...this.products[productIndex] };
      }

      this.cdr.detectChanges();
    }
  }

  initFilterForm(): void {
    this.filterForm = this.fb.group({
      searchQuery: [''],
      categories: [[]],
      minPrice: [null],
      maxPrice: [null],
      sortBy: ['newest']
    });

    this.filterForm.valueChanges.pipe(
      takeUntil(this.destroy$),
      debounceTime(500)
    ).subscribe(() => {
      this.resetPagination();
      this.loadProducts();
    });
  }

  loadColors(): void {
    this.colorService.getColors()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (colors) => {
          this.allColors = colors;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error al cargar colores:', error);
        }
      });
  }

  loadSizes(): void {
    this.sizeService.getSizes()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (sizes) => {
          this.allSizes = sizes;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error al cargar tallas:', error);
        }
      });
  }

  // ✅ MODIFICAR en ProductManagementComponent
  // ✅ MEJORAR loadProducts con validaciones
  loadProducts(): void {
    this.loading = true;
    this.originalProductsBackup = [...this.products];

    const filterValues = this.filterForm.value;

    // ✅ VALIDAR Y LIMPIAR FILTROS
    const filter = {
      searchQuery: filterValues.searchQuery?.trim() || '',
      categories: Array.isArray(filterValues.categories) ? filterValues.categories : [],
      minPrice: typeof filterValues.minPrice === 'number' ? filterValues.minPrice : null,
      maxPrice: typeof filterValues.maxPrice === 'number' ? filterValues.maxPrice : null,
      sortBy: filterValues.sortBy || 'newest',
      page: this.pageIndex,
      limit: this.pageSize
    };

    console.log('🔍 [MANAGEMENT] Filtros aplicados:', filter);

    // Resto del código igual...
    const products$ = filter.searchQuery
      ? this.productService.searchProducts(filter.searchQuery)
      : this.productService.forceReloadProducts();

    products$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (products) => {
          console.log(`📦 [MANAGEMENT] Productos recibidos: ${products.length}`);

          const validProducts = this.validateFilterData(products);
          const filteredProducts = this.applyClientSideFilters(validProducts, filter);

          console.log(`📊 [MANAGEMENT] Productos después de filtros: ${filteredProducts.length}`);

          this.products = filteredProducts;
          this.total = this.products.length;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ [MANAGEMENT] Error al cargar productos:', error);
          this.message.error('Error al cargar productos: ' + (error.message || 'Error desconocido'));

          this.products = this.originalProductsBackup;
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
  }

  reloadProducts(): void {

    // Limpiar caché
    this.cacheService.invalidate('products');
    this.cacheService.invalidatePattern('products_');

    // Recargar
    this.loadProducts();
  }

  // ✅ AGREGAR método de validación
  private validateFilterData(products: Product[]): Product[] {
    return products.filter(product => {
      // Validaciones básicas
      if (!product || !product.id || !product.name) {
        console.warn('⚠️ [MANAGEMENT] Producto inválido encontrado:', product);
        return false;
      }

      // Asegurar arrays
      if (!Array.isArray(product.colors)) {
        product.colors = [];
      }
      if (!Array.isArray(product.sizes)) {
        product.sizes = [];
      }
      if (!Array.isArray(product.variants)) {
        product.variants = [];
      }
      if (!Array.isArray(product.categories)) {
        product.categories = [];
      }

      return true;
    });
  }

  loadCategories(): void {
    this.categoryService.getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.message.error('Error al cargar categorías: ' + (error.message || 'Error desconocido'));
        }
      });
  }

  getCategoryName(categoryId: string): string {
    const category = this.categories.find(c => c.id === categoryId);
    return category?.name || 'Sin categoría';
  }

  // Filtrado en cliente
  // ✅ AGREGAR este método mejorado
  private applyClientSideFilters(products: Product[], filter: any): Product[] {
    let filtered = [...products];

    // ✅ BÚSQUEDA POR TEXTO
    if (filter.searchQuery && filter.searchQuery.trim()) {
      const query = filter.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        p.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // ✅ FILTRO DE CATEGORÍAS CORREGIDO (igual que el otro componente)
    if (filter.categories && filter.categories.length > 0) {
      console.log('🔍 [MANAGEMENT] Aplicando filtro de categorías:', filter.categories);

      filtered = filtered.filter(p => {
        // Verificar campo singular (legacy)
        if (p.category && filter.categories.includes(p.category)) {
          console.log(`✅ [MANAGEMENT] ${p.name} coincide con categoría singular: ${p.category}`);
          return true;
        }

        // Verificar campo plural (múltiples categorías)
        if (p.categories && p.categories.length > 0) {
          const hasMatch = p.categories.some(productCategory =>
            filter.categories.includes(productCategory)
          );

          if (hasMatch) {
            const matchingCategories = p.categories.filter(cat => filter.categories.includes(cat));
            console.log(`✅ [MANAGEMENT] ${p.name} coincide con categorías: ${matchingCategories.join(', ')}`);
            return true;
          }
        }

        return false;
      });

      console.log(`📊 [MANAGEMENT] Productos después de filtro categoría: ${filtered.length}`);
    }

    // ✅ FILTRO DE PRECIO
    if (filter.minPrice !== null && filter.minPrice !== undefined) {
      filtered = filtered.filter(p => {
        const price = p.currentPrice || p.price;
        return price >= filter.minPrice;
      });
    }

    if (filter.maxPrice !== null && filter.maxPrice !== undefined) {
      filtered = filtered.filter(p => {
        const price = p.currentPrice || p.price;
        return price <= filter.maxPrice;
      });
    }

    // ✅ ORDENAMIENTO
    if (filter.sortBy) {
      filtered = this.sortProducts(filtered, filter.sortBy);
    }

    return filtered;
  }

  // ✅ AGREGAR método de ordenamiento
  private sortProducts(products: Product[], sortBy: string): Product[] {
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

  // 🚀 ==================== MANEJO OPTIMISTA DE EVENTOS DE FORMULARIO ====================

  onFormSubmitted(event: {
    success: boolean,
    action: string,
    productId: string,
    requiresReload?: boolean,
    optimisticUpdate?: Product
  }): void {

    if (event.success) {
      this.closeModals();

      // 🎯 INVALIDACIÓN SELECTIVA (en lugar de agresiva)
      if (event.action === 'create') {
        // Para creación, solo invalidar caché general
        this.cacheService.invalidate('products');

        if (event.optimisticUpdate) {
          this.createProductOptimistically(event.optimisticUpdate);
        } else {
          // Recargar solo si no hay actualización optimista
          setTimeout(() => this.loadProducts(), 500);
        }

      } else if (event.action === 'update') {
        // Para actualización, invalidar caché específico
        this.cacheService.invalidate('products');
        this.cacheService.invalidate(`products_${event.productId}`);

        if (event.optimisticUpdate) {
          this.updateProductOptimistically(event.productId, event.optimisticUpdate);
        } else {
          // Actualizar producto específico
          this.refreshSingleProduct(event.productId);
        }
      }

      // Verificación en segundo plano
      setTimeout(() => {
        this.verifyProductUpdate(event.productId);
      }, 2000);

    } else {
      console.error('❌ [MANAGEMENT] Error en operación de producto:', event);
      this.closeModals();
    }
  }

  private refreshSingleProduct(productId: string): void {

    this.productService.getProductById(productId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updatedProduct) => {
          if (updatedProduct) {
            const index = this.products.findIndex(p => p.id === productId);
            if (index !== -1) {
              this.products[index] = updatedProduct;

              if (this.selectedProduct && this.selectedProduct.id === productId) {
                this.selectedProduct = updatedProduct;
              }

              this.cdr.detectChanges();
            }
          }
        },
        error: (error) => {
          console.error('❌ [MANAGEMENT] Error al refrescar producto individual:', error);
        }
      });
  }

  private forceProductsReload(): void {

    // Limpiar solo caché de productos (no todo)
    this.cacheService.invalidate('products');

    this.loading = true;
    this.cdr.detectChanges();

    this.loadProducts();
  }
  // 3️⃣ Método para verificar actualización de producto específico
  private verifyProductUpdate(productId: string): void {

    // Solo invalidar caché específico del producto
    this.cacheService.invalidate(`products_${productId}`);

    this.productService.getProductById(productId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updatedProduct) => {
          if (updatedProduct) {
            const index = this.products.findIndex(p => p.id === productId);
            if (index !== -1) {
              const hasChanges = this.hasSignificantProductChanges(
                this.products[index],
                updatedProduct
              );

              if (hasChanges) {
                console.log('🔄 [MANAGEMENT] Aplicando cambios verificados para:', productId);
                this.products[index] = updatedProduct;

                if (this.selectedProduct && this.selectedProduct.id === productId) {
                  this.selectedProduct = updatedProduct;
                }

                this.cdr.detectChanges();
              } else {
                console.log('✅ [MANAGEMENT] Producto ya está actualizado:', productId);
              }
            }
          }
        },
        error: (error) => {
          console.error('❌ [MANAGEMENT] Error al verificar producto:', error);
        }
      });
  }

  // 4️⃣ Método para detectar cambios significativos
  private hasSignificantProductChanges(oldProduct: Product, newProduct: Product): boolean {
    return (
      oldProduct.name !== newProduct.name ||
      oldProduct.price !== newProduct.price ||
      oldProduct.currentPrice !== newProduct.currentPrice ||
      oldProduct.totalStock !== newProduct.totalStock ||
      oldProduct.discountPercentage !== newProduct.discountPercentage ||
      oldProduct.imageUrl !== newProduct.imageUrl ||
      (oldProduct.variants?.length || 0) !== (newProduct.variants?.length || 0)
    );
  }

  /**
   * 🚀 Aplica actualización optimista basada en el evento del formulario
   */
  private applyOptimisticProductUpdate(params: {
    action: string,
    productId: string,
    optimisticUpdate: Product
  }): void {
    const { action, productId, optimisticUpdate } = params;

    if (action === 'create') {
      // ➕ CREAR PRODUCTO OPTIMÍSTICAMENTE
      this.createProductOptimistically(optimisticUpdate);
    } else if (action === 'update') {
      // 🔄 ACTUALIZAR PRODUCTO OPTIMÍSTICAMENTE
      this.updateProductOptimistically(productId, optimisticUpdate);
    }
  }

  /**
   * ➕ Crea un producto optimísticamente en la lista
   */
  private createProductOptimistically(newProduct: Product): void {

    // Registrar operación pendiente
    this.pendingOperations.set(newProduct.id, {
      type: 'create',
      productId: newProduct.id,
      newProduct
    });

    // Agregar al inicio (productos más recientes primero)
    this.products = [newProduct, ...this.products];
    this.total = this.products.length;

    this.cdr.detectChanges();
    console.log('✅ [MANAGEMENT] Producto creado optimísticamente');
  }

  /**
   * 🔄 Actualiza un producto optimísticamente en la lista
   */
  private updateProductOptimistically(productId: string, updatedProduct: Product): void {

    const productIndex = this.products.findIndex(p => p.id === productId);

    if (productIndex === -1) {
      console.warn('⚠️ [MANAGEMENT] Producto no encontrado para actualización optimista');
      return;
    }

    // Crear backup
    const backup: ProductBackup = {
      originalProduct: { ...this.products[productIndex] },
      index: productIndex,
      timestamp: Date.now()
    };

    // Registrar operación
    this.pendingOperations.set(productId, {
      type: 'update',
      productId,
      backup,
      newProduct: updatedProduct
    });

    // Aplicar cambios
    this.products[productIndex] = { ...updatedProduct };

    if (this.selectedProduct && this.selectedProduct.id === productId) {
      this.selectedProduct = { ...updatedProduct };
    }

    this.cdr.detectChanges();
  }


  /**
   * 🗑️ Elimina un producto optimísticamente
   */
  private deleteProductOptimistically(productId: string): void {
    const productIndex = this.products.findIndex(p => p.id === productId);

    if (productIndex === -1) {
      console.warn(`⚠️ [MANAGEMENT] Producto no encontrado para eliminación optimista: ${productId}`);
      return;
    }

    // Crear backup del producto original
    const backup: ProductBackup = {
      originalProduct: { ...this.products[productIndex] },
      index: productIndex,
      timestamp: Date.now()
    };

    // Registrar operación pendiente
    this.pendingOperations.set(productId, {
      type: 'delete',
      productId,
      backup
    });

    // Eliminar de la lista inmediatamente
    this.products.splice(productIndex, 1);
    this.total = this.products.length;

    this.cdr.detectChanges();
  }

  /**
   * ✅ Confirma una operación optimista (el servidor confirmó los cambios)
   */
  private confirmOptimisticOperation(productId: string): void {
    const operation = this.pendingOperations.get(productId);

    if (operation) {

      this.pendingOperations.delete(productId);
    }
  }

  /**
   * 🔄 Revierte una operación optimista (el servidor rechazó los cambios)
   */
  private rollbackOptimisticOperation(productId: string): void {
    const operation = this.pendingOperations.get(productId);

    if (!operation) {
      console.warn(`⚠️ [MANAGEMENT] No se encontró operación para rollback: ${productId}`);
      return;
    }

    switch (operation.type) {
      case 'create':
        // Remover producto que se agregó optimísticamente
        this.products = this.products.filter(p => p.id !== productId);
        this.total = this.products.length;
        break;

      case 'update':
        if (operation.backup) {
          // Restaurar producto original
          this.products[operation.backup.index] = { ...operation.backup.originalProduct };

          // Actualizar producto seleccionado si es necesario
          if (this.selectedProduct && this.selectedProduct.id === productId) {
            this.selectedProduct = { ...operation.backup.originalProduct };
          }
        }
        break;

      case 'delete':
        if (operation.backup) {
          // Restaurar producto en su posición original
          this.products.splice(operation.backup.index, 0, { ...operation.backup.originalProduct });
          this.total = this.products.length;
        }
        break;
    }

    this.pendingOperations.delete(productId);
    this.cdr.detectChanges();
  }

  // Método para verificar si existe el método invalidateProductCache en el servicio
  private invalidateProductCache(productId: string): void {
    // Si el método existe en tu CacheService, úsalo
    if (typeof this.cacheService.invalidateProductCache === 'function') {
      this.cacheService.invalidateProductCache(productId);
    } else {
      // Si no existe, usar invalidación manual
      this.cacheService.invalidate(`products_${productId}`);
      this.cacheService.invalidate(`products_complete_${productId}`);
    }
  }

  /**
   * 🔄 Método mejorado para refrescar un producto específico
   */
  refreshProduct(productId: string): void {
    console.log('🔄 [MANAGEMENT] Refrescando producto:', productId);

    this.invalidateProductCache(productId);

    // Confirmar operación pendiente si existe
    if (this.pendingOperations.has(productId)) {
      this.confirmOptimisticOperation(productId);
    }

    // Si existe forceRefreshProduct, úsalo; si no, usar getProductById
    const refreshObservable = typeof this.productService.forceRefreshProduct === 'function'
      ? this.productService.forceRefreshProduct(productId)
      : this.productService.getProductById(productId);

    refreshObservable
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updatedProduct) => {
          if (updatedProduct) {
            const index = this.products.findIndex(p => p.id === productId);
            if (index !== -1) {
              this.products[index] = updatedProduct;

              if (this.selectedProduct && this.selectedProduct.id === productId) {
                this.selectedProduct = updatedProduct;
              }

              this.cdr.detectChanges();
              console.log('✅ [MANAGEMENT] Producto refrescado exitosamente');
            } else {
              this.loadProducts();
            }
          } else {
            console.warn('⚠️ [MANAGEMENT] Producto no encontrado en servidor');
          }
        },
        error: (error) => {
          console.error('❌ [MANAGEMENT] Error al refrescar producto:', error);
          this.rollbackOptimisticOperation(productId);
          this.loadProducts();
        }
      });
  }

  // ==================== ACCIONES DE PRODUCTOS ====================

  openCreateModal(): void {
    this.isEditMode = false;
    this.selectedProduct = null;
    this.formModalVisible = true;
  }

  openEditModal(product: Product): void {

    // Abrir modal inmediatamente (UX mejorado)
    this.isEditMode = true;
    this.selectedProduct = { ...product }; // Clonar para evitar referencias
    this.formModalVisible = true;

    // Forzar detección de cambios inmediata
    this.cdr.detectChanges();

  }


  openDetailsModal(product: Product): void {
    this.selectedProduct = product;
    this.detailsModalVisible = true;
  }

  closeModals(): void {
    this.formModalVisible = false;
    this.detailsModalVisible = false;
    this.selectedProduct = null;
    this.isEditMode = false;
    this.cdr.detectChanges();
  }

  resetSelection(): void {
    this.selectedProduct = null;
  }

  onSearch(): void {
    this.searchChangeSubject.next(this.filterForm.get('searchQuery')?.value);
  }

  resetPagination(): void {
    this.pageIndex = 1;
  }

  onQueryParamsChange(params: NzTableQueryParams): void {
    const { pageSize, pageIndex } = params;
    this.pageSize = pageSize;
    this.pageIndex = pageIndex;
    this.loadProducts();
  }

  // ==================== DRAWERS/PANELES ====================

  openStatsDrawer(product: Product): void {
    this.selectedProduct = product;
    this.showStatsDrawer = true;
  }

  openInventoryDrawer(product: Product): void {
    this.selectedProduct = product;
    this.showInventoryDrawer = true;
  }

  openPromotionsDrawer(product: Product): void {
    this.selectedProduct = product;
    this.showPromotionsDrawer = true;
  }

  closeDrawers(): void {
    this.showStatsDrawer = false;
    this.showInventoryDrawer = false;
    this.showPromotionsDrawer = false;
  }

  // 🚀 ==================== MANEJO DE CAMBIOS DESDE DRAWERS ====================

  /**
   * 🔄 Maneja cambios de inventario desde el drawer
   */
  onInventoryChange(event: { productId: string, updatedProduct?: Product, stockChange?: number }): void {

    // Invalidar solo caché específico
    this.cacheService.invalidate(`products_${event.productId}`);

    const productIndex = this.products.findIndex(p => p.id === event.productId);

    if (productIndex === -1) {
      console.warn('⚠️ [MANAGEMENT] Producto no encontrado para actualización de inventario');
      this.refreshSingleProduct(event.productId);
      return;
    }

    if (event.updatedProduct) {
      // Actualización completa del producto
      this.products[productIndex] = { ...event.updatedProduct };

      if (this.selectedProduct && this.selectedProduct.id === event.productId) {
        this.selectedProduct = { ...event.updatedProduct };
      }
    } else if (typeof event.stockChange === 'number') {
      // Solo actualización de stock
      const currentStock = this.products[productIndex].totalStock || 0;
      const newStock = Math.max(0, currentStock + event.stockChange);

      this.products[productIndex] = {
        ...this.products[productIndex],
        totalStock: newStock
      };

      if (this.selectedProduct && this.selectedProduct.id === event.productId) {
        this.selectedProduct = {
          ...this.selectedProduct,
          totalStock: newStock
        };
      }
    }

    if (typeof event.stockChange === 'number') {
      const stockUpdate: StockUpdate = {
        productId: event.productId,
        variantId: 'unknown', // Si tienes el variantId, úsalo
        stockChange: event.stockChange,
        newStock: (this.products.find(p => p.id === event.productId)?.totalStock || 0) + event.stockChange,
        timestamp: new Date(),
        source: 'admin',
        metadata: {
          userAction: 'inventory_management'
        }
      };

      this.stockUpdateService.notifyStockChange(stockUpdate);
    }

    this.cdr.detectChanges();

    // Verificación en segundo plano
    setTimeout(() => {
      this.verifyProductUpdate(event.productId);
    }, 3000);
  }

  /**
   * 🏷️ Maneja cambios de promociones desde el drawer
   */
  // 6️⃣ Mejorar manejo de eventos de promociones
  onPromotionChange(event: { productId: string, updatedProduct?: Product }): void {

    // Invalidar cachés relevantes
    this.cacheService.invalidate(`products_${event.productId}`);
    this.cacheService.invalidate('products_discounted');

    if (!event.updatedProduct) {
      this.refreshSingleProduct(event.productId);
      return;
    }

    const productIndex = this.products.findIndex(p => p.id === event.productId);

    if (productIndex === -1) {
      console.warn('⚠️ [MANAGEMENT] Producto no encontrado para actualización de promoción');
      this.refreshSingleProduct(event.productId);
      return;
    }

    // Actualizar producto
    this.products[productIndex] = { ...event.updatedProduct };

    if (this.selectedProduct && this.selectedProduct.id === event.productId) {
      this.selectedProduct = { ...event.updatedProduct };
    }

    this.cdr.detectChanges();

    // Verificación en segundo plano
    setTimeout(() => {
      this.verifyProductUpdate(event.productId);
    }, 3000);
  }



  /**
   * 📊 Maneja cambios de estadísticas desde el drawer
   */
  onStatsChange(event: { productId: string, updatedProduct?: Product }): void {

    if (!event.updatedProduct) return;

    const productIndex = this.products.findIndex(p => p.id === event.productId);

    if (productIndex === -1) {
      console.warn(`⚠️ [MANAGEMENT] Producto no encontrado para actualización de estadísticas: ${event.productId}`);
      return;
    }

    // Actualizar producto en la lista
    this.products[productIndex] = { ...event.updatedProduct };

    // Actualizar producto seleccionado si es el mismo
    if (this.selectedProduct && this.selectedProduct.id === event.productId) {
      this.selectedProduct = { ...event.updatedProduct };
    }

    this.cdr.detectChanges();
  }

  // 🚀 ==================== ELIMINACIÓN OPTIMISTA ====================

  deleteProduct(id: string): void {
    this.modal.confirm({
      nzTitle: '¿Está seguro de eliminar este producto?',
      nzContent: 'Esta acción no se puede deshacer.',
      nzOkText: 'Eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        console.log('🗑️ [MANAGEMENT] Eliminando producto:', id);

        // Eliminación optimista
        this.deleteProductOptimistically(id);

        // Operación en servidor
        this.productService.deleteProduct(id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.message.success('Producto eliminado correctamente');
              this.confirmOptimisticOperation(id);
              console.log('✅ [MANAGEMENT] Producto eliminado exitosamente');
            },
            error: (error) => {
              console.error('❌ [MANAGEMENT] Error al eliminar producto:', error);
              this.message.error('Error al eliminar producto');
              this.rollbackOptimisticOperation(id);
            }
          });
      }
    });
  }

  // ==================== UTILIDADES ====================

  hasDiscount(product: Product): boolean {
    return !!product.discountPercentage && product.discountPercentage > 0;
  }

  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'assets/images/product-placeholder.png';
      imgElement.classList.add('error-image');
    }
  }

  /**
   * 🧹 Limpia operaciones pendientes antiguas (opcional)
   */
  private cleanupOldPendingOperations(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutos

    this.pendingOperations.forEach((operation, productId) => {
      if (operation.backup && (now - operation.backup.timestamp) > maxAge) {
        this.pendingOperations.delete(productId);
      }
    });
  }
}