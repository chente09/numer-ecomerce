import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, Subject, debounceTime, finalize, takeUntil } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';

// Servicios
import { ProductService } from '../../../services/admin/product/product.service';
import { ColorService } from '../../../services/admin/color/color.service';
import { SizeService } from '../../../services/admin/size/size.service';
import { ProductPriceService } from '../../../services/admin/price/product-price.service';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { CacheService } from '../../../services/admin/cache/cache.service';

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
    private productPriceService: ProductPriceService,
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
      .pipe(takeUntil(this.destroy$))
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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  loadProducts(): void {

    // 🧹 LIMPIEZA PREVENTIVA DE CACHÉ
    this.cacheService.clearCache();

    this.loading = true;

    // Mantener backup antes de cargar nuevos datos
    this.originalProductsBackup = [...this.products];

    const filterValues = this.filterForm.value;
    const filter = {
      searchQuery: filterValues.searchQuery,
      categories: filterValues.categories,
      minPrice: filterValues.minPrice,
      maxPrice: filterValues.maxPrice,
      sortBy: filterValues.sortBy,
      page: this.pageIndex,
      limit: this.pageSize
    };

    if (filter.searchQuery) {
      this.productService.searchProducts(filter.searchQuery)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (products) => {
            this.products = this.applyClientSideFilters(products, filter);
            this.total = this.products.length;
            this.loading = false;
            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error('❌ [MANAGEMENT] Error al buscar productos:', error);
            this.message.error('Error al buscar productos: ' + (error.message || 'Error desconocido'));

            // ROLLBACK: Restaurar productos anteriores en caso de error
            this.products = this.originalProductsBackup;
            this.loading = false;
            this.cdr.detectChanges();
          }
        });
    } else {
      this.productService.getProducts()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (products) => {
            const filteredProducts = this.applyClientSideFilters(products, filter);
            this.products = filteredProducts;
            this.total = this.products.length;
            this.loading = false;

            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error('❌ [MANAGEMENT] Error al cargar productos:', error);
            this.message.error('Error al cargar productos: ' + (error.message || 'Error desconocido'));

            // ROLLBACK: Restaurar productos anteriores en caso de error
            this.products = this.originalProductsBackup;
            this.loading = false;
            this.cdr.detectChanges();
          }
        });
    }
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
  applyClientSideFilters(products: Product[], filter: any): Product[] {
    let result = [...products];

    if (filter.categories && filter.categories.length > 0) {
      result = result.filter(p => filter.categories.includes(p.category));
    }

    if (filter.minPrice !== null) {
      result = result.filter(p => (p.currentPrice || p.price) >= filter.minPrice);
    }

    if (filter.maxPrice !== null) {
      result = result.filter(p => (p.currentPrice || p.price) <= filter.maxPrice);
    }

    if (filter.sortBy) {
      switch (filter.sortBy) {
        case 'newest':
          result.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
          break;
        case 'price_asc':
          result.sort((a, b) => (a.currentPrice || a.price) - (b.currentPrice || b.price));
          break;
        case 'price_desc':
          result.sort((a, b) => (b.currentPrice || b.price) - (a.currentPrice || a.price));
          break;
        case 'name_asc':
          result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          break;
        case 'name_desc':
          result.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
          break;
        case 'stock_asc':
          result.sort((a, b) => (a.totalStock || 0) - (b.totalStock || 0));
          break;
        case 'stock_desc':
          result.sort((a, b) => (b.totalStock || 0) - (a.totalStock || 0));
          break;
      }
    }

    const startIndex = (filter.page - 1) * filter.limit;
    const endIndex = startIndex + filter.limit;

    return result.slice(startIndex, endIndex);
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

      // Invalidar caché principal de productos
      this.cacheService.invalidate('products');
      this.cacheService.invalidate(`products_${event.productId}`);
      this.cacheService.invalidate(`products_complete_${event.productId}`);
      this.cacheService.invalidate(`product_variants_product_${event.productId}`);

      // Invalidar cachés de variantes e inventario
      this.cacheService.invalidate('inventory_summary');
      this.cacheService.invalidate('low_stock_products');

      // Forzar limpieza completa si es necesario
      if (event.action === 'create' || event.requiresReload) {
        this.cacheService.invalidateAll();
      }

      if (event.optimisticUpdate) {
        // 🚀 ACTUALIZACIÓN OPTIMISTA INMEDIATA
        this.applyOptimisticProductUpdate({
          action: event.action,
          productId: event.productId,
          optimisticUpdate: event.optimisticUpdate
        });

        // 📡 FORZAR RECARGA DESPUÉS DE OPTIMISTA (DOBLE VERIFICACIÓN)
        setTimeout(() => {
          this.verifyProductUpdate(event.productId);
        }, 1000);

      } else {
        setTimeout(() => {
          this.forceProductsReload();
        }, 300);
      }

    } else {
      console.error('❌ [MANAGEMENT] Error en operación de producto:', event);
      this.closeModals();
    }
  }

  private forceProductsReload(): void {

    // Limpiar completamente el caché
    this.cacheService.clearCache();

    // Marcar como cargando
    this.loading = true;
    this.cdr.detectChanges();

    // Recargar desde servidor
    this.loadProducts();
  }

  // 3️⃣ Método para verificar actualización de producto específico
  private verifyProductUpdate(productId: string): void {

    // Forzar invalidación del producto específico
    this.cacheService.invalidate(`products_${productId}`);
    this.cacheService.invalidate(`products_complete_${productId}`);

    // Obtener producto actualizado directamente del servidor
    this.productService.getProductById(productId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updatedProduct) => {
          if (updatedProduct) {
            const index = this.products.findIndex(p => p.id === productId);
            if (index !== -1) {
              // Comparar si hay diferencias significativas
              const hasSignificantChanges = this.hasSignificantProductChanges(
                this.products[index],
                updatedProduct
              );

              if (hasSignificantChanges) {
                this.products[index] = updatedProduct;

                if (this.selectedProduct && this.selectedProduct.id === productId) {
                  this.selectedProduct = updatedProduct;
                }

                this.cdr.detectChanges();
              } else {
                console.log('✅ [MANAGEMENT] Producto ya está actualizado correctamente');
              }
            }
          }
        },
        error: (error) => {
          console.error('❌ [MANAGEMENT] Error al verificar producto:', error);
          // En caso de error, hacer recarga completa
          this.forceProductsReload();
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

    // Agregar al inicio de la lista (productos más recientes primero)
    this.products = [newProduct, ...this.products];
    this.total = this.products.length;


    this.cdr.detectChanges();
  }

  /**
   * 🔄 Actualiza un producto optimísticamente en la lista
   */
  private updateProductOptimistically(productId: string, updatedProduct: Product): void {
    const productIndex = this.products.findIndex(p => p.id === productId);

    if (productIndex === -1) {
      console.warn(`⚠️ [MANAGEMENT] Producto no encontrado para actualización optimista: ${productId}`);
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
      type: 'update',
      productId,
      backup,
      newProduct: updatedProduct
    });

    // Aplicar actualización inmediatamente
    this.products[productIndex] = { ...updatedProduct };


    // Actualizar producto seleccionado si es el mismo que se editó
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

  /**
   * 🔄 Método mejorado para refrescar un producto específico
   */
  refreshProduct(productId: string): void {
  
  // 🧹 INVALIDACIÓN AGRESIVA INMEDIATA
  this.cacheService.invalidateProductCache(productId);
  
  // Si hay una operación pendiente, confirmarla primero
  if (this.pendingOperations.has(productId)) {
    this.confirmOptimisticOperation(productId);
  }
  
  // 🔄 USAR MÉTODO SIN CACHÉ DEL SERVICIO
  this.productService.forceRefreshProduct(productId)
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
          } else {
            this.forceProductsReload();
          }
        } else {
          console.warn('⚠️ [MANAGEMENT] Producto no encontrado en servidor');
        }
      },
      error: (error) => {
        console.error('❌ [MANAGEMENT] Error al refrescar producto:', error);
        // En caso de error, hacer rollback si hay operación pendiente
        this.rollbackOptimisticOperation(productId);
        
        // Como último recurso, recargar todos los productos
        this.forceProductsReload();
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
    this.isEditMode = true;
    this.selectedProduct = product;
    this.formModalVisible = true;
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

    // 🧹 INVALIDAR CACHÉ INMEDIATAMENTE
    this.cacheService.invalidate(`products_${event.productId}`);
    this.cacheService.invalidate(`products_complete_${event.productId}`);
    this.cacheService.invalidate(`product_variants_product_${event.productId}`);

    const productIndex = this.products.findIndex(p => p.id === event.productId);

    if (productIndex === -1) {
      console.warn(`⚠️ [MANAGEMENT] Producto no encontrado para actualización de inventario: ${event.productId}`);
      // Si no se encuentra, forzar recarga completa
      this.forceProductsReload();
      return;
    }

    if (event.updatedProduct) {

      this.products[productIndex] = { ...event.updatedProduct };

      // Actualizar producto seleccionado si es el mismo
      if (this.selectedProduct && this.selectedProduct.id === event.productId) {
        this.selectedProduct = { ...event.updatedProduct };
      }
    } else if (event.stockChange !== undefined) {
      // 📊 ACTUALIZACIÓN SOLO DE STOCK
      const oldStock = this.products[productIndex].totalStock || 0;
      const newStock = Math.max(0, oldStock + event.stockChange);

      this.products[productIndex] = {
        ...this.products[productIndex],
        totalStock: newStock
      };

      // Actualizar producto seleccionado si es el mismo
      if (this.selectedProduct && this.selectedProduct.id === event.productId) {
        this.selectedProduct = {
          ...this.selectedProduct,
          totalStock: newStock
        };
      }
    }
    // 🔄 VERIFICACIÓN ADICIONAL DESPUÉS DE UN TIEMPO
    setTimeout(() => {
      this.verifyProductUpdate(event.productId);
    }, 2000);

    // Forzar detección de cambios
    this.cdr.detectChanges();
  }

  /**
   * 🏷️ Maneja cambios de promociones desde el drawer
   */
  // 6️⃣ Mejorar manejo de eventos de promociones
  onPromotionChange(event: { productId: string, updatedProduct?: Product }): void {

    // 🧹 INVALIDAR CACHÉ INMEDIATAMENTE
    this.cacheService.invalidate(`products_${event.productId}`);
    this.cacheService.invalidate(`products_complete_${event.productId}`);
    this.cacheService.invalidate('products_discounted');

    if (!event.updatedProduct) {
      // Si no hay producto actualizado, verificar desde servidor
      this.verifyProductUpdate(event.productId);
      return;
    }

    const productIndex = this.products.findIndex(p => p.id === event.productId);

    if (productIndex === -1) {
      console.warn(`⚠️ [MANAGEMENT] Producto no encontrado para actualización de promoción: ${event.productId}`);
      this.forceProductsReload();
      return;
    }

    // Actualizar producto en la lista
    this.products[productIndex] = { ...event.updatedProduct };

    // Actualizar producto seleccionado si es el mismo
    if (this.selectedProduct && this.selectedProduct.id === event.productId) {
      this.selectedProduct = { ...event.updatedProduct };
    }

    // 🔄 VERIFICACIÓN ADICIONAL
    setTimeout(() => {
      this.verifyProductUpdate(event.productId);
    }, 2000);

    this.cdr.detectChanges();
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
        // 🚀 ELIMINACIÓN OPTIMISTA INMEDIATA
        this.deleteProductOptimistically(id);

        this.loading = true;
        this.productService.deleteProduct(id)
          .pipe(
            takeUntil(this.destroy$),
            finalize(() => this.loading = false)
          )
          .subscribe({
            next: () => {
              this.message.success('Producto eliminado correctamente');
              // ✅ Confirmar eliminación optimista
              this.confirmOptimisticOperation(id);
            },
            error: (error) => {
              this.message.error('Error al eliminar producto: ' + (error.message || 'Error desconocido'));
              // 🔄 ROLLBACK: Restaurar producto eliminado
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