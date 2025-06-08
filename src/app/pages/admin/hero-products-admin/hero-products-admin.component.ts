import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzUploadFile } from 'ng-zorro-antd/upload';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Subject, takeUntil, finalize, take, forkJoin, map } from 'rxjs';
import { NzTagModule } from 'ng-zorro-antd/tag';

import { ModelImageService, ModelImage } from '../../../services/admin/modelImage/model-image.service';
import { ProductService } from '../../../services/admin/product/product.service';
import { Product } from '../../../models/models';

@Component({
  selector: 'app-hero-products-admin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzModalModule,
    NzTableModule,
    NzFormModule,
    NzInputModule,
    NzCardModule,
    NzUploadModule,
    NzIconModule,
    NzPopconfirmModule,
    NzAvatarModule,
    NzToolTipModule,
    NzEmptyModule,
    NzSkeletonModule,
    NzSwitchModule,
    NzTagModule,
    NzSelectModule,
    NzDividerModule,
    NzBadgeModule
  ],
  templateUrl: './hero-products-admin.component.html',
  styleUrl: './hero-products-admin.component.css'
})
export class HeroProductsAdminComponent implements OnInit, OnDestroy {
  // 📊 ESTADO PRINCIPAL
  modelImages: ModelImage[] = [];
  availableModels: string[] = []; // 🆕 Modelos disponibles de productos
  productsMap: Map<string, Product[]> = new Map(); // 🆕 Productos por modelo
  loading = false;
  saving = false;
  modalVisible = false;
  isEditMode = false;
  editingId: string | null = null;
  modelForm!: FormGroup;

  // 📱 MANEJO DE ARCHIVOS
  desktopFileList: NzUploadFile[] = [];
  mobileFileList: NzUploadFile[] = [];
  desktopImageFile: File | null = null;
  mobileImageFile: File | null = null;

  // 🎨 UI y RESPONSIVE
  modalWidth = 720;
  detailsModalVisible = false;
  selectedModel: ModelImage | null = null;
  fallbackImageUrl: SafeUrl;

  // 🔧 VALIDACIÓN Y ERRORES
  desktopImageError: string | null = null;
  mobileImageError: string | null = null;

  // 🗑️ CONTROL DE SUSCRIPCIONES
  private destroy$ = new Subject<void>();

  constructor(
    private modelImageService: ModelImageService,
    private productService: ProductService, // 🆕 Agregar ProductService
    private message: NzMessageService,
    private modalService: NzModalService,
    private sanitizer: DomSanitizer,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    // 🖼️ IMAGEN DE FALLBACK
    const fallbackSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjEyIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmaWxsPSIjOTk5OTk5Ij5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';
    this.fallbackImageUrl = this.sanitizer.bypassSecurityTrustUrl(fallbackSvg);

    this.createForm();
  }

  ngOnInit(): void {
    this.loadInitialData();
    this.setModalWidth();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==================== FORMULARIO Y VALIDACIÓN ====================

  createForm(): void {
    this.modelForm = this.fb.group({
      modelName: ['', [Validators.required, Validators.minLength(2)]],
      description: ['', [Validators.maxLength(200)]]
    });
  }

  // ==================== CARGA DE DATOS ====================

  // 🆕 CARGAR DATOS INICIALES (MODELOS + PRODUCTOS)
  loadInitialData(): void {
  this.loading = true;

  // 🔄 CARGAR PRODUCTOS PRIMERO (como en productos-section)
  this.productService.getProducts()
    .pipe(
      takeUntil(this.destroy$),
      map(products => {
        return products;
      })
    )
    .subscribe({
      next: (products) => {
        this.processProductModels(products || []);
        
        // 🔄 CARGAR MODEL IMAGES DESPUÉS (en paralelo, sin bloquear)
        this.loadModelImagesAsync();
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ [LOAD-INITIAL-DATA] Error cargando productos:', error);
        this.message.error('Error al cargar datos. Intente nuevamente.');
        this.loading = false;
        this.cdr.detectChanges();
      },
      complete: () => {
      }
    });
}

private loadModelImagesAsync(): void {
  
  this.modelImageService.getModelImages()
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (modelImages) => {
        this.modelImages = modelImages || [];
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ [LOAD-MODEL-IMAGES] Error:', error);
        this.modelImages = [];
        this.cdr.detectChanges();
      }
    });
}

  // 🆕 PROCESAR MODELOS DE PRODUCTOS
  private processProductModels(products: Product[]): void {

    const modelsSet = new Set<string>();
    const productsMap = new Map<string, Product[]>();

    products.forEach(product => {
      // 🔧 USAR MÚLTIPLES FUENTES PARA MODEL
      let modelName = '';

      // Prioridad 1: Campo model explícito
      if (product.model && product.model.trim()) {
        modelName = product.model.trim();
      }
      // Prioridad 2: Colección
      else if (product.collection && product.collection.trim()) {
        modelName = product.collection.trim();
      }
      // Prioridad 3: Nombre del producto
      else if (product.name && product.name.trim()) {
        modelName = product.name.trim();
      }

      if (modelName) {
        modelsSet.add(modelName);

        if (!productsMap.has(modelName)) {
          productsMap.set(modelName, []);
        }
        productsMap.get(modelName)!.push(product);
      } 
    });

    this.availableModels = Array.from(modelsSet).sort();
    this.productsMap = productsMap;
  }

  loadModelImages(): void {
    this.modelImageService.getModelImages()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.cdr.detectChanges())
      )
      .subscribe({
        next: (models) => {
          this.modelImages = models || [];
          console.log(`📦 Modelos cargados: ${this.modelImages.length}`);
        },
        error: (error) => {
          console.error('❌ Error cargando modelos:', error);
          this.message.error('Error al cargar modelos. Intente nuevamente.');
        }
      });
  }

  // ==================== MODAL Y FORMULARIO ====================

  openModal(): void {
    this.modalVisible = true;
    this.modelForm.reset();
    this.resetFiles();
    this.isEditMode = false;
    this.editingId = null;
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  closeModal(): void {
    this.modalVisible = false;
    this.modelForm.reset();
    this.resetFiles();
    this.cdr.detectChanges();
  }

  resetFiles(): void {
    this.desktopFileList = [];
    this.mobileFileList = [];
    this.desktopImageFile = null;
    this.mobileImageFile = null;
    this.desktopImageError = null;
    this.mobileImageError = null;
  }

  // ==================== MANEJO DE IMÁGENES ====================

  beforeUploadDesktop = (file: NzUploadFile): boolean => {
    this.desktopImageError = null;
    const validation = this.validateImageFile(file);

    if (!validation.isValid) {
      this.desktopImageError = validation.error || 'Archivo inválido';
      return false;
    }

    this.createImagePreview(file, 'desktop');
    return false; // Evitar upload automático
  };

  beforeUploadMobile = (file: NzUploadFile): boolean => {
    this.mobileImageError = null;
    const validation = this.validateImageFile(file);

    if (!validation.isValid) {
      this.mobileImageError = validation.error || 'Archivo inválido';
      return false;
    }

    this.createImagePreview(file, 'mobile');
    return false; // Evitar upload automático
  };

  validateImageFile(file: NzUploadFile): { isValid: boolean; error?: string } {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 8 * 1024 * 1024; // 8MB
    const minSize = 50 * 1024; // 50KB

    if (!file.type || !allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: 'Solo se permiten archivos JPG, PNG y WebP.'
      };
    }

    const actualFile = (file.originFileObj as File) || (file as any);
    if (!actualFile || typeof actualFile.size !== 'number') {
      return {
        isValid: false,
        error: 'El archivo es inválido o está corrupto.'
      };
    }

    if (actualFile.size < minSize) {
      return {
        isValid: false,
        error: 'La imagen debe pesar al menos 50KB para buena calidad.'
      };
    }

    if (actualFile.size > maxSize) {
      return {
        isValid: false,
        error: 'La imagen debe pesar menos de 8MB.'
      };
    }

    return { isValid: true };
  }

  createImagePreview(file: NzUploadFile, type: 'desktop' | 'mobile'): void {
    try {
      const actualFile = (file.originFileObj as File) || (file as any);
      const objectUrl = URL.createObjectURL(actualFile);

      const fileItem: NzUploadFile = {
        uid: `${Date.now()}-${file.name}`,
        name: file.name || 'imagen.jpg',
        status: 'done',
        url: objectUrl
      };

      if (type === 'desktop') {
        this.desktopFileList = [fileItem];
        this.desktopImageFile = actualFile;
      } else {
        this.mobileFileList = [fileItem];
        this.mobileImageFile = actualFile;
      }

      this.cdr.detectChanges();
    } catch (error) {
      const errorMsg = 'No se pudo cargar la vista previa.';
      if (type === 'desktop') {
        this.desktopImageError = errorMsg;
      } else {
        this.mobileImageError = errorMsg;
      }
    }
  }

  handlePreview = (file: NzUploadFile): void => {
    const imgUrl = file.url || file.thumbUrl;
    if (imgUrl) {
      this.modalService.create({
        nzContent: `<img src="${imgUrl}" style="width: 100%; max-height: 80vh;" alt="Vista previa" />`,
        nzFooter: null,
        nzWidth: 'auto',
        nzCentered: true,
        nzBodyStyle: { padding: '0' }
      });
    }
  };

  handleRemoveDesktop = (): boolean => {
    this.desktopFileList = [];
    this.desktopImageFile = null;
    this.desktopImageError = null;
    this.cdr.detectChanges();
    return true;
  };

  handleRemoveMobile = (): boolean => {
    this.mobileFileList = [];
    this.mobileImageFile = null;
    this.mobileImageError = null;
    this.cdr.detectChanges();
    return true;
  };

  // ==================== CRUD OPERATIONS ====================

  handleSubmit(): void {
    // Validar formulario
    Object.keys(this.modelForm.controls).forEach(key => {
      this.modelForm.get(key)?.markAsDirty();
      this.modelForm.get(key)?.updateValueAndValidity();
    });

    if (!this.modelForm.valid) {
      this.message.warning('Por favor complete todos los campos obligatorios.');
      return;
    }

    // Validar imagen desktop (obligatoria para crear)
    if (!this.desktopImageFile && !this.isEditMode) {
      this.desktopImageError = 'La imagen principal es obligatoria.';
      return;
    }

    // Verificar duplicados
    const modelName = this.modelForm.get('modelName')?.value?.trim();
    if (this.isDuplicateModelName(modelName)) {
      this.message.warning('Ya existe un modelo con este nombre.');
      return;
    }

    this.saving = true;
    this.cdr.detectChanges();

    const formData = this.modelForm.value;

    if (this.isEditMode && this.editingId) {
      this.updateModel(formData);
    } else {
      this.createModel(formData);
    }
  }

  async createModel(formData: any): Promise<void> {
    try {
      await this.modelImageService.createModelImage(
        formData.modelName.trim(),
        formData.description?.trim() || '',
        this.desktopImageFile!,
        this.mobileImageFile || undefined
      );

      this.message.success('Modelo creado correctamente.');
      this.modalVisible = false;

    } catch (error: any) {
      console.error('❌ Error creando modelo:', error);
      this.message.error(error.message || 'Error al crear modelo.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async updateModel(formData: any): Promise<void> {
    try {
      await this.modelImageService.updateModelImage(
        this.editingId!,
        formData.modelName?.trim(),
        formData.description?.trim(),
        this.desktopImageFile || undefined,
        this.mobileImageFile || undefined
      );

      this.message.success('Modelo actualizado correctamente.');
      this.modalVisible = false;

    } catch (error: any) {
      console.error('❌ Error actualizando modelo:', error);
      this.message.error(error.message || 'Error al actualizar modelo.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  editModel(model: ModelImage): void {
    this.modelForm.setValue({
      modelName: model.modelName || '',
      description: model.description || ''
    });

    this.editingId = model.id;
    this.isEditMode = true;

    // Mostrar imágenes actuales
    if (model.imageUrl) {
      this.desktopFileList = [{
        uid: '-1-desktop',
        name: 'desktop.webp',
        status: 'done',
        url: model.imageUrl
      }];
    }

    if (model.mobileImageUrl) {
      this.mobileFileList = [{
        uid: '-1-mobile',
        name: 'mobile.webp',
        status: 'done',
        url: model.mobileImageUrl
      }];
    }

    this.modalVisible = true;
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  deleteModel(id: string, modelName: string): void {
    this.modelImageService.deleteModelImage(id)
      .then(() => {
        this.message.success(`Modelo "${modelName}" eliminado correctamente.`);
      })
      .catch((error) => {
        console.error('❌ Error eliminando modelo:', error);
        this.message.error(error.message || 'Error al eliminar modelo.');
      });
  }

  async toggleModelActive(model: ModelImage): Promise<void> {
    try {
      await this.modelImageService.toggleModelActive(model.id, !model.isActive);
      const action = model.isActive ? 'desactivado' : 'activado';
      this.message.success(`Modelo "${model.modelName}" ${action}.`);
    } catch (error: any) {
      console.error('❌ Error cambiando estado:', error);
      this.message.error(error.message || 'Error al cambiar estado.');
    }
  }

  // ==================== UTILIDADES ====================

  // 🆕 OBTENER MODELOS SIN IMAGEN ASIGNADA
  getModelsWithoutImage(): string[] {
    const modelsWithImage = new Set(this.modelImages.map(img => img.modelName));
    return this.availableModels.filter(model => !modelsWithImage.has(model));
  }

  // 🆕 OBTENER PRODUCTOS ASOCIADOS A UN MODELO
  getProductsForModel(modelName: string): Product[] {
    return this.productsMap.get(modelName) || [];
  }

  // 🆕 VERIFICAR SI MODELO TIENE PRODUCTOS
  hasProducts(modelName: string): boolean {
    const products = this.getProductsForModel(modelName);
    return products.length > 0;
  }

  // 🆕 OBTENER ESTADÍSTICAS DE MODELOS
  getModelStats() {
    const modelsWithImage = this.modelImages.length;
    const modelsWithoutImage = this.getModelsWithoutImage().length;
    const totalAvailableModels = this.availableModels.length;

    return {
      total: totalAvailableModels,
      withImage: modelsWithImage,
      withoutImage: modelsWithoutImage,
      coverage: totalAvailableModels > 0 ? Math.round((modelsWithImage / totalAvailableModels) * 100) : 0
    };
  }

  isDuplicateModelName(modelName: string): boolean {
    if (!modelName) return false;

    return this.modelImages.some(model =>
      model.modelName.toLowerCase() === modelName.toLowerCase() &&
      model.id !== this.editingId
    );
  }

  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement && !imgElement.src.includes('data:image')) {
      imgElement.src = this.fallbackImageUrl as string;
      imgElement.classList.add('error-image');
    }
  }

  showDetails(model: ModelImage): void {
    this.selectedModel = model;
    this.detailsModalVisible = true;
    this.cdr.detectChanges();
  }

  getImageDisplayUrl(imageUrl?: string): string {
    return imageUrl || (this.fallbackImageUrl as string);
  }

  // ==================== RESPONSIVE ====================

  @HostListener('window:resize')
  setModalWidth(): void {
    if (window.innerWidth < 576) {
      this.modalWidth = window.innerWidth - 32;
    } else if (window.innerWidth < 768) {
      this.modalWidth = window.innerWidth - 64;
    } else {
      this.modalWidth = 720;
    }
  }

  // ==================== ESTADÍSTICAS ====================

  getStats() {
    return this.getModelStats(); // 🆕 Usar estadísticas mejoradas
  }

  trackByModelId(index: number, model: ModelImage): string {
    return model.id;
  }
}