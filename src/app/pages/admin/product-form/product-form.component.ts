import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ProductService } from '../../../services/admin/product/product.service';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { Product, Color, Size } from '../../../models/models';
import { finalize } from 'rxjs';

// Importar módulos de ng-zorro necesarios
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzColorPickerModule } from 'ng-zorro-antd/color-picker';
import { FormsModule } from '@angular/forms';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzRadioModule } from 'ng-zorro-antd/radio';


@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzSelectModule,
    NzUploadModule,
    NzInputNumberModule,
    NzCheckboxModule,
    NzDividerModule,
    NzIconModule,
    NzTabsModule,
    NzTagModule,
    NzToolTipModule,
    NzColorPickerModule,
    NzEmptyModule,
    NzAlertModule,
    NzRadioModule
  ],
  templateUrl: './product-form.component.html',
  styleUrls: ['./product-form.component.css']
})
export class ProductFormComponent implements OnInit, OnChanges {
  @Input() product: Product | null = null;
  @Input() isEditMode = false;
  @Input() categories: Category[] = [];
  @Input() existingColors: Color[] = [];
  @Input() existingSizes: Size[] = [];

  @Output() formSubmitted = new EventEmitter<boolean>();
  @Output() formCancelled = new EventEmitter<void>();

  variantsMatrix: {
    size: string;
    colorVariants: {
      colorName: string;
      sizeName: string;
      stock: number;
      key: string;
    }[];
  }[] = [];

  productForm!: FormGroup;
  submitting = false;
  totalStock: number = 0;
  showVariantsMatrix = false;
  autoGenerateSku = true;
  autoGenerateBarcode = true;
  additionalImages: { file: File, url: string, id: string }[] = [];
  maxAdditionalImages: number = 5; // Límite de imágenes adicionales
  productFeatures: string[] = []; // Características del producto
  newFeature: string = '';

  // Predefinidos
  seasons: string[] = ['Spring 2025', 'Summer 2025', 'Fall 2025', 'Winter 2025'];
  collections: string[] = ['Casual', 'Formal', 'Sport', 'Limited Edition'];
  genderOptions = [
    { label: 'Hombre', value: 'man' },
    { label: 'Mujer', value: 'woman' },
    { label: 'Niño', value: 'boy' },
    { label: 'Niña', value: 'girl' },
    { label: 'Unisex', value: 'unisex' }
  ];

  // Imágenes
  mainImageUrl?: string;
  mainImageFile?: File;
  colorImages: Map<string, { file: File, url: string }> = new Map();
  sizeImages: Map<string, { file: File, url: string }> = new Map();
  variantImages: Map<string, { file: File, url: string }> = new Map();

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.initProductForm();
    this.listenToStockChanges();
    this.createVariantsMatrix();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product'] && this.product) {
      this.populateForm();
    }
  }

  initProductForm(): void {
    this.productForm = this.fb.group({
      name: ['', [Validators.required]],
      price: [0, [Validators.required, Validators.min(0)]],
      category: ['', [Validators.required]],
      description: [''],
      sku: ['', this.autoGenerateSku ? [] : [Validators.required]],
      barcode: [''],
      season: [''],
      collection: [''],
      isNew: [true],
      isBestSeller: [false],
      gender: ['unisex'],
      metaTitle: [''],
      metaDescription: [''],
      searchKeywords: [''],
      tags: [''],
      colors: this.fb.array([]),
      sizes: this.fb.array([])
    });

    this.listenToAutoGenerateSkuChanges();
  }

  // Gestión de colores
  get colorForms() {
    return this.productForm.get('colors') as FormArray;
  }

  get colorFormsControls() {
    return this.colorForms.controls as FormGroup[];
  }

  addColor(): void {
    const colorForm = this.fb.group({
      name: ['', [Validators.required]],
      code: ['#000000', [Validators.required]],
      imageUrl: ['']
    });
    this.colorForms.push(colorForm);

    // Regenerar la matriz de variantes
    this.createVariantsMatrix();
  }

  removeColor(index: number): void {
    // El código existente para eliminar color
    const colorName = this.colorForms.at(index).get('name')?.value;
    if (colorName && this.colorImages.has(colorName)) {
      this.colorImages.delete(colorName);
    }
    this.colorForms.removeAt(index);

    // Regenerar la matriz de variantes
    this.createVariantsMatrix();
  }

  // Gestión de tallas
  get sizeForms() {
    return this.productForm.get('sizes') as FormArray;
  }

  get sizeFormsControls() {
    return this.sizeForms.controls as FormGroup[];
  }

  addSize(): void {
    const sizeForm = this.fb.group({
      name: ['', [Validators.required]],
      stock: [0, [Validators.required, Validators.min(0)]],
      imageUrl: [''],
      colorStocks: this.fb.array([])
    });
    this.sizeForms.push(sizeForm);

    // Regenerar la matriz de variantes
    this.createVariantsMatrix();
  }

  removeSize(index: number): void {
    // El código existente para eliminar talla
    const sizeName = this.sizeForms.at(index).get('name')?.value;
    if (sizeName && this.sizeImages.has(sizeName)) {
      this.sizeImages.delete(sizeName);
    }
    this.sizeForms.removeAt(index);

    // Regenerar la matriz de variantes
    this.createVariantsMatrix();
  }

  // Gestión de stock por color
  getColorStockForms(sizeIndex: number) {
    return this.sizeForms.at(sizeIndex).get('colorStocks') as FormArray;
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

  getColorStockValue(sizeIndex: number, colorName: string): number {
    const colorStocks = this.getColorStockForms(sizeIndex);
    const colorStock = colorStocks.controls.find(
      control => control.get('colorName')?.value === colorName
    );
    return colorStock ? colorStock.get('quantity')?.value : 0;
  }

  addExistingColor(color: Color): void {
    // Verificar si este color ya está agregado
    const exists = this.colorForms.controls.some(
      control => (control as FormGroup).get('name')?.value === color.name
    );

    if (!exists) {
      const colorForm = this.fb.group({
        name: [color.name, [Validators.required]],
        code: [color.code, [Validators.required]],
        imageUrl: [color.imageUrl || '']
      });
      this.colorForms.push(colorForm);

      // Si el color tiene una imagen, guardarla en el mapa
      if (color.imageUrl) {
        this.colorImages.set(color.name, { file: new File([], ''), url: color.imageUrl });
      }

      this.message.success(`Color ${color.name} agregado`);
    } else {
      this.message.info(`El color ${color.name} ya está agregado`);
    }

    // Regenerar la matriz de variantes
    this.createVariantsMatrix();
  }

  addExistingSize(size: Size): void {
    // Verificar si esta talla ya está agregada
    const exists = this.sizeForms.controls.some(
      control => (control as FormGroup).get('name')?.value === size.name
    );

    if (!exists) {
      const sizeForm = this.fb.group({
        name: [size.name, [Validators.required]],
        stock: [size.stock || 0, [Validators.required, Validators.min(0)]],
        imageUrl: [size.imageUrl || ''],
        colorStocks: this.fb.array([])
      });
      this.sizeForms.push(sizeForm);

      // Si la talla tiene una imagen, guardarla en el mapa
      if (size.imageUrl) {
        this.sizeImages.set(size.name, { file: new File([], ''), url: size.imageUrl });
      }

      this.message.success(`Talla ${size.name} agregada`);
    } else {
      this.message.info(`La talla ${size.name} ya está agregada`);
    }

    // Regenerar la matriz de variantes
    this.createVariantsMatrix();
  }

  // Método para añadir imágenes adicionales
  onAdditionalImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const files = Array.from(input.files);

      // Verificar si no excede el límite de imágenes
      if (this.additionalImages.length + files.length > this.maxAdditionalImages) {
        this.message.warning(`Solo puede subir un máximo de ${this.maxAdditionalImages} imágenes adicionales.`);
        return;
      }

      // Procesar cada archivo
      files.forEach(file => {
        // Crear vista previa
        const reader = new FileReader();
        reader.onload = () => {
          this.additionalImages.push({
            file: file,
            url: reader.result as string,
            id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
          });
          this.cdr.detectChanges();
        };
        reader.readAsDataURL(file);
      });
    }
  }

  // Método para eliminar una imagen de la galería
  removeAdditionalImage(index: number): void {
    this.additionalImages.splice(index, 1);
    this.cdr.detectChanges();
  }

  // Método para añadir una característica
  addFeature(): void {
    if (this.newFeature.trim()) {
      this.productFeatures.push(this.newFeature.trim());
      this.newFeature = '';
      this.cdr.detectChanges();
    }
  }

  // Método para eliminar una característica
  removeFeature(index: number): void {
    this.productFeatures.splice(index, 1);
    this.cdr.detectChanges();
  }


  // Poblado de formulario
  populateForm(): void {
    if (!this.product) return;

    // Resetear el form
    this.resetForm();

    // Establecer la imagen principal
    this.mainImageUrl = this.product.imageUrl;

    
    // Llenar el formulario con los datos del producto
    this.productForm.patchValue({
      name: this.product.name,
      price: this.product.price,
      category: this.product.category,
      description: this.product.description || '',
      sku: this.product.sku,
      barcode: this.product.barcode || '',
      season: this.product.season || '',
      collection: this.product.collection || '',
      gender: this.product.gender || 'unisex',
      isNew: this.product.isNew,
      isBestSeller: this.product.isBestSeller,
      metaTitle: this.product.metaTitle || '',
      metaDescription: this.product.metaDescription || '',
      searchKeywords: this.product.searchKeywords?.join(', ') || '',
      tags: this.product.tags?.join(', ') || ''
    });

    // Agregar colores
    this.product.colors.forEach(color => {
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
    this.product.sizes.forEach(size => {
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
    if (this.product.variants && Array.isArray(this.product.variants)) {
      this.product.variants.forEach(variant => {
        if (variant.imageUrl && variant.imageUrl !== this.product?.imageUrl) {
          const key = `${variant.colorName}-${variant.sizeName}`;
          this.variantImages.set(key, { file: new File([], ''), url: variant.imageUrl });
        }
      });
    }

    // Cargar imágenes adicionales
    if (this.product?.additionalImages && this.product.additionalImages.length > 0) {
      this.additionalImages = this.product.additionalImages.map(url => ({
        file: new File([], ''), // Archivo vacío para imágenes existentes
        url: url,
        id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      }));
    }

    // Cargar características
    if (this.product?.features && this.product.features.length > 0) {
      this.productFeatures = [...this.product.features];
    }


    this.createVariantsMatrix();
  }

  resetForm(): void {
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

    // Resetear imágenes
    this.resetImages();
  }

  resetImages(): void {
    this.mainImageUrl = undefined;
    this.mainImageFile = undefined;
    this.colorImages.clear();
    this.sizeImages.clear();
    this.variantImages.clear();
    this.additionalImages = [];
  }

  // Manejo de imágenes
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

  // Enviar formulario
  submitForm(): void {
    if (this.productForm.invalid) {
      // Marcar campos como touched para mostrar errores
      Object.values(this.productForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      this.message.warning('Por favor, corrija los errores en el formulario.');
      return;
    }

    // Verificar imagen principal para nuevos productos
    if (!this.isEditMode && !this.mainImageFile) {
      this.message.warning('Debe seleccionar una imagen principal para el producto.');
      return;
    }

    // Preparar datos del producto
    const formData = this.productForm.value;

    // Si está activada la generación automática y no hay SKU, generarlo
    if (this.autoGenerateSku && !formData.sku) {
      formData.sku = this.generateSku();
      this.productForm.get('sku')?.setValue(formData.sku);
    }

    // Si está activada la generación automática y no hay código de barras, generarlo
    if (this.autoGenerateBarcode && !formData.barcode) {
      formData.barcode = this.generateEan13();
      this.productForm.get('barcode')?.setValue(formData.barcode);
    }


    this.submitting = true;

    try {

      // Procesar tags y keywords
      const tags = formData.tags ? formData.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : [];
      const searchKeywords = formData.searchKeywords ?
        formData.searchKeywords.split(',').map((kw: string) => kw.trim()).filter(Boolean) : [];

      // Crear objeto de producto
      const productData: Omit<Product, 'id'> = {
        name: formData.name,
        price: formData.price,
        category: formData.category,
        description: formData.description,
        sku: formData.sku,
        barcode: formData.barcode,
        season: formData.season,
        collection: formData.collection,
        gender: formData.gender,
        isNew: formData.isNew,
        isBestSeller: formData.isBestSeller,
        metaTitle: formData.metaTitle,
        metaDescription: formData.metaDescription,
        colors: formData.colors,
        sizes: formData.sizes,
        tags,
        searchKeywords,
        rating: this.product?.rating || 5,
        totalStock: 0, // Se calculará en el servicio
        views: this.product?.views || 0,
        sales: this.product?.sales || 0,
        imageUrl: '', // Se establecerá por el servicio
        additionalImages: [],
        variants: [], // Se generará por el servicio
        features: this.productFeatures,
      };

      // Preparar mapas de imágenes
      const variantImagesMap = new Map<string, File>();
      this.variantImages.forEach((value, key) => {
        if (value.file.size > 0) {
          variantImagesMap.set(key, value.file);
        }
      });

      // Preparar archivos de imágenes adicionales
      const additionalImageFiles = this.additionalImages
        .filter(img => img.file.size > 0) // Solo las nuevas imágenes
        .map(img => img.file);

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

      if (!this.isEditMode) {
        // Crear nuevo producto
        this.productService.createProduct(
          productData,
          formData.colors,
          formData.sizes,
          this.mainImageFile!,
          colorImagesMap,
          sizeImagesMap,
          variantImagesMap,
          additionalImageFiles
        ).pipe(
          finalize(() => this.submitting = false)
        ).subscribe({
          next: (id) => {
            this.message.success(`Producto creado correctamente con ID: ${id}`);
            this.resetForm();
            this.formSubmitted.emit(true);
          },
          error: (error) => {
            this.message.error('Error al crear producto: ' + (error.message || 'Error desconocido'));
            console.error('Error en submitForm:', error);
          }
        });
      } else {
        // Actualizar producto existente
        this.productService.updateProduct(
          this.product!.id,
          productData,
          this.mainImageFile || undefined
        ).pipe(
          finalize(() => this.submitting = false)
        ).subscribe({
          next: () => {
            this.message.success('Producto actualizado correctamente');
            this.formSubmitted.emit(true);
          },
          error: (error) => {
            this.message.error('Error al actualizar producto: ' + (error.message || 'Error desconocido'));
            console.error('Error en submitForm:', error);
          }
        });
      }
    } catch (error: any) {
      this.submitting = false;
      this.message.error('Error al ' + (this.isEditMode ? 'actualizar' : 'crear') + ' producto: ' +
        (error.message || 'Error desconocido'));
      console.error('Error en submitForm:', error);
    }
  }

  cancelForm(): void {
    this.formCancelled.emit();
  }

  // Método para calcular el stock total
  calculateTotalStock(): number {
    let total = 0;

    // Iterar por todas las tallas y sus stocks de colores
    for (let i = 0; i < this.sizeForms.length; i++) {
      const colorStocks = this.getColorStockForms(i);

      // Sumar todos los stocks por color
      for (let j = 0; j < colorStocks.length; j++) {
        const quantity = colorStocks.at(j).get('quantity')?.value || 0;
        total += quantity;
      }
    }

    return total;
  }

  // Escuchar cambios en el stock para actualizar el total
  listenToStockChanges(): void {
    this.productForm.valueChanges.subscribe(() => {
      this.updateTotalStock();
    });
  }

  updateTotalStock(): void {
    this.totalStock = this.calculateTotalStock();
  }

  isValidStockUpdate(sizeIndex: number, colorName: string): boolean {
    const sizeForm = this.sizeForms.at(sizeIndex);
    return !!sizeForm && !!colorName;
  }

  /**
 * Genera la matriz de variantes basada en los colores y tallas actuales
 */
  createVariantsMatrix(): void {
    // Limpiar matriz anterior
    this.variantsMatrix = [];

    // Solo generar si hay al menos un color y una talla
    if (this.colorForms.length === 0 || this.sizeForms.length === 0) {
      this.showVariantsMatrix = false;
      return;
    }

    // Obtener los valores de los formularios
    const colors = this.colorForms.controls.map(control =>
      (control as FormGroup).get('name')?.value
    ).filter(Boolean);

    const sizes = this.sizeForms.controls.map(control =>
      (control as FormGroup).get('name')?.value
    ).filter(Boolean);

    // Para cada talla, crear una fila con todos los colores
    sizes.forEach(sizeName => {
      const sizeIndex = this.getSizeIndexByName(sizeName);
      if (sizeIndex === -1) return;

      const row = {
        size: sizeName,
        colorVariants: colors.map(colorName => ({
          colorName: colorName,
          sizeName: sizeName,
          stock: this.getColorStockValue(sizeIndex, colorName) || 0,
          key: `${colorName}-${sizeName}`
        }))
      };
      this.variantsMatrix.push(row);
    });

    this.showVariantsMatrix = this.variantsMatrix.length > 0;
    this.updateTotalStock();
  }

  /**
   * Obtiene el índice de una talla por su nombre
   */
  getSizeIndexByName(sizeName: string): number {
    return this.sizeForms.controls.findIndex(control =>
      (control as FormGroup).get('name')?.value === sizeName
    );
  }

  /**
 * Actualiza el stock de una variante específica
 */
  updateVariantStock(colorName: string, sizeName: string, stock: number): void {
    // Actualizar en la matriz visual
    this.variantsMatrix.forEach(row => {
      if (row.size === sizeName) {
        row.colorVariants.forEach(variant => {
          if (variant.colorName === colorName) {
            variant.stock = stock;
          }
        });
      }
    });

    // Actualizar en el formulario para envío posterior
    const sizeIndex = this.getSizeIndexByName(sizeName);
    if (sizeIndex !== -1) {
      this.updateColorStock(sizeIndex, colorName, stock);
    }

    // Recalcular stock total
    this.updateTotalStock();
  }

  // Añadir este método para generar un SKU
  generateSku(): string {
    const form = this.productForm.value;

    // Obtener iniciales de la categoría
    const category = this.categories.find(c => c.id === form.category);
    const categoryCode = category ?
      category.name.substring(0, 3).toUpperCase() : 'CAT';

    // Obtener iniciales del nombre del producto (primeras 3 letras)
    const productCode = form.name ?
      form.name.substring(0, 3).toUpperCase() : 'PRD';

    // Crear un número aleatorio/secuencial (puedes implementar una secuencia más sofisticada)
    const serialNumber = Math.floor(1000 + Math.random() * 9000);

    // Formar el SKU
    return `${categoryCode}-${productCode}-${serialNumber}`;
  }

  generateVariantSku(baseSku: string, colorName: string, sizeName: string): string {
    // Obtener iniciales del color
    const colorCode = colorName.substring(0, 2).toUpperCase();

    // Formar el SKU de variante
    return `${baseSku}-${colorCode}${sizeName}`;
  }

  listenToAutoGenerateSkuChanges(): void {
    // Escuchar cambios en la propiedad autoGenerateSku
    this.productForm.get('sku')?.setValidators(
      this.autoGenerateSku ? [] : [Validators.required]
    );
    this.productForm.get('sku')?.updateValueAndValidity();
  }

  // Llamar a este método cuando cambie el valor del checkbox
  onAutoGenerateSkuChange(value: boolean): void {
    this.autoGenerateSku = value;
    // Actualizar el validador
    this.productForm.get('sku')?.setValidators(
      this.autoGenerateSku ? [] : [Validators.required]
    );
    this.productForm.get('sku')?.updateValueAndValidity();
  }

  // Añadir este método para generar un código EAN-13
  generateEan13(): string {
    // EAN-13 comienza con un prefijo de país (asumamos 560 para Ecuador)
    let ean = '560';

    // Agregar 9 dígitos aleatorios
    for (let i = 0; i < 9; i++) {
      ean += Math.floor(Math.random() * 10).toString();
    }

    // Calcular dígito de verificación
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(ean[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;

    // Añadir dígito de verificación
    ean += checkDigit;

    return ean;
  }

}