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
    this.loading = true;
    console.log('Loading iniciado:', this.loading);

    // Crear objeto de filtro desde el formulario
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

    // Usar búsqueda si hay query, sino obtener todos
    if (filter.searchQuery) {
      this.productService.searchProducts(filter.searchQuery)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (products) => {
            this.products = this.applyClientSideFilters(products, filter);
            this.total = this.products.length;
            this.loading = false;
            console.log('Loading finalizado en next:', this.loading);
            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error('Error al buscar productos:', error);
            this.message.error('Error al buscar productos: ' + (error.message || 'Error desconocido'));
            this.loading = false;
            console.log('Loading finalizado en error:', this.loading);
            this.cdr.detectChanges();
          },
          complete: () => {
            // Este también debería ejecutarse
            this.loading = false;
            console.log('Loading finalizado en complete:', this.loading);
            this.cdr.detectChanges();
          }
        });
    } else {
      // Obtener todos y aplicar filtros
      this.productService.getProducts()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (products) => {
            const filteredProducts = this.applyClientSideFilters(products, filter);
            this.products = filteredProducts;
            this.total = this.products.length;
            this.loading = false;
            console.log('Loading finalizado en next:', this.loading);
            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error('Error al cargar productos:', error);
            this.message.error('Error al cargar productos: ' + (error.message || 'Error desconocido'));
            this.loading = false;
            console.log('Loading finalizado en error:', this.loading);
            this.cdr.detectChanges();
          },
          complete: () => {
            this.loading = false;
            console.log('Loading finalizado en complete:', this.loading);
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

  // Filtrado en cliente (igual a tu implementación original)
  applyClientSideFilters(products: Product[], filter: any): Product[] {
    let result = [...products];

    // Filtrar por categorías
    if (filter.categories && filter.categories.length > 0) {
      result = result.filter(p => filter.categories.includes(p.category));
    }

    // Filtrar por precio
    if (filter.minPrice !== null) {
      result = result.filter(p => (p.currentPrice || p.price) >= filter.minPrice);
    }

    if (filter.maxPrice !== null) {
      result = result.filter(p => (p.currentPrice || p.price) <= filter.maxPrice);
    }

    // Ordenar
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

    // Aplicar paginación
    const startIndex = (filter.page - 1) * filter.limit;
    const endIndex = startIndex + filter.limit;

    return result.slice(startIndex, endIndex);
  }

  // Acciones de productos
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

  // Abrir diferentes drawers/paneles
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

  // Eliminar producto
  deleteProduct(id: string): void {
    this.modal.confirm({
      nzTitle: '¿Está seguro de eliminar este producto?',
      nzContent: 'Esta acción no se puede deshacer.',
      nzOkText: 'Eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.loading = true;
        this.productService.deleteProduct(id)
          .pipe(
            takeUntil(this.destroy$),
            finalize(() => this.loading = false)
          )
          .subscribe({
            next: () => {
              this.message.success('Producto eliminado correctamente');
              // No es necesario recargar, gracias a la invalidación de caché
            },
            error: (error) => {
              this.message.error('Error al eliminar producto: ' + (error.message || 'Error desconocido'));
            }
          });
      }
    });
  }

  // Verificar si un producto tiene descuento
  hasDiscount(product: Product): boolean {
    return !!product.discountPercentage && product.discountPercentage > 0;
  }

  // Manejar errores de imágenes
  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'assets/images/product-placeholder.png';
      imgElement.classList.add('error-image');
    }
  }
}