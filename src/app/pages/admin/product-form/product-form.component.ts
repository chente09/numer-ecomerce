import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ProductService } from '../../../services/admin/product/product.service';
import { Category } from '../../../services/admin/category/category.service';
import { Product, Color, Size,AdditionalImageItem, } from '../../../models/models';
import { finalize, take } from 'rxjs';

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
import { ProductInventoryService } from '../../../services/admin/inventario/product-inventory.service';

// 🚀 Interfaces para actualización optimista
interface ProductBackup {
  originalProduct: Product;
  timestamp: number;
}

interface OptimisticProductUpdate {
  type: 'create' | 'update';
  productId: string;
  backup?: ProductBackup;
  changes: Partial<Product>;
}

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
    NzRadioModule,
  ],
  templateUrl: './product-form.component.html',
  styleUrls: ['./product-form.component.css'],
})
export class ProductFormComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() product: Product | null = null;
  @Input() isEditMode = false;
  @Input() categories: Category[] = [];
  @Input() existingColors: Color[] = [];
  @Input() existingSizes: Size[] = [];

  @Output() formSubmitted = new EventEmitter<{
    success: boolean;
    action: string;
    productId: string;
    requiresReload?: boolean;
    optimisticUpdate?: Product; // 🚀 NUEVO: Enviar producto actualizado optimísticamente
  }>();
  @Output() formCancelled = new EventEmitter<void>();

  // 🚀 Control de operaciones optimistas
  private pendingOperation: OptimisticProductUpdate | null = null;

  // Opciones predefinidas de tecnologías
  technologiesOptions: { label: string; value: string }[] = [
    { label: 'Secado Rápido', value: 'secado_rapido' },
    { label: 'Protección UV', value: 'proteccion_uv' },
    { label: 'Anti-transpirante', value: 'anti_transpirante' },
    { label: 'Impermeable', value: 'impermeable' },
    { label: 'Transpirable', value: 'transpirable' },
    { label: 'Anti-bacterial', value: 'anti_bacterial' },
    { label: 'Térmico', value: 'termico' },
    { label: 'Elástico', value: 'elastico' },
    { label: 'Resistente al viento', value: 'resistente_viento' },
    { label: 'Sin costuras', value: 'sin_costuras' },
  ];

  newTechnology: string = '';

  private getSizeOrder(): { [key: string]: number } {
    return {
      XXS: 1,
      XS: 2,
      S: 3,
      M: 4,
      L: 5,
      XL: 6,
      XXL: 7,
      XXXL: 8,
      // Variaciones comunes
      '2XS': 1,
      '2XL': 7,
      '3XL': 8,
      // Tallas numéricas (para ropa infantil o zapatos)
      '28': 10,
      '30': 11,
      '32': 12,
      '34': 13,
      '36': 14,
      '38': 15,
      '40': 16,
      '42': 17,
      '44': 18,
      '46': 19,
      '48': 20,
      '50': 21,
    };
  }

  variantsMatrix: {
    size: string;
    colorVariants: {
      colorName: string;
      sizeName: string;
      stock: number;
      key: string;
    }[];
  }[] = [];

  productForm: FormGroup = new FormGroup({});
  submitting = false;
  totalStock: number = 0;
  showVariantsMatrix = false;
  autoGenerateSku = true;
  autoGenerateBarcode = true;
  additionalImages: AdditionalImageItem[] = [];
  imagesToDelete: string[] = [];
  maxAdditionalImages: number = 5;
  productFeatures: string[] = [];
  newFeature: string = '';

  // Predefinidos
  seasons: string[] = [
    'Spring 2025',
    'Summer 2025',
    'Fall 2025',
    'Winter 2025',
  ];
  collections: string[] = ['Casual', 'Formal', 'Sport', 'Limited Edition'];
  genderOptions = [
    { label: 'Hombre', value: 'man' },
    { label: 'Mujer', value: 'woman' },
    { label: 'Niño', value: 'boy' },
    { label: 'Niña', value: 'girl' },
    { label: 'Unisex', value: 'unisex' },
  ];

  // Imágenes
  mainImageUrl?: string;
  mainImageFile?: File;
  colorImages: Map<string, { file: File; url: string }> = new Map();
  sizeImages: Map<string, { file: File; url: string }> = new Map();
  variantImages: Map<string, { file: File; url: string }> = new Map();

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef,
    private inventoryService: ProductInventoryService
  ) { }

  ngOnInit(): void {
    this.initProductForm();
  }

  ngAfterViewInit(): void {
    // ✅ Solo una ejecución, con mejor timing
    this.setupFormListeners();
  }

  private setupFormListeners(): void {
    this.listenToStockChanges();
    this.createVariantsMatrix();

    // 🆕 NUEVO: Listener para auto-generar model
    this.productForm.get('name')?.valueChanges.subscribe(nameValue => {
      const modelValue = this.productForm.get('model')?.value;

      // Solo auto-generar si model está vacío y no estamos en modo edición
      if (nameValue && !modelValue && !this.isEditMode) {
        const cleanModel = nameValue
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        this.productForm.get('model')?.setValue(cleanModel);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product']?.currentValue) {
      if (!this.productForm) {
        this.initProductForm();
      }

      setTimeout(() => {
        if (this.product) {
          this.populateForm();
        }
      }, 0);
    }
  }

  initProductForm(): void {
    this.productForm = this.fb.group({
      name: ['', [Validators.required]],
      model: ['', [Validators.required]],
      price: [0, [Validators.required, Validators.min(0)]],
      distributorCost: [0, [Validators.required, Validators.min(0)]],
      categories: [[], [Validators.required]],
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
      technologies: [[], []],
      colors: this.fb.array([]),
      sizes: this.fb.array([]),
    });

    if (!this.productForm.get('colors')) {
      this.productForm.setControl('colors', this.fb.array([]));
    }

    if (!this.productForm.get('sizes')) {
      this.productForm.setControl('sizes', this.fb.array([]));
    }

    this.listenToAutoGenerateSkuChanges();
  }

  // ==================== GESTIÓN DE COLORES ====================
  get colorForms(): FormArray {
    if (!this.productForm) {
      this.initProductForm();
    }
    return (this.productForm.get('colors') as FormArray) || this.fb.array([]);
  }

  get colorFormsControls(): FormGroup[] {
    return this.colorForms.controls as FormGroup[];
  }

  addColor(): void {
    const colorForm = this.fb.group({
      name: ['', [Validators.required]],
      code: ['#000000', [Validators.required]],
      imageUrl: [''],
    });

    // Para FormArray, usar insert() en la posición 0 (inicio)
    this.colorForms.insert(0, colorForm);

    // Recrear la matriz de variantes
    this.createVariantsMatrix();

    // Scroll suave hacia el nuevo color agregado
    setTimeout(() => {
      this.scrollToNewColor();
    }, 100);
  }

  // AGREGA este método auxiliar para el scroll automático:

  private scrollToNewColor(): void {
    // Primero, forzar detección de cambios para asegurar que el DOM se actualice
    this.cdr.detectChanges();

    // Usar un timeout más largo para garantizar que el DOM esté listo
    setTimeout(() => {
      // Buscar el contenedor de scroll
      const colorContainer = document.querySelector('.color-container');
      if (colorContainer) {
        // Hacer scroll al top del contenedor
        colorContainer.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      }

      // Buscar el primer elemento de color
      const colorElements = document.querySelectorAll('.color-item');
      if (colorElements.length > 0) {
        const firstColorElement = colorElements[0] as HTMLElement;

        // Agregar resaltado temporal
        firstColorElement.classList.add('new-color-highlight');

        // Remover el resaltado después de 2 segundos
        setTimeout(() => {
          firstColorElement.classList.remove('new-color-highlight');
        }, 2000);

        // Log para debugging
        console.log('✅ Nuevo color agregado y resaltado aplicado');
      }
    }, 150); // Aumentar el timeout a 150ms
  }

  removeColor(index: number): void {
    const colorName = this.colorForms.at(index).get('name')?.value;
    if (colorName && this.colorImages.has(colorName)) {
      this.colorImages.delete(colorName);
    }
    this.colorForms.removeAt(index);
    this.createVariantsMatrix();
  }

  // ==================== GESTIÓN DE TALLAS ====================
  get sizeForms(): FormArray {
    if (!this.productForm) {
      this.initProductForm();
    }
    return (this.productForm.get('sizes') as FormArray) || this.fb.array([]);
  }

  get sizeFormsControls(): FormGroup[] {
    return this.sizeForms.controls as FormGroup[];
  }

  addSize(): void {
    const sizeForm = this.fb.group({
      name: ['', [Validators.required]],
      stock: [0, [Validators.required, Validators.min(0)]],
      imageUrl: [''],
      colorStocks: this.fb.array([]),
    });
    this.sizeForms.push(sizeForm);
    this.createVariantsMatrix();
  }

  removeSize(index: number): void {
    const sizeName = this.sizeForms.at(index).get('name')?.value;
    if (sizeName && this.sizeImages.has(sizeName)) {
      this.sizeImages.delete(sizeName);
    }
    this.sizeForms.removeAt(index);
    this.createVariantsMatrix();
  }

  // ==================== GESTIÓN DE STOCK POR COLOR ====================
  getColorStockForms(sizeIndex: number): FormArray {
    if (!this.productForm) {
      this.initProductForm();
    }

    const sizesFormArray = this.productForm.get('sizes') as FormArray;
    if (
      !sizesFormArray ||
      sizeIndex < 0 ||
      sizeIndex >= sizesFormArray.length
    ) {
      console.warn(`Índice de talla inválido: ${sizeIndex}`);
      return this.fb.array([]);
    }

    const sizeForm = sizesFormArray.at(sizeIndex);
    if (!sizeForm) {
      console.warn(`No se encontró la talla en el índice: ${sizeIndex}`);
      return this.fb.array([]);
    }

    const colorStocks = sizeForm.get('colorStocks');
    if (!colorStocks) {
      const newColorStocks = this.fb.array([]);
      (sizeForm as FormGroup).setControl('colorStocks', newColorStocks);
      return newColorStocks;
    }

    return colorStocks as FormArray;
  }

  addColorStock(sizeIndex: number, colorName: string): void {
    const colorStockForm = this.fb.group({
      colorName: [colorName, [Validators.required]],
      quantity: [0, [Validators.required, Validators.min(0)]],
    });
    this.getColorStockForms(sizeIndex).push(colorStockForm);
  }

  removeColorStock(sizeIndex: number, colorStockIndex: number): void {
    this.getColorStockForms(sizeIndex).removeAt(colorStockIndex);
  }

  updateColorStock(
    sizeIndex: number,
    colorName: string,
    quantity: number
  ): void {
    const colorStocks = this.getColorStockForms(sizeIndex);
    const existingIndex = colorStocks.controls.findIndex(
      (control) => control.get('colorName')?.value === colorName
    );

    if (existingIndex >= 0) {
      colorStocks.at(existingIndex).patchValue({ quantity });
    } else {
      this.addColorStock(sizeIndex, colorName);
      colorStocks.at(colorStocks.length - 1).patchValue({ quantity });
    }
  }

  getColorStockValue(sizeIndex: number, colorName: string): number {
    const colorStocks = this.getColorStockForms(sizeIndex);
    const colorStock = colorStocks.controls.find(
      (control) => control.get('colorName')?.value === colorName
    );
    return colorStock ? colorStock.get('quantity')?.value : 0;
  }

  // ==================== AGREGAR COLORES/TALLAS EXISTENTES ====================
  addExistingColor(color: Color): void {
    if (!color || !color.name) {
      console.warn('Intentando agregar un color inválido');
      return;
    }

    // Verificar si el color ya existe
    const exists = this.colorForms.controls.some(
      (control) => (control as FormGroup).get('name')?.value === color.name
    );

    if (!exists) {
      console.log('🎨 Agregando color existente:', color.name);
      console.log('📊 Colores antes:', this.colorForms.length);

      const colorForm = this.fb.group({
        name: [color.name, [Validators.required]],
        code: [color.code || '#000000', [Validators.required]],
        imageUrl: [color.imageUrl || ''],
      });

      // 🚀 CAMBIO PRINCIPAL: Usar insert(0) en lugar de push()
      this.colorForms.insert(0, colorForm);
      console.log('📊 Colores después:', this.colorForms.length);

      // Agregar imagen si existe
      if (color.imageUrl) {
        this.colorImages.set(color.name, {
          file: new File([], ''),
          url: color.imageUrl,
        });
      }

      // Recrear matriz de variantes
      this.createVariantsMatrix();

      // 🚀 SCROLL AUTOMÁTICO hacia el nuevo color
      setTimeout(() => {
        console.log('🎯 Ejecutando scroll para color existente...');
        this.scrollToNewColor();
      }, 100);

      // Mensaje de éxito
      this.message.success(`Color ${color.name} agregado`);

      // Forzar detección de cambios
      this.cdr.detectChanges();

      console.log('✅ Color existente agregado correctamente');
    } else {
      this.message.info(`El color ${color.name} ya está agregado`);
    }
  }

  addExistingSize(size: Size): void {
    const exists = this.sizeForms.controls.some(
      (control) => (control as FormGroup).get('name')?.value === size.name
    );

    if (!exists) {
      console.log('📏 Agregando talla existente:', size.name);

      const sizeForm = this.fb.group({
        name: [size.name, [Validators.required]],
        stock: [size.stock || 0, [Validators.required, Validators.min(0)]],
        imageUrl: [size.imageUrl || ''],
        colorStocks: this.fb.array([]),
      });

      // 🚀 También usar insert(0) para tallas si quieres consistencia
      this.sizeForms.insert(0, sizeForm);

      if (size.imageUrl) {
        this.sizeImages.set(size.name, {
          file: new File([], ''),
          url: size.imageUrl,
        });
      }

      this.createVariantsMatrix();

      // Scroll automático para tallas también
      setTimeout(() => {
        const sizeContainer = document.querySelector('.size-container'); // Si tienes un contenedor similar para tallas
        if (sizeContainer) {
          sizeContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);

      this.message.success(`Talla ${size.name} agregada`);
    } else {
      this.message.info(`La talla ${size.name} ya está agregada`);
    }
  }

  // ==================== GESTIÓN DE IMÁGENES ADICIONALES ====================
  onAdditionalImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const files = Array.from(input.files);

      // Verificar límite total
      const currentCount = this.additionalImages.filter(
        (img) => !img.toDelete
      ).length;
      if (currentCount + files.length > this.maxAdditionalImages) {
        this.message.warning(
          `Solo puede subir un máximo de ${this.maxAdditionalImages} imágenes adicionales.`
        );
        return;
      }

      // Procesar cada archivo
      files.forEach((file) => {
        if (!file.type.startsWith('image/')) {
          this.message.error(`${file.name} no es una imagen válida`);
          return;
        }

        if (file.size > 5 * 1024 * 1024) {
          // 5MB límite
          this.message.error(`${file.name} supera el límite de 5MB`);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const newImage: AdditionalImageItem = {
            file: file,
            url: reader.result as string,
            id: `new_${Date.now()}_${Math.random()
              .toString(36)
              .substring(2, 9)}`,
            isExisting: false,
            toDelete: false,
          };

          this.additionalImages.push(newImage);
          this.cdr.detectChanges();

          console.log('✅ Nueva imagen agregada:', newImage.id);
        };

        reader.onerror = (error) => {
          console.error('❌ Error al leer archivo:', error);
          this.message.error(`Error al procesar ${file.name}`);
        };

        reader.readAsDataURL(file);
      });

      // Limpiar el input
      input.value = '';
    }
  }

  removeAdditionalImage(index: number): void {
    const image = this.additionalImages[index];

    if (!image) {
      console.warn('⚠️ Imagen no encontrada en índice:', index);
      return;
    }

    if (image.isExisting) {
      // 🔥 Imagen existente: marcar para eliminar de Firebase
      image.toDelete = true;
      this.imagesToDelete.push(image.url);

      console.log('🗑️ Imagen marcada para eliminar de Firebase:', {
        url: image.url,
        id: image.id,
      });

      this.message.info(
        'Imagen marcada para eliminar (se eliminará al guardar)'
      );
    } else {
      // 🆕 Imagen nueva: eliminar inmediatamente del array
      this.additionalImages.splice(index, 1);

      console.log('✅ Nueva imagen eliminada inmediatamente:', image.id);
    }

    this.cdr.detectChanges();
  }

  restoreAdditionalImage(index: number): void {
    const image = this.additionalImages[index];

    if (image && image.isExisting && image.toDelete) {
      image.toDelete = false;

      // Remover de la lista de eliminación
      const urlIndex = this.imagesToDelete.indexOf(image.url);
      if (urlIndex > -1) {
        this.imagesToDelete.splice(urlIndex, 1);
      }

      this.message.success('Imagen restaurada');
      this.cdr.detectChanges();
    }
  }

  // ==================== GESTIÓN DE CARACTERÍSTICAS ====================
  addFeature(): void {
    if (this.newFeature.trim()) {
      this.productFeatures.push(this.newFeature.trim());
      this.newFeature = '';
      this.cdr.detectChanges();
    }
  }

  removeFeature(index: number): void {
    this.productFeatures.splice(index, 1);
    this.cdr.detectChanges();
  }

  // ==================== POBLADO DE FORMULARIO ====================
  populateForm(): void {
    if (!this.product) {
      console.warn('Intentando poblar el formulario sin producto');
      return;
    }

    if (!this.productForm) {
      this.initProductForm();
    }

    this.resetForm();
    this.mainImageUrl = this.product.imageUrl;

    const patchData = {
      name: this.product.name || '',
      model: this.product.model || this.product.name || '',
      price: this.product.price || 0,
      distributorCost: this.product.distributorCost || 0, 
      categories:
        this.product.categories ||
        (this.product.category ? [this.product.category] : []),
      description: this.product.description || '',
      sku: this.product.sku || '',
      barcode: this.product.barcode || '',
      season: this.product.season || '',
      collection: this.product.collection || '',
      gender: this.product.gender || 'unisex',
      isNew: this.product.isNew === undefined ? true : this.product.isNew,
      isBestSeller:
        this.product.isBestSeller === undefined
          ? false
          : this.product.isBestSeller,
      metaTitle: this.product.metaTitle || '',
      metaDescription: this.product.metaDescription || '',
      searchKeywords: this.product.searchKeywords?.join(', ') || '',
      tags: this.product.tags?.join(', ') || '',
      technologies: this.product.technologies || [],
    };
    this.productForm.patchValue(patchData);

    // Agregar colores
    if (this.product.colors && this.product.colors.length > 0) {
      this.product.colors.forEach((color) => {
        const colorForm = this.fb.group({
          name: [color.name || '', [Validators.required]],
          code: [color.code || '#000000', [Validators.required]],
          imageUrl: [color.imageUrl || ''],
        });
        this.colorForms.push(colorForm);

        if (color.imageUrl) {
          this.colorImages.set(color.name, {
            file: new File([], ''),
            url: color.imageUrl,
          });
        }
      });
    }

    // Agregar tamaños
    if (this.product.sizes && this.product.sizes.length > 0) {
      this.product.sizes.forEach((size) => {
        const sizeForm = this.fb.group({
          name: [size.name || '', [Validators.required]],
          stock: [size.stock || 0, [Validators.required, Validators.min(0)]],
          imageUrl: [size.imageUrl || ''],
          colorStocks: this.fb.array([]),
        });
        this.sizeForms.push(sizeForm);

        if (size.imageUrl) {
          this.sizeImages.set(size.name, {
            file: new File([], ''),
            url: size.imageUrl,
          });
        }

        if (size.colorStocks && size.colorStocks.length > 0) {
          const colorStocksForm = sizeForm.get('colorStocks') as FormArray;
          size.colorStocks.forEach((colorStock) => {
            const colorStockForm = this.fb.group({
              colorName: [colorStock.colorName || '', [Validators.required]],
              quantity: [
                colorStock.quantity || 0,
                [Validators.required, Validators.min(0)],
              ],
            });
            colorStocksForm.push(colorStockForm);
          });
        }
      });
    }

    // Guardar imágenes de variantes
    if (
      this.product.variants &&
      Array.isArray(this.product.variants) &&
      this.product.variants.length > 0
    ) {
      this.product.variants.forEach((variant) => {
        if (variant.imageUrl && variant.imageUrl !== this.product?.imageUrl) {
          const key = `${variant.colorName}-${variant.sizeName}`;
          this.variantImages.set(key, {
            file: new File([], ''),
            url: variant.imageUrl,
          });
        }
      });
    }

    // 🔄 CARGAR IMÁGENES ADICIONALES EXISTENTES - CORREGIDO
    this.additionalImages = [];
    this.imagesToDelete = [];

    if (
      this.product.additionalImages &&
      this.product.additionalImages.length > 0
    ) {
      this.additionalImages = this.product.additionalImages.map(
        (url: string): AdditionalImageItem => ({
          url: url,
          id: `existing_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          isExisting: true,
          toDelete: false,
          file: undefined,
        })
      );

      console.log(
        '📷 Imágenes adicionales cargadas:',
        this.additionalImages.length
      );
    }

    // Cargar características
    if (this.product?.features && this.product.features.length > 0) {
      this.productFeatures = [...this.product.features];
    }

    this.createVariantsMatrix();
    this.cdr.detectChanges();
  }

  /**
   * 🆕 NUEVO: Obtener imágenes que se mantendrán
   */
  getValidAdditionalImages(): AdditionalImageItem[] {
    return this.additionalImages.filter((img) => !img.toDelete);
  }

  /**
   * 🆕 NUEVO: Obtener solo archivos nuevos para subir
   */
  getNewImageFiles(): File[] {
    return this.additionalImages
      .filter((img) => !img.isExisting && !img.toDelete && img.file)
      .map((img) => img.file!);
  }

  // ==================== TECNOLOGÍAS ====================
  addCustomTechnology(): void {
    if (!this.newTechnology.trim()) {
      return;
    }

    const value =
      'custom_' + this.newTechnology.toLowerCase().replace(/\s+/g, '_');

    const exists = this.technologiesOptions.some(
      (tech) => tech.value === value
    );
    if (!exists) {
      this.technologiesOptions.push({
        label: this.newTechnology.trim(),
        value: value,
      });

      this.technologiesOptions.sort((a, b) => a.label.localeCompare(b.label));
    }

    const currentTechnologies =
      this.productForm.get('technologies')?.value || [];
    if (!currentTechnologies.includes(value)) {
      this.productForm
        .get('technologies')
        ?.setValue([...currentTechnologies, value]);
    }

    this.newTechnology = '';
  }

  getTechnologyLabel(value: string): string {
    const tech = this.technologiesOptions.find((t) => t.value === value);
    return tech ? tech.label : value;
  }

  removeTechnology(techValue: string): void {
    const currentTechnologies =
      this.productForm.get('technologies')?.value || [];
    const updatedTechnologies = currentTechnologies.filter(
      (value: string) => value !== techValue
    );
    this.productForm.get('technologies')?.setValue(updatedTechnologies);
  }

  // ==================== RESET Y MANEJO DE IMÁGENES ====================
  resetForm(): void {
    if (!this.productForm) {
      this.initProductForm();
    }

    this.productForm.reset();

    if (this.productForm.get('colors')) {
      const colorForms = this.productForm.get('colors') as FormArray;
      while (colorForms.length > 0) {
        colorForms.removeAt(0);
      }
    }

    if (this.productForm.get('sizes')) {
      const sizeForms = this.productForm.get('sizes') as FormArray;
      while (sizeForms.length > 0) {
        sizeForms.removeAt(0);
      }
    }

    this.productForm.patchValue({
      price: 0,
      model: '',
      isNew: true,
      isBestSeller: false,
      technologies: [],
      categories: [],
      gender: 'unisex',
    });

    this.resetImages();
  }

  generateModelFromName(): void {
    const nameValue = this.productForm.get('name')?.value;
    const modelValue = this.productForm.get('model')?.value;

    // Solo auto-generar si el campo model está vacío
    if (nameValue && !modelValue) {
      // Limpiar el nombre para crear un model más limpio
      const cleanModel = nameValue
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '') // Remover caracteres especiales
        .replace(/\s+/g, ' ') // Normalizar espacios
        .trim();

      this.productForm.get('model')?.setValue(cleanModel);
    }
  }


  resetImages(): void {
    this.mainImageUrl = undefined;
    this.mainImageFile = undefined;
    this.colorImages.clear();
    this.sizeImages.clear();
    this.variantImages.clear();
    this.additionalImages = [];
    this.imagesToDelete = [];
  }

  // ==================== MANEJO DE IMÁGENES ====================
  onMainImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const file = input.files[0];
      this.mainImageFile = file;

      const reader = new FileReader();
      reader.onload = () => {
        this.mainImageUrl = reader.result as string;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  openColorImageInput(colorIndex: number): void {
    const inputElement = document.getElementById(
      `colorInput_${colorIndex}`
    ) as HTMLInputElement;
    if (inputElement) {
      inputElement.click();
    }
  }

  onColorImageChange(event: Event, colorName: string): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const file = input.files[0];

      if (!file.type.startsWith('image/')) {
        this.message.error('Por favor seleccione un archivo de imagen válido');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        this.message.error('La imagen no debe superar los 5MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        this.colorImages.set(colorName, {
          file: file,
          url: reader.result as string,
        });

        this.cdr.detectChanges();
      };

      reader.onerror = (error) => {
        console.error('❌ [FORM] Error al leer archivo:', error);
        this.message.error('Error al procesar la imagen');
      };

      reader.readAsDataURL(file);
    }
  }

  onSizeImageChange(event: Event, sizeName: string): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const file = input.files[0];

      const reader = new FileReader();
      reader.onload = () => {
        this.sizeImages.set(sizeName, {
          file: file,
          url: reader.result as string,
        });
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  onVariantImageChange(
    event: Event,
    colorName: string,
    sizeName: string
  ): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const file = input.files[0];
      const key = `${colorName}-${sizeName}`;

      const reader = new FileReader();
      reader.onload = () => {
        this.variantImages.set(key, {
          file: file,
          url: reader.result as string,
        });

        this.cdr.detectChanges();
      };

      reader.onerror = (error) => {
        console.error(`❌ [FORM] Error al leer archivo:`, error);
      };

      reader.readAsDataURL(file);
    }
  }

  // 🚀 ==================== ENVÍO DE FORMULARIO CON ACTUALIZACIÓN OPTIMISTA ====================
  submitForm(): void {
    if (this.productForm.invalid) {
      Object.values(this.productForm.controls).forEach((control) => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      this.message.warning('Por favor, corrija los errores en el formulario.');
      return;
    }

    if (!this.isEditMode && !this.mainImageFile) {
      this.message.warning(
        'Debe seleccionar una imagen principal para el producto.'
      );
      return;
    }

    const formData = this.productForm.value;

    // Generar SKU y código de barras si es necesario
    if (this.autoGenerateSku && !formData.sku) {
      formData.sku = this.generateSku();
      this.productForm.get('sku')?.setValue(formData.sku);
    }

    if (this.autoGenerateBarcode && !formData.barcode) {
      formData.barcode = this.generateEan13();
      this.productForm.get('barcode')?.setValue(formData.barcode);
    }

    this.submitting = true;

    try {
      const tags = formData.tags
        ? formData.tags
          .split(',')
          .map((tag: string) => tag.trim())
          .filter(Boolean)
        : [];
      const searchKeywords = formData.searchKeywords
        ? formData.searchKeywords
          .split(',')
          .map((kw: string) => kw.trim())
          .filter(Boolean)
        : [];

      // Crear objeto de producto
      const productData: Omit<Product, 'id'> = {
        name: formData.name,
        model: formData.model || formData.name,
        price: formData.price,
        distributorCost: formData.distributorCost,
        categories: formData.categories || [],
        category:
          formData.categories && formData.categories.length > 0
            ? formData.categories[0]
            : '',
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
        technologies: formData.technologies || [],
        rating: this.product?.rating || 5,
        totalStock: this.calculateTotalStock(), // 🚀 Calcular stock optimísticamente
        views: this.product?.views || 0,
        sales: this.product?.sales || 0,
        imageUrl: this.mainImageUrl || this.product?.imageUrl || '',
        additionalImages: this.product?.additionalImages || [],
        variants: this.product?.variants || [],
        features: this.productFeatures,
      };

      // 🚀 ACTUALIZACIÓN OPTIMISTA ANTES DE ENVIAR AL SERVIDOR
      if (this.isEditMode && this.product) {
        this.applyOptimisticUpdate(productData);
      }

      const colorImagesMap = new Map<string, File>();
      this.colorImages.forEach((value, key) => {
        if (value.file && value.file.size > 0) {
          colorImagesMap.set(key, value.file);
        }
      });

      const sizeImagesMap = new Map<string, File>();
      this.sizeImages.forEach((value, key) => {
        if (value.file && value.file.size > 0) {
          sizeImagesMap.set(key, value.file);
        }
      });

      const variantImagesMap = new Map<string, File>();
      this.variantImages.forEach((value, key) => {
        if (value.file && value.file.size > 0) {
          variantImagesMap.set(key, value.file);
        }
      });

      const newImageFiles = this.getNewImageFiles();
      const validImages = this.getValidAdditionalImages();

      if (!this.isEditMode) {
        // ==================== CREAR PRODUCTO ====================
        this.productService.createProduct(
          productData,
          formData.colors,
          formData.sizes,
          this.mainImageFile!,
          colorImagesMap,
          sizeImagesMap,
          variantImagesMap,
          newImageFiles
        )
          .pipe(take(1), finalize(() => (this.submitting = false)))
          .subscribe({
            next: (id) => {
              this.message.success(
                `Producto creado correctamente con ID: ${id}`
              );
              this.resetForm();

              // 🚀 Crear producto optimista para enviar al componente padre
              const newProduct: Product = {
                id,
                ...productData,
              };

              this.formSubmitted.emit({
                success: true,
                action: 'create',
                productId: id,
                requiresReload: true,
                optimisticUpdate: newProduct, // 🚀 Enviar producto creado
              });
            },
            error: (error) => {
              console.error('❌ [FORM] Error al crear producto:', error);
              this.message.error(
                'Error al crear producto: ' +
                (error.message || 'Error desconocido')
              );
            },
          });
      } else {
        // ==================== ACTUALIZAR PRODUCTO ====================

        // 🔄 PREPARAR DATOS PARA ACTUALIZACIÓN
        const existingImageUrls = validImages
          .filter((img) => img.isExisting)
          .map((img) => img.url);

        const updatedProductData = {
          ...productData,
          additionalImages: existingImageUrls, // URLs que se mantienen
        };

        this.productService
          .updateProduct(
            this.product!.id,
            updatedProductData,
            this.mainImageFile || undefined,
            newImageFiles,
            colorImagesMap,
            sizeImagesMap,
            variantImagesMap
          )
          .pipe(finalize(() => (this.submitting = false)))
          .subscribe({
            next: () => {
              this.deleteRemovedImages();
              this.message.success('Producto actualizado correctamente');

              this.syncStockAfterUpdate(this.product!.id);

              // ✅ La actualización optimista ya se aplicó antes del envío
              this.confirmOptimisticUpdate();

              this.formSubmitted.emit({
                success: true,
                action: 'update',
                productId: this.product!.id,
                requiresReload: false, // 🚀 No necesita reload, ya está actualizado optimísticamente
                optimisticUpdate: this.pendingOperation?.changes as Product, // 🚀 Enviar cambios aplicados
              });
            },
            error: (error) => {
              console.error('❌ [FORM] Error al actualizar producto:', error);

              // 🔄 ROLLBACK: Revertir cambios optimistas
              this.rollbackOptimisticUpdate();

              this.message.error(
                'Error al actualizar producto: ' +
                (error.message || 'Error desconocido')
              );

              this.formSubmitted.emit({
                success: false,
                action: 'update',
                productId: this.product!.id,
              });
            },
          });
      }
    } catch (error: any) {
      this.submitting = false;
      console.error('💥 [FORM] Error en submitForm:', error);
      this.message.error(
        'Error al ' +
        (this.isEditMode ? 'actualizar' : 'crear') +
        ' producto: ' +
        (error.message || 'Error desconocido')
      );
    }
  }

  /**
 * 🚀 NUEVO: Sincroniza stock después de actualizar
 */
  private syncStockAfterUpdate(productId: string): void {
    console.log(`🔄 [FORM] Sincronizando stock para: ${productId}`);

    // Usar el método existente del inventoryService
    this.inventoryService.getVariantsByProductId(productId)
      .pipe(take(1))
      .subscribe({
        next: (variants) => {
          console.log('✅ [FORM] Variantes actualizadas:', variants.length);
          // Opcional: Mostrar mensaje de confirmación
          this.message.info('Stock sincronizado correctamente');
        },
        error: (error) => {
          console.error('❌ [FORM] Error sincronizando stock:', error);
          this.message.warning('Producto actualizado, pero revise el stock manualmente');
        }
      });
  }

  private deleteRemovedImages(): void {
    if (this.imagesToDelete.length === 0) {
      console.log('🔍 No hay imágenes para eliminar');
      return;
    }

    console.log('🔥 Eliminando imágenes de Firebase:', this.imagesToDelete);

    // Usar el servicio de imágenes para eliminar
    this.imagesToDelete.forEach(async (imageUrl) => {
      try {
        // Aquí necesitas llamar al método de eliminación de imágenes
        // Esto depende de tu ProductImageService
        await this.productService.deleteImage(imageUrl);
        console.log('✅ Imagen eliminada de Firebase:', imageUrl);
      } catch (error) {
        console.error('❌ Error al eliminar imagen:', imageUrl, error);
      }
    });

    // Limpiar la lista
    this.imagesToDelete = [];
  }

  // 🚀 ==================== MÉTODOS DE ACTUALIZACIÓN OPTIMISTA ====================

  /**
   * Aplica cambios optimísticamente antes de enviar al servidor
   */
  private applyOptimisticUpdate(newProductData: Omit<Product, 'id'>): void {
    if (!this.product) return;

    // Crear backup del producto original
    const backup: ProductBackup = {
      originalProduct: { ...this.product },
      timestamp: Date.now(),
    };

    // Crear producto actualizado
    const updatedProduct: Product = {
      ...this.product,
      ...newProductData,
      id: this.product.id, // Mantener el ID original
    };

    // Registrar operación pendiente
    this.pendingOperation = {
      type: 'update',
      productId: this.product.id,
      backup,
      changes: updatedProduct,
    };

    console.log('✅ [FORM] Actualización optimista aplicada:', {
      productId: this.product.id,
      oldStock: this.product.totalStock,
      newStock: updatedProduct.totalStock,
      oldName: this.product.name,
      newName: updatedProduct.name,
    });
  }

  /**
   * Confirma la actualización optimista (el servidor confirmó los cambios)
   */
  private confirmOptimisticUpdate(): void {
    if (this.pendingOperation) {
      this.pendingOperation = null;
    }
  }

  /**
   * Revierte la actualización optimista (el servidor rechazó los cambios)
   */
  private rollbackOptimisticUpdate(): void {
    if (this.pendingOperation && this.pendingOperation.backup) {
      // Restaurar producto original
      this.product = { ...this.pendingOperation.backup.originalProduct };

      // Repoblar formulario con datos originales
      this.populateForm();

      this.pendingOperation = null;
    }
  }

  cancelForm(): void {
    // Si hay una operación pendiente, hacer rollback
    if (this.pendingOperation) {
      this.rollbackOptimisticUpdate();
    }

    this.formCancelled.emit();
  }

  // ==================== CÁLCULO DE STOCK ====================
  calculateTotalStock(): number {
    let total = 0;

    // Recalcular basado en colorStocks (fuente de verdad)
    for (let i = 0; i < this.sizeForms.length; i++) {
      const colorStocks = this.getColorStockForms(i);
      for (let j = 0; j < colorStocks.length; j++) {
        const quantity = colorStocks.at(j).get('quantity')?.value || 0;
        total += quantity;
      }
    }

    console.log(`📊 [FORM] Stock total calculado: ${total}`);
    return total;
  }

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

  // ==================== MATRIZ DE VARIANTES ====================

  private sortSizesByStandardOrder(sizes: string[]): string[] {
    const sizeOrder = this.getSizeOrder();

    return sizes.sort((a, b) => {
      const aUpper = a.toUpperCase();
      const bUpper = b.toUpperCase();

      const orderA = sizeOrder[aUpper] || 999; // Si no existe, va al final
      const orderB = sizeOrder[bUpper] || 999;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // Si tienen el mismo orden, ordenar alfabéticamente
      return a.localeCompare(b);
    });
  }

  createVariantsMatrix(): void {
    this.variantsMatrix = [];

    if (this.colorForms.length === 0 || this.sizeForms.length === 0) {
      this.showVariantsMatrix = false;
      return;
    }

    const colors = this.colorForms.controls
      .map((control) => (control as FormGroup).get('name')?.value)
      .filter(Boolean);

    const sizes = this.sizeForms.controls
      .map((control) => (control as FormGroup).get('name')?.value)
      .filter(Boolean);

    // 🚀 ORDENAR TALLAS según el estándar
    const sortedSizes = this.sortSizesByStandardOrder(sizes);

    sortedSizes.forEach((sizeName) => {
      const sizeIndex = this.getSizeIndexByName(sizeName);
      if (sizeIndex === -1) return;

      const row = {
        size: sizeName,
        colorVariants: colors.map((colorName) => ({
          colorName: colorName,
          sizeName: sizeName,
          stock: this.getColorStockValue(sizeIndex, colorName) || 0,
          key: `${colorName}-${sizeName}`,
        })),
      };
      this.variantsMatrix.push(row);
    });

    this.showVariantsMatrix = this.variantsMatrix.length > 0;
    this.updateTotalStock();
  }

  getSizeIndexByName(sizeName: string): number {
    return this.sizeForms.controls.findIndex(
      (control) => (control as FormGroup).get('name')?.value === sizeName
    );
  }

  updateVariantStock(colorName: string, sizeName: string, stock: number): void {
    this.variantsMatrix.forEach((row) => {
      if (row.size === sizeName) {
        row.colorVariants.forEach((variant) => {
          if (variant.colorName === colorName) {
            variant.stock = stock;
          }
        });
      }
    });

    const sizeIndex = this.getSizeIndexByName(sizeName);
    if (sizeIndex !== -1) {
      this.updateColorStock(sizeIndex, colorName, stock);
    }

    this.updateTotalStock;
  }

  getColorCode(colorName: string): string {
    const colorForm = this.colorForms.controls.find(
      (control) => (control as FormGroup).get('name')?.value === colorName
    );
    return colorForm
      ? (colorForm as FormGroup).get('code')?.value || '#000000'
      : '#000000';
  }

  removeVariantImage(variantKey: string): void {
    if (this.variantImages.has(variantKey)) {
      this.variantImages.delete(variantKey);
      this.cdr.detectChanges();
    }
  }

  validateVariantImages(): boolean {
    let hasErrors = false;
    const errors: string[] = [];

    this.variantImages.forEach((value, key) => {
      if (!value.file || value.file.size === 0) {
        errors.push(`Imagen de variante ${key} no es válida`);
        hasErrors = true;
      }
    });

    if (hasErrors) {
      console.warn('Errores en imágenes de variantes:', errors);
    }

    return !hasErrors;
  }

  // ==================== GENERADORES ====================
  generateSku(): string {
    const form = this.productForm.value;

    const categoryId =
      form.categories && form.categories.length > 0 ? form.categories[0] : '';
    const category = this.categories.find((c) => c.id === categoryId);
    const categoryCode = category
      ? category.name.substring(0, 3).toUpperCase()
      : 'CAT';

    const productCode = form.name
      ? form.name.substring(0, 3).toUpperCase()
      : 'PRD';

    const serialNumber = Math.floor(1000 + Math.random() * 9000);

    return `${categoryCode}-${productCode}-${serialNumber}`;
  }

  generateVariantSku(
    baseSku: string,
    colorName: string,
    sizeName: string
  ): string {
    const colorCode = colorName.substring(0, 2).toUpperCase();
    return `${baseSku}-${colorCode}${sizeName}`;
  }

  listenToAutoGenerateSkuChanges(): void {
    this.productForm
      .get('sku')
      ?.setValidators(this.autoGenerateSku ? [] : [Validators.required]);
    this.productForm.get('sku')?.updateValueAndValidity();
  }

  onAutoGenerateSkuChange(value: boolean): void {
    this.autoGenerateSku = value;
    this.productForm
      .get('sku')
      ?.setValidators(this.autoGenerateSku ? [] : [Validators.required]);
    this.productForm.get('sku')?.updateValueAndValidity();
  }

  generateEan13(): string {
    let ean = '560';

    for (let i = 0; i < 9; i++) {
      ean += Math.floor(Math.random() * 10).toString();
    }

    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(ean[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;

    ean += checkDigit;

    return ean;
  }
}
