import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, Subject, debounceTime, distinctUntilChanged, takeUntil, filter, switchMap, take, of, from, forkJoin, firstValueFrom } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';

// Servicios
import { ProductService } from '../../../services/admin/product/product.service';
import { ProductPriceService } from '../../../services/admin/price/product-price.service';
import { ColorService } from '../../../services/admin/color/color.service';
import { SizeService } from '../../../services/admin/size/size.service';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { CacheService } from '../../../services/admin/cache/cache.service';
import { StockUpdateService, StockUpdate } from '../../../services/admin/stockUpdate/stock-update.service';
import { PromotionStateService, PromotionChangeEvent } from '../../../services/admin/promotionState/promotion-state.service';
import { AppliedPromotionsService } from '../../../services/admin/applied-promotions/applied-promotions.service';

// Modelos
import { Product, Color, Size, Promotion } from '../../../models/models';

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
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { PendingOperationsStore } from '../../../services/admin/shared/pending-operations-store';

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
    NzPaginationModule,
    // Componentes hijo
    ProductFormComponent,
    ProductStatsComponent,
    ProductInventoryComponent,
    ProductPromotionsComponent,
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
  private pendingOperations = new PendingOperationsStore<string, OptimisticProductOperation>();
  private originalProductsBackup: Product[] = [];

  private productPromotionsMap = new Map<string, Promotion[]>();
  private readonly COMPONENT_NAME = 'ProductManagementComponent';

  private resizeTimeout: any;

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
    private promotionStateService: PromotionStateService,
    private productPriceService: ProductPriceService,
    private appliedPromotionsService: AppliedPromotionsService,
  ) { }

  ngOnInit(): void {
    this.promotionStateService.registerComponent(this.COMPONENT_NAME);
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
    this.subscribeToPromotionChanges();
    this.subscribeToGlobalPromotionUpdates();
  }

  ngOnDestroy(): void {
    this.promotionStateService.unregisterComponent(this.COMPONENT_NAME);
    this.destroy$.next();
    this.destroy$.complete();
    // 🧹 Limpiar timeout de resize
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
  }

  // Método para escuchar actualizaciones globales
  private subscribeToGlobalPromotionUpdates(): void {
    this.promotionStateService.onGlobalUpdate()
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500) // Evitar spam de actualizaciones
      )
      .subscribe(globalUpdate => {
        console.log('📱 [MANAGEMENT] Actualización global recibida:', globalUpdate);
        this.handleGlobalPromotionUpdate(globalUpdate);
      });
  }

  // Manejar actualizaciones globales
  private handleGlobalPromotionUpdate(globalUpdate: any): void {
    const event = globalUpdate.data;

    console.log(`📱 [MANAGEMENT] Procesando evento: ${event.type} para promoción ${event.promotionId}`);

    switch (event.type) {
      case 'activated':
      case 'applied':
        this.handlePromotionActivated(event);
        break;

      case 'deactivated':
      case 'removed':
      case 'deleted':
        // Si es limpieza total (promotionId = 'ALL'), forzar recarga completa
        if (event.promotionId === 'ALL') {
          this.products = [];
          this.cdr.detectChanges();
          setTimeout(() => this.loadProducts(), 100);
        } else {
          this.handlePromotionDeactivated(event);
        }
        break;

      case 'updated':
        this.handlePromotionUpdated(event);
        break;

      default:
        console.log(`📱 [MANAGEMENT] Evento no manejado: ${event.type}`);
    }
  }

  // Manejar activación de promoción
  private handlePromotionActivated(event: any): void {
    if (event.affectedProducts && event.affectedProducts.length > 0) {
      // Actualizar productos específicos
      event.affectedProducts.forEach((productId: string) => {
        this.refreshSingleProduct(productId);
      });

      this.showPromotionNotification('activated', event.affectedProducts.length);
    } else {
      // Si no hay productos específicos, recargar todo
      this.loadProducts();
      this.showPromotionNotification('activated');
    }

    // 🆕 AGREGAR: Forzar actualización visual inmediata
    setTimeout(() => {
      this.cdr.detectChanges();
      this.cdr.markForCheck();
    }, 100);
  }

  // Manejar desactivación de promoción
  private handlePromotionDeactivated(event: any): void {
    if (event.affectedProducts && event.affectedProducts.length > 0) {
      // Actualizar productos específicos
      event.affectedProducts.forEach((productId: string) => {
        this.refreshSingleProduct(productId);
      });

      this.showPromotionNotification('deactivated', event.affectedProducts.length);
    } else {
      // Si no hay productos específicos, recargar todo
      this.loadProducts();
      this.showPromotionNotification('deactivated');
    }
  }

  // Manejar actualización de promoción
  private handlePromotionUpdated(event: any): void {
    if (event.affectedProducts && event.affectedProducts.length > 0) {
      event.affectedProducts.forEach((productId: string) => {
        this.refreshSingleProduct(productId);
      });

      this.showPromotionNotification('updated', event.affectedProducts.length);
    } else {
      this.loadProducts();
      this.showPromotionNotification('updated');
    }
  }

  // Mostrar notificaciones de promociones
  private showPromotionNotification(action: string, affectedCount?: number): void {
    const messages = {
      'activated': affectedCount
        ? `✅ Promoción activada en ${affectedCount} producto(s) - Vista actualizada`
        : '✅ Promoción activada - Vista actualizada',
      'deactivated': affectedCount
        ? `⚠️ Promoción desactivada en ${affectedCount} producto(s) - Vista actualizada`
        : '⚠️ Promoción desactivada - Vista actualizada',
      'updated': affectedCount
        ? `🔄 Promoción actualizada en ${affectedCount} producto(s) - Vista actualizada`
        : '🔄 Promoción actualizada - Vista actualizada'
    };

    const message = messages[action as keyof typeof messages] || 'Promoción actualizada';

    // Usar diferentes tipos de mensaje según la acción
    switch (action) {
      case 'activated':
        this.message.success(message);
        break;
      case 'deactivated':
        this.message.warning(message);
        break;
      default:
        this.message.info(message);
    }
  }

  private subscribeToStockUpdates(): void {
    this.stockUpdateService.onStockUpdate()
      .pipe(takeUntil(this.destroy$))
      .subscribe(update => {
        this.handleStockUpdate(update);
      });
  }

  private handleStockUpdate(update: StockUpdate): void {

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

  private subscribeToPromotionChanges(): void {
    // Escuchar cambios globales
    this.promotionStateService.onPromotionChange()
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        console.log('📢 [MANAGEMENT] Cambio de promoción detectado:', event);
        this.handlePromotionChange(event);
      });

    // Escuchar estado de productos con promociones
    this.promotionStateService.getProductsWithPromotions()
      .pipe(takeUntil(this.destroy$))
      .subscribe(promotionsMap => {
        this.productPromotionsMap = promotionsMap;
        this.updateProductsWithPromotionInfo();
      });
  }

  private handlePromotionChange(event: PromotionChangeEvent): void {
    switch (event.type) {
      case 'applied':
      case 'removed':
        if (event.productId) {
          this.refreshSingleProduct(event.productId);
        }
        break;

      case 'created':
      case 'updated':
      case 'deleted':
        // Recargar productos para aplicar cambios globales
        this.loadProducts();
        break;
    }
  }

  private updateProductsWithPromotionInfo(): void {
    // Actualizar la información de promociones en los productos
    this.products = this.products.map(product => {
      const promotions = this.productPromotionsMap.get(product.id) || [];
      return {
        ...product,
        promotions,
        hasActivePromotions: promotions.length > 0
      };
    });

    this.cdr.detectChanges();
  }

  // Método para verificar promociones activas
  hasActivePromotions(product: Product): boolean {
    // Verificar descuento directo en el producto
    if (product.discountPercentage && product.discountPercentage > 0) {
      return true;
    }

    // Verificar precio con descuento
    if (product.currentPrice && product.currentPrice < product.price) {
      return true;
    }

    return false;
  }

  /**
 * 🏷️ Verifica si el producto tiene promociones aplicadas en sus variantes
 */
  hasVariantPromotions(product: Product): boolean {
    if (!product.variants || product.variants.length === 0) {
      return false;
    }

    return product.variants.some(variant =>
      variant.promotionId ||
      (variant.discountedPrice && variant.originalPrice && variant.discountedPrice < variant.originalPrice)
    );
  }

  /**
   * 🔍 Obtiene información detallada de promociones en variantes
   */
  getVariantPromotionsInfo(product: Product): {
    count: number;
    hasPromotions: boolean;
    promotedVariants: string[];
  } {
    if (!product.variants || product.variants.length === 0) {
      return { count: 0, hasPromotions: false, promotedVariants: [] };
    }

    const promotedVariants = product.variants.filter(variant =>
      variant.promotionId ||
      (variant.discountedPrice && variant.originalPrice && variant.discountedPrice < variant.originalPrice)
    );

    return {
      count: promotedVariants.length,
      hasPromotions: promotedVariants.length > 0,
      promotedVariants: promotedVariants.map(v => {
        const colorName = v.colorName || 'Sin-Color';
        const sizeName = v.sizeName || 'Sin-Talla';
        return `${colorName}-${sizeName}`;
      })
    };
  }

  /**
 * Abre modal de gestión de promociones
 */
  openPromotionManagement(): void {
    // Importación dinámica del componente
    import('../promotion-management/promotion-management.component')
      .then(module => {
        const modalRef = this.modal.create({
          nzTitle: 'Gestión de Promociones y Cupones',
          nzContent: module.PromotionManagementComponent,
          nzWidth: '90%',
          nzStyle: { top: '20px' },
          nzBodyStyle: {
            padding: '16px',
            maxHeight: 'calc(100vh - 100px)',
            overflow: 'auto'
          },
          nzFooter: null,
          nzMaskClosable: false
        });

        modalRef.afterClose.subscribe((result) => {
          if (result && result.promotionChanged) {
            this.message.info('Recargando productos para mostrar cambios en promociones...');
            this.loadProducts();
          }
        });
      })
      .catch(error => {
        console.error('Error cargando componente de promociones:', error);
        this.message.error('Error al abrir gestión de promociones');
      });
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

  loadProducts(): void {
    this.loading = true;
    this.originalProductsBackup = [...this.products];

    const filterValues = this.filterForm.value;

    const filter = {
      searchQuery: filterValues.searchQuery?.trim() || '',
      categories: Array.isArray(filterValues.categories) ? filterValues.categories : [],
      minPrice: typeof filterValues.minPrice === 'number' ? filterValues.minPrice : null,
      maxPrice: typeof filterValues.maxPrice === 'number' ? filterValues.maxPrice : null,
      sortBy: filterValues.sortBy || 'newest',
      page: this.pageIndex,
      limit: this.pageSize
    };

    const products$ = this.productService.getProductsNoCache();

    products$
      .pipe(
        takeUntil(this.destroy$),
        switchMap(products => this.productPriceService.calculateDiscountedPrices(products)),
      )
      .subscribe({
        next: (enrichedProducts) => { // Ahora recibimos los productos completamente enriquecidos.

          const validProducts = this.validateFilterData(enrichedProducts);
          const filteredProducts = this.applyClientSideFilters(validProducts, filter);

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

    this.loading = true;
    this.cdr.detectChanges();

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

  /**
 * 🏷️ Obtiene el nombre de una categoría por su ID
 */
  getCategoryName(categoryId: string): string {
    if (!categoryId) return 'Sin categoría';

    const category = this.categories.find(c => c.id === categoryId);
    return category?.name || 'Categoría no encontrada';
  }

  /**
   * 🏷️ Obtiene los nombres de múltiples categorías para un producto específico
   */
  getCategoriesNames(product: Product): string {
    if (!product.categories || product.categories.length === 0) {
      return 'Sin categorías';
    }

    const categoryNames = product.categories
      .map(categoryId => {
        const category = this.categories.find(c => c.id === categoryId);
        return category?.name || null;
      })
      .filter(name => name !== null) as string[];

    if (categoryNames.length === 0) {
      return 'Categorías no encontradas';
    }

    return categoryNames.join(', ');
  }

  /**
   * 🏷️ Obtiene información detallada de las categorías de un producto
   */
  getCategoriesDisplay(product: Product): {
    names: string[],
    count: number,
    hasUnknown: boolean
  } {
    if (!product.categories || product.categories.length === 0) {
      return { names: [], count: 0, hasUnknown: false };
    }

    const result = { names: [] as string[], count: 0, hasUnknown: false };

    product.categories.forEach(categoryId => {
      const category = this.categories.find(c => c.id === categoryId);
      if (category) {
        result.names.push(category.name);
      } else {
        result.hasUnknown = true;
      }
    });

    result.count = product.categories.length;
    return result;
  }

  /**
   * 🏷️ Verifica si un producto tiene múltiples categorías
   */
  hasMultipleCategories(product: Product): boolean {
    return product.categories && product.categories.length > 1;
  }

  /**
   * 🏷️ Obtiene el color primario de una categoría (para UI)
   */
  getCategoryColor(categoryId: string): string {
    const category = this.categories.find(c => c.id === categoryId);

    // Puedes personalizar los colores según tu necesidad
    const colors = ['blue', 'green', 'orange', 'purple', 'red', 'cyan'];
    const index = categoryId ? categoryId.length % colors.length : 0;

    return colors[index];
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

    // ✅ FILTRO DE CATEGORÍAS (igual que el otro componente)
    if (filter.categories && filter.categories.length > 0) {

      filtered = filtered.filter(p => {
        // Verificar campo singular (legacy)
        if (p.category && filter.categories.includes(p.category)) {
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

  // ✅ MANTENER tu método y solo agregar estas líneas:

  private refreshSingleProduct(productId: string): void {

    // 🆕 FORZAR invalidación de caché (ya lo tienes ✅)
    this.cacheService.invalidate(`products_${productId}`);
    this.cacheService.invalidate('products');

    // 🆕 AGREGAR: Probar forceRefreshProduct si existe, sino usar getProductById
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

              // 🆕 FORZAR actualización completa del producto (ya lo tienes ✅)
              this.products[index] = { ...updatedProduct };

              if (this.selectedProduct && this.selectedProduct.id === productId) {
                this.selectedProduct = { ...updatedProduct };
              }

              // 🆕 FORZAR múltiples detecciones de cambios (ya lo tienes ✅)
              this.cdr.detectChanges();
              this.cdr.markForCheck();

              // 🆕 FORZAR actualización del array completo para triggear change detection (ya lo tienes ✅)
              this.products = [...this.products];

              setTimeout(() => {
                this.cdr.detectChanges();
                this.cdr.markForCheck();
              }, 50);
            }
          }
        },
        error: (error) => {
          console.error('❌ [MANAGEMENT] Error al refrescar producto individual:', error);
        }
      });
  }

  // Método para forzar re-render completo
  forceTableRefresh(): void {

    // Crear nueva referencia del array
    this.products = [...this.products];

    // Forzar múltiples ciclos de detección
    this.cdr.detectChanges();
    this.cdr.markForCheck();

    setTimeout(() => {
      this.cdr.detectChanges();
      this.cdr.markForCheck();
    }, 100);
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

    // Solo actualizar si los valores han cambiado
    if (this.pageSize !== pageSize || this.pageIndex !== pageIndex) {
      this.pageSize = pageSize;
      this.pageIndex = pageIndex;
      this.loadProducts();
    }
  }

  // ==================== DRAWERS/PANELES ====================

  // Reemplaza este método en product-management.component.ts
  openStatsDrawer(product: Product): void {
    this.loading = true; // Mostramos un indicador de carga
    this.productService.forceRefreshProduct(product.id).subscribe({
      next: (freshProduct) => {
        if (freshProduct) {
          this.selectedProduct = freshProduct; // Usamos el producto fresco
          this.showStatsDrawer = true;         // Abrimos el drawer
        } else {
          this.message.error('No se pudo encontrar el producto actualizado.');
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al recargar el producto:', err);
        this.message.error('No se pudo obtener la información más reciente del producto.');
        this.loading = false;
      }
    });
  }

  // Reemplaza este método en product-management.component.ts
  openInventoryDrawer(product: Product): void {
    this.loading = true; // Mostramos un indicador de carga en la tabla
    this.productService.forceRefreshProduct(product.id).subscribe({
      next: (freshProduct) => {
        if (freshProduct) {
          this.selectedProduct = freshProduct; // Usamos el producto fresco
          this.showInventoryDrawer = true;     // Abrimos el drawer
        } else {
          this.message.error('No se pudo encontrar el producto actualizado.');
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al recargar el producto:', err);
        this.message.error('No se pudo obtener la información más reciente del producto.');
        this.loading = false;
      }
    });
  }

  // Reemplaza este método en product-management.component.ts
  openPromotionsDrawer(product: Product): void {
    this.loading = true; // Mostramos un indicador de carga
    this.productService.forceRefreshProduct(product.id).subscribe({
      next: (freshProduct) => {
        if (freshProduct) {
          this.selectedProduct = freshProduct; // Usamos el producto fresco
          this.showPromotionsDrawer = true;    // Abrimos el drawer
        } else {
          this.message.error('No se pudo encontrar el producto actualizado.');
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al recargar el producto:', err);
        this.message.error('No se pudo obtener la información más reciente del producto.');
        this.loading = false;
      }
    });
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
  onInventoryChange(event: { productId: string; updatedProduct?: Product }): void {
    // 1. Invalidamos el caché como ya lo hacías. ¡Perfecto!
    this.cacheService.invalidate(`products_${event.productId}`);

    const productIndex = this.products.findIndex(p => p.id === event.productId);

    // Guardamos una copia del producto antiguo ANTES de actualizarlo
    const oldProduct = productIndex !== -1 ? { ...this.products[productIndex] } : null;

    // 2. Si el evento trae el producto actualizado (que ahora siempre lo hará)
    if (event.updatedProduct && oldProduct) {
      // Actualizamos la lista principal usando tu método auxiliar, que es ideal.
      this.updateProductInList(event.productId, event.updatedProduct);

      // 3. CALCULAMOS el 'stockChange' para notificar al otro servicio
      const stockChange = (event.updatedProduct.totalStock || 0) - (oldProduct.totalStock || 0);

      // Solo notificamos si hubo un cambio real en el stock
      if (stockChange !== 0) {
        this.stockUpdateService.notifyStockChange({
          productId: event.productId,
          variantId: 'unknown', // El evento es a nivel de producto, no conocemos la variante específica
          stockChange: stockChange,
          newStock: event.updatedProduct.totalStock || 0,
          timestamp: new Date(),
          source: 'admin',
          metadata: { userAction: 'inventory_management' }
        });
      }

      // 4. Mantenemos tu verificación en segundo plano. Es una buena práctica.
      setTimeout(() => {
        this.verifyProductUpdate(event.productId);
      }, 3000);

    } else {
      // 5. Mantenemos el fallback por si algo sale mal.
      console.warn('⚠️ [MANAGEMENT] El evento de inventario no contenía un producto actualizado. Forzando recarga.');
      this.refreshSingleProduct(event.productId);
    }
  }

  /**
   * 🏷️ Maneja cambios de promociones desde el drawer
   */
  // 6️⃣ Mejorar manejo de eventos de promociones
  onPromotionChange(event: { productId: string, updatedProduct?: Product }): void {

    // Invalidar cachés relevantes
    this.cacheService.invalidate(`products_${event.productId}`);
    this.cacheService.invalidate('products_discounted');
    this.cacheService.invalidate('products');

    if (!event.updatedProduct) {
      // 🔧 FORZAR REFRESCO EN LUGAR DE SIMPLE REFRESH
      this.productService.forceRefreshProduct(event.productId)
        .pipe(take(1))
        .subscribe({
          next: (product) => {
            if (product) {
              this.updateProductInList(event.productId, product);
              this.forceTableRefresh();
            }
          },
          error: (error) => {
            console.error('Error en force refresh:', error);
            this.refreshSingleProduct(event.productId);
          }
        });
      return;
    }

    this.updateProductInList(event.productId, event.updatedProduct);

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
    this.forceTableRefresh();

    // Verificación en segundo plano
    setTimeout(() => {
      this.verifyProductUpdate(event.productId);
    }, 2000);
  }

  private updateProductInList(productId: string, updatedProduct: Product): void {
    const productIndex = this.products.findIndex(p => p.id === productId);

    if (productIndex === -1) {
      console.warn('⚠️ [MANAGEMENT] Producto no encontrado para actualización');
      return;
    }

    this.products[productIndex] = { ...updatedProduct };

    if (this.selectedProduct && this.selectedProduct.id === productId) {
      this.selectedProduct = { ...updatedProduct };
    }

    this.cdr.detectChanges();
  }

  /**
   * 📊 Maneja cambios de estadísticas desde el drawer
   */
  onStatsChange(event: { productId: string, updatedProduct?: Product }): void {
    // Si el evento trae un producto actualizado, lo usamos.
    // Si no, o si el cambio es solo la sincronización de ventas,
    // forzamos una recarga completa del producto para obtener el estado más fresco.
    if (event.updatedProduct) {
      this.updateProductInList(event.productId, event.updatedProduct);
    } else {
      // Si no se proporciona un updatedProduct, o si es una señal de que
      // el producto necesita ser refrescado (ej. después de una sincronización de ventas),
      // forzamos un refresh completo desde el servicio.
      this.refreshProduct(event.productId);
    }
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

        // Eliminación optimista
        this.deleteProductOptimistically(id);

        // Operación en servidor
        this.productService.deleteProduct(id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.message.success('Producto eliminado correctamente');
              this.confirmOptimisticOperation(id);
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

  // Método para calcular el ancho responsivo del drawer
  getDrawerWidth(): string | number {
    if (typeof window !== 'undefined') {
      const screenWidth = window.innerWidth;

      // Móviles pequeños: pantalla completa
      if (screenWidth <= 480) return '100%';

      // Móviles grandes: 95% del ancho
      if (screenWidth <= 576) return '95%';

      // Tablets pequeñas: 90% del ancho
      if (screenWidth <= 768) return '90%';

      // Tablets: 80% del ancho
      if (screenWidth <= 1024) return '80%';

      // Desktop pequeño: 70% del ancho
      if (screenWidth <= 1200) return '70%';

      // Desktop grande: ancho fijo
      return 720;
    }
    return 720; // Fallback para SSR
  }

  // Estilos para el cuerpo del drawer
  getDrawerBodyStyle(): { [key: string]: string } {
    if (typeof window !== 'undefined') {
      const screenWidth = window.innerWidth;

      if (screenWidth <= 576) {
        return {
          padding: '8px',
          fontSize: '12px'
        };
      }

      if (screenWidth <= 768) {
        return {
          padding: '12px',
          fontSize: '13px'
        };
      }
    }

    return {
      padding: '16px',
      fontSize: '14px'
    };
  }

  /**
   * Método auxiliar para limpiar registros huérfanos de appliedPromotions
   */
  private async cleanOrphanedAppliedPromotions(orphanedRecords: any[]): Promise<void> {
    if (orphanedRecords.length === 0) return;

    console.log(`[CLEANUP] Limpiando ${orphanedRecords.length} registros de appliedPromotions`);

    // Usar el servicio AppliedPromotionsService si está disponible
    for (const orphan of orphanedRecords) {
      try {
        await firstValueFrom(
          this.appliedPromotionsService.removePromotion(
            orphan.appliedPromotion.promotionId,
            orphan.appliedPromotion.targetId
          )
        );
      } catch (error) {
        console.error(`Error eliminando registro aplicado:`, error);
      }
    }

    console.log('[CLEANUP] Registros de appliedPromotions limpiados');
  }

}
