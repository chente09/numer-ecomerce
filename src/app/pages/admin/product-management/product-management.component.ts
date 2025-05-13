import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { ProductService } from '../../../services/admin/product/product.service';
import { ProductPriceService } from '../../../services/admin/price/product-price.service';
import { Product, Color, Size, Promotion } from '../../../models/models';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { CommonModule } from '@angular/common';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTableModule, NzTableQueryParams } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzModalService, NzModalModule } from 'ng-zorro-antd/modal';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzColorPickerModule } from 'ng-zorro-antd/color-picker';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { BehaviorSubject, debounceTime, finalize, firstValueFrom, switchMap } from 'rxjs';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzListModule } from 'ng-zorro-antd/list';

@Component({
  selector: 'app-product-management',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzCardModule,
    NzFormModule,
    NzSelectModule,
    NzInputModule,
    NzRateModule,
    NzDividerModule,
    NzButtonModule,
    NzTableModule,
    FormsModule,
    NzTagModule,
    NzToolTipModule,
    NzSpinModule,
    NzIconModule,
    NzInputNumberModule,
    NzUploadModule,
    NzCheckboxModule,
    NzAlertModule,
    NzModalModule,
    NzTabsModule,
    NzCollapseModule,
    NzColorPickerModule,
    NzAvatarModule,
    NzPopoverModule,
    NzStatisticModule,
    NzGridModule,
    NzDrawerModule,
    NzEmptyModule,
    NzListModule
  ],
  templateUrl: './product-management.component.html',
  styleUrl: './product-management.component.css',
  standalone: true
})

export class ProductManagementComponent implements OnInit {
  // Listas y datos
  products: Product[] = [];
  categories: Category[] = [];
  seasons: string[] = ['Spring 2025', 'Summer 2025', 'Fall 2025', 'Winter 2025'];
  collections: string[] = ['Casual', 'Formal', 'Sport', 'Limited Edition'];
  availablePromotions: Promotion[] = [];

  // Estado del componente
  loading = false;
  loadingStats = false;
  loadingPromotions = false; // Nueva propiedad para carga de promociones
  submitting = false;
  isAddMode = true;
  showVariantDrawer = false;
  showStatsDrawer = false;
  showPromotionDrawer = false; // Nueva propiedad para drawer de promociones
  expandSet = new Set<string>();

  // Paginación
  total = 0;
  pageSize = 10;
  pageIndex = 1; // Corregido: Ahora es un número en lugar de 'a'
  lastDoc: any = null;
  hasMore = true;

  // Filtros
  filterForm!: FormGroup;
  searchChangeSubject = new BehaviorSubject<string>('');

  // Formulario de producto
  productForm!: FormGroup;
  selectedProduct?: Product;

  // Imágenes
  mainImageUrl?: string;
  mainImageFile?: File;
  colorImages: Map<string, { file: File, url: string }> = new Map();
  sizeImages: Map<string, { file: File, url: string }> = new Map();
  variantImages: Map<string, { file: File, url: string }> = new Map();

  // Estadísticas
  productStats = {
    totalProducts: 0,
    totalStock: 0,
    lowStockProducts: 0,
    averageRating: 0
  };
  salesHistory: { date: Date, sales: number }[] = [];

  // Referencias
  @ViewChild('mainImageInput') mainImageInput!: ElementRef;

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private categoryService: CategoryService,
    private productPriceService: ProductPriceService,
    private message: NzMessageService,
    private modal: NzModalService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.initFilterForm();
    this.initProductForm();
    this.loadCategories();

    // Filtrado reactivo
    this.searchChangeSubject.pipe(
      debounceTime(500)
    ).subscribe(() => {
      this.resetPagination();
      this.loadProducts();
    });

    // Carga inicial
    this.loading = true;
    this.loadProducts();
    this.loadProductStats();
  }

  // INICIALIZACIÓN DE FORMULARIOS

  initFilterForm(): void {
    this.filterForm = this.fb.group({
      searchQuery: [''],
      categories: [[]],
      minPrice: [null],
      maxPrice: [null],
      sortBy: ['newest']
    });

    this.filterForm.valueChanges.pipe(
      debounceTime(500)
    ).subscribe(() => {
      this.resetPagination();
      this.loadProducts();
    });
  }

  initProductForm(): void {
    this.productForm = this.fb.group({
      name: ['', [Validators.required]],
      price: [0, [Validators.required, Validators.min(0)]],
      category: ['', [Validators.required]],
      description: [''],
      sku: ['', [Validators.required]],
      barcode: [''],
      season: [''],
      collection: [''],
      isNew: [true],
      isBestSeller: [false],
      metaTitle: [''],
      metaDescription: [''],
      searchKeywords: [''],
      tags: [''],
      colors: this.fb.array([]),
      sizes: this.fb.array([])
    });
  }

  // Gestión de colores
  get colorForms() {
    return this.productForm.get('colors') as FormArray<FormGroup>;
  }

  addColor(): void {
    const colorForm = this.fb.group({
      name: ['', [Validators.required]],
      code: ['#000000', [Validators.required]],
      imageUrl: ['']
    });
    this.colorForms.push(colorForm);
  }

  removeColor(index: number): void {
    // Eliminar imagen si existe
    const colorName = this.colorForms.at(index).get('name')?.value;
    if (colorName && this.colorImages.has(colorName)) {
      this.colorImages.delete(colorName);
    }
    this.colorForms.removeAt(index);
  }

  getColorStockValue(sizeIndex: number, colorName: string): number {
    const colorStocks = this.getColorStockForms(sizeIndex);
    const colorStock = colorStocks.controls.find(
      control => control.get('colorName')?.value === colorName
    );
    return colorStock ? colorStock.get('quantity')?.value : 0;
  }

  updateColorStock(sizeIndex: number, colorName: string, quantity: number): void {
    const colorStocks = this.getColorStockForms(sizeIndex);
    const existingIndex = colorStocks.controls.findIndex(
      control => control.get('colorName')?.value === colorName
    );

    if (existingIndex >= 0) {
      // Update existing
      colorStocks.at(existingIndex).patchValue({ quantity });
    } else {
      // Add new
      this.addColorStock(sizeIndex, colorName);
      colorStocks.at(colorStocks.length - 1).patchValue({ quantity });
    }
  }

  // Gestión de tallas
  get sizeForms() {
    return this.productForm.get('sizes') as FormArray;
  }

  addSize(): void {
    const sizeForm = this.fb.group({
      name: ['', [Validators.required]],
      stock: [0, [Validators.required, Validators.min(0)]],
      imageUrl: [''],
      colorStocks: this.fb.array([])
    });
    this.sizeForms.push(sizeForm);
  }

  removeSize(index: number): void {
    // Eliminar imagen si existe
    const sizeName = this.sizeForms.at(index).get('name')?.value;
    if (sizeName && this.sizeImages.has(sizeName)) {
      this.sizeImages.delete(sizeName);
    }
    this.sizeForms.removeAt(index);
  }

  // Gestión de stock por color
  getColorStockForms(sizeIndex: number) {
    return (this.sizeForms.at(sizeIndex).get('colorStocks') as FormArray<FormGroup>);
  }

  addColorStock(sizeIndex: number, colorName: string): void {
    const colorStockForm = this.fb.group({
      colorName: [colorName, [Validators.required]],
      quantity: [0, [Validators.required, Validators.min(0)]]
    });
    this.getColorStockForms(sizeIndex).push(colorStockForm);
  }

  removeColorStock(sizeIndex: number, colorStockIndex: number): void {
    this.getColorStockForms(sizeIndex).removeAt(colorStockIndex);
  }

  // CARGAR DATOS

  loadProducts(): void {
    this.loading = true;

    // Crear objeto de filtro
    const filterValues = this.filterForm.value;
    const filter = {
      searchQuery: filterValues.searchQuery,
      categories: filterValues.categories,
      minPrice: filterValues.minPrice,
      maxPrice: filterValues.maxPrice,
      sortBy: filterValues.sortBy,
      page: this.pageIndex,
      limit: this.pageSize,
      lastDoc: this.lastDoc
    };

    this.productService.getProducts()
      .pipe(
        // Aplicar promociones y precios con descuento
        switchMap(products => this.productPriceService.calculateDiscountedPrices(products)),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges(); // Asegura que la UI se actualice
        })
      )
      .subscribe({
        next: (products) => {
          console.log('Productos recibidos con precios actualizados:', products);
          this.products = products;
          this.total = products.length;
          this.loading = false; // Asegúrate de que loading sea false cuando se reciben los productos
          this.cdr.detectChanges(); // Forzar la detección de cambios aquí también
        },
        error: (error) => {
          console.error('Error al cargar productos:', error);
          this.message.error('Error al cargar productos: ' + (error.message || 'Error desconocido'));
          this.loading = false; // Importante asegurar que loading sea false incluso en caso de error
          this.cdr.detectChanges();
        }
      });
  }

  loadCategories(): void {
    this.categoryService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
      },
      error: (error) => {
        this.message.error('Error al cargar categorías: ' + (error.message || 'Error desconocido'));
      }
    });
  }

  loadProductStats(): void {
    this.loadingStats = true;
    this.productService.getProducts()
      .pipe(
        finalize(() => {
          this.loadingStats = false;
          this.cdr.detectChanges(); // Forzar detección de cambios
        })
      )
      .subscribe({
        next: (products) => {
          this.productStats = {
            totalProducts: products.length,
            totalStock: products.reduce((sum, product) => sum + (product.totalStock || 0), 0),
            lowStockProducts: products.filter(product => (product.totalStock || 0) < 10).length,
            averageRating: products.length > 0 ?
              Number((products.reduce((sum, product) => sum + (product.rating || 0), 0) / products.length).toFixed(1)) : 0
          };
          this.loadingStats = false; // Asegurar que loadingStats se actualice aquí también
          this.cdr.detectChanges(); // Forzar la detección de cambios
          console.log('Estadísticas cargadas:', this.productStats); // Log para depuración
        },
        error: (error) => {
          this.message.error('Error al cargar estadísticas: ' + (error.message || 'Error desconocido'));
          this.loadingStats = false; // Asegurar que loadingStats se actualice en caso de error
          this.cdr.detectChanges();
          console.error('Error al cargar estadísticas:', error);
        }
      });
  }

  // GESTIÓN DE PROMOCIONES

  // Cargar promociones disponibles para un producto
  loadAvailablePromotions(productId: string): void {
    this.loadingPromotions = true;
    this.productPriceService.getPromotionsForProduct(productId)
      .pipe(finalize(() => this.loadingPromotions = false))
      .subscribe({
        next: (promotions) => {
          this.availablePromotions = promotions;
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.message.error('Error al cargar promociones: ' + (error.message || 'Error desconocido'));
        }
      });
  }

  // Mostrar drawer para aplicar promociones
  openPromotionDrawer(productId: string): void {
    const product = this.products.find(p => p.id === productId);
    if (product) {
      this.selectedProduct = product;
      this.showPromotionDrawer = true;
      this.loadAvailablePromotions(productId);
    }
  }

  // Cerrar drawer de promociones
  closePromotionDrawer(): void {
    this.showPromotionDrawer = false;
    this.selectedProduct = undefined;
    this.availablePromotions = [];
  }

  // Aplicar promoción a un producto
  applyPromotionToProduct(productId: string, promotionId: string): void {
    this.loading = true;
    const product = this.products.find(p => p.id === productId);

    if (!product) {
      this.message.error('Producto no encontrado');
      this.loading = false;
      return;
    }

    this.productPriceService.applyPromotionToProduct(product, promotionId)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (updatedProduct) => {
          // Actualizar el producto en la lista
          const index = this.products.findIndex(p => p.id === productId);
          if (index !== -1) {
            this.products[index] = updatedProduct;
            this.cdr.detectChanges();
            this.message.success('Promoción aplicada correctamente');
            this.closePromotionDrawer();
          }
        },
        error: (error) => {
          this.message.error('Error al aplicar promoción: ' + (error.message || 'Error desconocido'));
        }
      });
  }

  // Quitar promociones de un producto
  removePromotionsFromProduct(productId: string): void {
    const product = this.products.find(p => p.id === productId);

    if (!product) {
      this.message.error('Producto no encontrado');
      return;
    }

    // Eliminar las promociones y recalcular el precio
    const updatedProduct = {
      ...product,
      promotions: [],
      activePromotion: undefined,
      currentPrice: product.price,
      discountPercentage: 0
    };

    // Actualizar el producto en la lista
    const index = this.products.findIndex(p => p.id === productId);
    if (index !== -1) {
      this.products[index] = updatedProduct;
      this.cdr.detectChanges();
      this.message.success('Promociones eliminadas correctamente');
    }
  }

  // GESTIÓN DE PRODUCTOS

  async viewProductDetails(id: string): Promise<void> {
    try {
      this.loading = true;
      const product = await this.productService.getProductById(id);
      if (product) {
        this.selectedProduct = product;
        this.showStatsDrawer = true;
      }
    } catch (error: any) {
      this.message.error('Error al cargar detalles del producto: ' + (error.message || 'Error desconocido'));
    } finally {
      this.loading = false;
    }
  }

  newProduct(): void {
    this.isAddMode = true;
    this.selectedProduct = undefined;
    this.resetProductForm();
    this.resetImages();
  }

  editProduct(product: Product): void {
    this.isAddMode = false;
    this.selectedProduct = product;
    this.resetProductForm();
    this.populateProductForm(product);
  }

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
          .then(() => {
            this.message.success('Producto eliminado correctamente');
            this.loadProducts();
          })
          .catch(error => {
            this.message.error('Error al eliminar producto: ' + (error.message || 'Error desconocido'));
          })
          .finally(() => {
            this.loading = false;
          });
      }
    });
  }

  async incrementProductViews(id: string): Promise<void> {
    try {
      this.loading = true;
      await this.productService.incrementProductViews(id);
      this.message.success('Vistas incrementadas');
      this.loadProducts();
    } catch (error: any) {
      this.message.error('Error al incrementar vistas: ' + (error.message || 'Error desconocido'));
    } finally {
      this.loading = false;
    }
  }

  // Método para actualizar stock de variantes
  async updateStockQuantity(productId: string, variantId: string, quantity: number): Promise<void> {
    try {
      this.loading = true;
      // Implementar la lógica para actualizar el stock de la variante
      await this.productService.updateVariantStock(productId, variantId, quantity);
      this.message.success('Stock actualizado correctamente');
    } catch (error: any) {
      this.message.error('Error al actualizar stock: ' + (error.message || 'Error desconocido'));
    } finally {
      this.loading = false;
    }
  }

  // MANEJO DE FORMULARIO

  resetProductForm(): void {
    this.productForm.reset();

    // Resetear arrays
    while (this.colorForms.length) {
      this.colorForms.removeAt(0);
    }

    while (this.sizeForms.length) {
      this.sizeForms.removeAt(0);
    }

    // Valores por defecto
    this.productForm.patchValue({
      price: 0,
      isNew: true,
      isBestSeller: false
    });
  }

  populateProductForm(product: Product): void {
    // Resetear y establecer valores base
    this.resetProductForm();

    // Establecer la imagen principal
    this.mainImageUrl = product.imageUrl;

    // Llenar el formulario con los datos del producto
    this.productForm.patchValue({
      name: product.name,
      price: product.price,
      category: product.category,
      description: product.description || '',
      sku: product.sku,
      barcode: product.barcode || '',
      season: product.season || '',
      collection: product.collection || '',
      isNew: product.isNew,
      isBestSeller: product.isBestSeller,
      metaTitle: product.metaTitle || '',
      metaDescription: product.metaDescription || '',
      searchKeywords: product.searchKeywords?.join(', ') || '',
      tags: product.tags?.join(', ') || ''
    });

    // Agregar colores
    product.colors.forEach(color => {
      const colorForm = this.fb.group({
        name: [color.name, [Validators.required]],
        code: [color.code, [Validators.required]],
        imageUrl: [color.imageUrl || '']
      });
      this.colorForms.push(colorForm);

      // Si tiene imagen, guardarla en el mapa
      if (color.imageUrl) {
        this.colorImages.set(color.name, { file: new File([], ''), url: color.imageUrl });
      }
    });

    // Agregar tamaños
    product.sizes.forEach(size => {
      const sizeForm = this.fb.group({
        name: [size.name, [Validators.required]],
        stock: [size.stock, [Validators.required, Validators.min(0)]],
        imageUrl: [size.imageUrl || ''],
        colorStocks: this.fb.array([])
      });
      this.sizeForms.push(sizeForm);

      // Si tiene imagen, guardarla en el mapa
      if (size.imageUrl) {
        this.sizeImages.set(size.name, { file: new File([], ''), url: size.imageUrl });
      }

      // Agregar stock por color
      const colorStocksForm = sizeForm.get('colorStocks') as FormArray;
      size.colorStocks?.forEach(colorStock => {
        const colorStockForm = this.fb.group({
          colorName: [colorStock.colorName, [Validators.required]],
          quantity: [colorStock.quantity, [Validators.required, Validators.min(0)]]
        });
        colorStocksForm.push(colorStockForm);
      });
    });

    // Guardar imágenes de variantes
    if (product.variants && Array.isArray(product.variants)) {
      product.variants.forEach(variant => {
        if (variant.imageUrl && variant.imageUrl !== product.imageUrl) {
          const key = `${variant.colorName}-${variant.sizeName}`;
          this.variantImages.set(key, { file: new File([], ''), url: variant.imageUrl });
        }
      });
    }
  }

  async submitProductForm(): Promise<void> {
    if (this.productForm.invalid) {
      // Marcar todos los campos como touched para mostrar errores
      Object.values(this.productForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      this.message.warning('Por favor, corrija los errores en el formulario.');
      return;
    }

    // Verificar que existe una imagen principal para productos nuevos
    if (this.isAddMode && !this.mainImageFile) {
      this.message.warning('Debe seleccionar una imagen principal para el producto.');
      return;
    }

    this.submitting = true;

    try {
      // Preparar datos del producto
      const formData = this.productForm.value;

      // Procesar tags y keywords
      const tags = formData.tags ? formData.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : [];
      const searchKeywords = formData.searchKeywords ?
        formData.searchKeywords.split(',').map((kw: string) => kw.trim()).filter(Boolean) : [];

      // Crear objeto de producto con todas las propiedades requeridas
      const productData: Omit<Product, 'id' | 'imageUrl' | 'variants'> = {
        name: formData.name,
        price: formData.price,
        category: formData.category,
        description: formData.description,
        sku: formData.sku,
        barcode: formData.barcode,
        season: formData.season,
        collection: formData.collection,
        isNew: formData.isNew,
        isBestSeller: formData.isBestSeller,
        metaTitle: formData.metaTitle,
        metaDescription: formData.metaDescription,
        colors: formData.colors,
        sizes: formData.sizes,
        tags,
        searchKeywords,
        rating: this.selectedProduct?.rating || 0,
        totalStock: 0, // Se calculará en el servicio
        views: this.selectedProduct?.views || 0,
        sales: this.selectedProduct?.sales || 0
      };

      // Preparar imágenes
      const variantImagesMap = new Map<string, File>();
      this.variantImages.forEach((value, key) => {
        if (value.file.size > 0) {
          variantImagesMap.set(key, value.file);
        }
      });

      const colorImagesMap = new Map<string, File>();
      this.colorImages.forEach((value, key) => {
        if (value.file.size > 0) {
          colorImagesMap.set(key, value.file);
        }
      });

      const sizeImagesMap = new Map<string, File>();
      this.sizeImages.forEach((value, key) => {
        if (value.file.size > 0) {
          sizeImagesMap.set(key, value.file);
        }
      });

      if (this.isAddMode) {
        // Crear nuevo producto
        const id = await this.productService.createProduct(
          productData,
          this.mainImageFile!,
          variantImagesMap,
          colorImagesMap,
          sizeImagesMap
        );
        this.message.success(`Producto creado correctamente con ID: ${id}`);
        this.resetProductForm();
        this.resetImages();
      } else {
        // Actualizar producto existente
        await this.productService.updateProduct(
          this.selectedProduct!.id,
          productData,
          this.mainImageFile,
          variantImagesMap,
          colorImagesMap,
          sizeImagesMap
        );
        this.message.success('Producto actualizado correctamente');
      }

      // Recargar productos
      this.loadProducts();
    } catch (error: any) {
      this.message.error('Error al ' + (this.isAddMode ? 'crear' : 'actualizar') + ' producto: ' +
        (error.message || 'Error desconocido'));
      console.error('Error en submitProductForm:', error);
    } finally {
      this.submitting = false;
    }
  }

  // MANEJO DE IMÁGENES

  resetImages(): void {
    this.mainImageUrl = undefined;
    this.mainImageFile = undefined;
    this.colorImages.clear();
    this.sizeImages.clear();
    this.variantImages.clear();

    // Resetear input de archivos
    if (this.mainImageInput) {
      this.mainImageInput.nativeElement.value = '';
    }
  }

  onMainImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const file = input.files[0];
      this.mainImageFile = file;

      // Previsualización
      const reader = new FileReader();
      reader.onload = () => {
        this.mainImageUrl = reader.result as string;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  onColorImageChange(event: Event, colorName: string): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const file = input.files[0];

      // Previsualización
      const reader = new FileReader();
      reader.onload = () => {
        this.colorImages.set(colorName, {
          file: file,
          url: reader.result as string
        });
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  onSizeImageChange(event: Event, sizeName: string): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const file = input.files[0];

      // Previsualización
      const reader = new FileReader();
      reader.onload = () => {
        this.sizeImages.set(sizeName, {
          file: file,
          url: reader.result as string
        });
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  onVariantImageChange(event: Event, colorName: string, sizeName: string): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const file = input.files[0];
      const key = `${colorName}-${sizeName}`;

      // Previsualización
      const reader = new FileReader();
      reader.onload = () => {
        this.variantImages.set(key, {
          file: file,
          url: reader.result as string
        });
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  // PAGINACIÓN Y FILTRADO

  resetPagination(): void {
    this.pageIndex = 1;
    this.lastDoc = null;
  }

  onQueryParamsChange(params: NzTableQueryParams): void {
    const { pageSize, pageIndex } = params;
    this.pageSize = pageSize;
    this.pageIndex = pageIndex;
    this.loading = true;
    this.loadProducts();
  }

  onSearch(): void {
    this.loading = true;
    this.searchChangeSubject.next(this.filterForm.get('searchQuery')?.value);
  }

  // VARIANTES

  showVariantsForProduct(product: Product): void {
    this.selectedProduct = product;
    this.showVariantDrawer = true;
  }

  // UTILIDADES

  getColorByName(colorName: string): Color | undefined {
    return this.selectedProduct?.colors.find(c => c.name === colorName);
  }

  onExpandChange(id: string, checked: boolean): void {
    if (checked) {
      this.expandSet.add(id);
    } else {
      this.expandSet.delete(id);
    }
  }

  closeDrawer(): void {
    this.selectedProduct = undefined;
    this.isAddMode = false;
    this.resetProductForm();
    this.resetImages();
  }

  closeDrawers(): void {
    this.showVariantDrawer = false;
    this.showStatsDrawer = false;
  }

  strToArray(str: string): string[] {
    return str ? str.split(',').map(item => item.trim()).filter(Boolean) : [];
  }

  // Verificar si un producto tiene descuento
  hasDiscount(product: Product): boolean {
    return product.discountPercentage !== undefined && product.discountPercentage > 0;
  }
}