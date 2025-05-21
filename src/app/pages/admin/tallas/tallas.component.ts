import { ChangeDetectorRef, Component, HostListener, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
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
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { SizeService } from '../../../services/admin/size/size.service';
import { Size } from '../../../models/models';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { EMPTY, Subject, catchError, of } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { NzTagModule } from 'ng-zorro-antd/tag';

@Component({
  selector: 'app-tallas',
  standalone: true,
  imports: [
    CommonModule,
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
    NzSelectModule,
    NzInputNumberModule,
    NzSwitchModule,
    NzTagModule
  ],
  templateUrl: './tallas.component.html',
  styleUrls: ['./tallas.component.css']
})
export class TallasComponent implements OnInit, OnDestroy {
  // Variables principales
  sizes: Size[] = [];
  categories: Category[] = [];
  loading = false;
  categoriesLoading = false;
  saving = false;
  modalVisible = false;
  isEditMode = false;
  sizeForm!: FormGroup;
  editingId: string | null = null;
  fileList: NzUploadFile[] = [];
  imageFile: File | null = null;
  fallbackImageUrl: SafeUrl;

  // Manejo de errores y UI
  imageErrorMessage: string | null = null;
  modalWidth = 520;
  detailsModalVisible = false;
  selectedSize: Size | null = null;
  
  // Para control de suscripciones
  private destroy$ = new Subject<void>();

  constructor(
    private sizeService: SizeService,
    private categoryService: CategoryService,
    private message: NzMessageService,
    private modalService: NzModalService,
    private sanitizer: DomSanitizer,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) { 
    // Crear imagen de fallback
    const fallbackImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmaWxsPSIjOTk5OTk5Ij5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';
    this.fallbackImageUrl = this.sanitizer.bypassSecurityTrustUrl(fallbackImage);
    
    // Inicializar formulario
    this.createForm();
  }

  createForm(): void {
    this.sizeForm = this.fb.group({
      name: ['', [Validators.required]],
      description: [''],
      active: [true],
      stock: [0, [Validators.min(0)]],
      categories: [[]],
      order: [0, [Validators.min(0)]] // Para ordenar las tallas
    });
  }

  ngOnInit(): void {
    this.fetchSizes();
    this.fetchCategories();
    this.setModalWidth();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fetchSizes(): void {
    this.loading = true;
    
    this.zone.runOutsideAngular(() => {
      this.sizeService.getSizes()
        .pipe(
          takeUntil(this.destroy$),
          catchError(error => {
            console.error('Error al cargar tallas:', error);
            
            this.zone.run(() => {
              this.message.error('Error al cargar tallas. Intente nuevamente.');
            });
            
            return of([]);
          }),
          finalize(() => {
            this.zone.run(() => {
              this.loading = false;
              this.cdr.detectChanges();
            });
          })
        )
        .subscribe({
          next: (data) => {            
            this.zone.run(() => {
              this.sizes = data || [];
              this.cdr.detectChanges();
            });
          }
        });
    });
  }

  fetchCategories(): void {
    this.categoriesLoading = true;
    
    this.zone.runOutsideAngular(() => {
      this.categoryService.getCategories()
        .pipe(
          takeUntil(this.destroy$),
          catchError(error => {
            console.error('Error al cargar categorías:', error);
            return of([]);
          }),
          finalize(() => {
            this.zone.run(() => {
              this.categoriesLoading = false;
              this.cdr.detectChanges();
            });
          })
        )
        .subscribe({
          next: (data) => {
            this.zone.run(() => {
              this.categories = data || [];
              this.cdr.detectChanges();
            });
          }
        });
    });
  }

  // Método para manejar errores de imágenes
  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement && !imgElement.src.includes('data:image')) { 
      imgElement.src = this.fallbackImageUrl as string;
      imgElement.classList.add('error-image');
    }
  }
  
  openModal(): void {
    this.modalVisible = true;
    this.sizeForm.reset({
      active: true,
      stock: 0,
      categories: [],
      order: 0
    });
    this.fileList = [];
    this.isEditMode = false;
    this.editingId = null;
    this.imageFile = null;
    this.imageErrorMessage = '';
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  closeModal(): void {
    this.modalVisible = false;
    this.sizeForm.reset();
    this.cdr.detectChanges();
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    this.imageErrorMessage = null;

    // Verificar tipo de archivo
    const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name || '');
    if (!isImage) {
      this.imageErrorMessage = 'Solo puedes subir archivos de imagen (.jpg, .png, .gif, .webp).';
      return false;
    }

    // Obtener el archivo real
    const actualFile = (file.originFileObj as File) || (file as any);

    // Validar que tenga tamaño
    if (!actualFile || typeof actualFile.size !== 'number') {
      this.imageErrorMessage = 'El archivo es inválido o está corrupto.';
      return false;
    }

    // Verificar tamaño (2MB máximo)
    const isLt2M = actualFile.size / 1024 / 1024 < 2;
    if (!isLt2M) {
      this.imageErrorMessage = 'La imagen debe pesar menos de 2MB.';
      return false;
    }

    // Crear vista previa
    try {
      const objectUrl = URL.createObjectURL(actualFile);
      this.fileList = [{
        uid: `${Date.now()}-${file.name}`,
        name: file.name || 'imagen.jpg',
        status: 'done',
        url: objectUrl
      }];
      this.imageFile = actualFile;
      this.cdr.detectChanges();
    } catch (e) {
      this.imageErrorMessage = 'No se pudo cargar la vista previa.';
      return false;
    }

    return false; // Evita el upload automático
  };

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

  handleRemove = (file: NzUploadFile): boolean => {
    this.fileList = [];
    this.imageFile = null;
    this.cdr.detectChanges();
    return true;
  };

  async handleSubmit(): Promise<void> {
    // Marcar todos los campos como tocados para mostrar errores
    Object.keys(this.sizeForm.controls).forEach(key => {
      this.sizeForm.get(key)?.markAsDirty();
      this.sizeForm.get(key)?.updateValueAndValidity();
    });

    // Verificar validez del formulario
    if (!this.sizeForm.valid) {
      this.message.warning('Por favor complete todos los campos obligatorios correctamente.');
      return;
    }

    // No es necesario una imagen para una talla, pero si proporcionan una, mejor
    
    // Iniciar proceso de guardado
    this.saving = true;
    this.cdr.detectChanges();
    
    const formData = this.sizeForm.value;

    try {
      if (this.isEditMode && this.editingId) {
        await this.sizeService.updateSize(
          this.editingId,
          formData,
          this.imageFile || undefined
        );
        this.message.success('Talla actualizada correctamente.');
      } else {
        await this.sizeService.createSize(
          {
            name: formData.name,
            description: formData.description || '',
            active: formData.active,
            stock: formData.stock || 0,
            categories: formData.categories || [],
            order: formData.order || 0,
            colorStocks: []
          },
          this.imageFile || undefined
        );
        this.message.success('Talla creada correctamente.');
      }

      // Después de guardar exitosamente
      this.modalVisible = false;
      this.sizeService.invalidateCache();
      this.fetchSizes();
    } catch (error: any) {
      console.error('Error al guardar talla:', error);
      this.message.error(error.message || 'Error al guardar la talla. Intente nuevamente.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  editSize(size: Size): void {
    this.sizeForm.setValue({
      name: size.name || '',
      description: size.description || '',
      active: size.active !== undefined ? size.active : true,
      stock: size.stock || 0,
      categories: size.categories || [],
      order: size.order || 0
    });
    
    this.editingId = size.id;
    this.isEditMode = true;

    // Mostrar la imagen actual en el fileList si existe
    this.fileList = size.imageUrl ? [
      {
        uid: '-1',
        name: 'image.png',
        status: 'done',
        url: size.imageUrl
      }
    ] : [];

    this.modalVisible = true;
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  async deleteSize(id: string): Promise<void> {
    try {
      await this.sizeService.deleteSize(id);
      this.message.success('Talla eliminada correctamente.');
      this.fetchSizes();
    } catch (error: any) {
      console.error('Error al eliminar talla:', error);
      this.message.error(error.message || 'Error al eliminar la talla. Intente nuevamente.');
    }
  }

  // Método para adaptar el ancho del modal según el tamaño de pantalla
  @HostListener('window:resize')
  setModalWidth() {
    if (window.innerWidth < 576) {
      this.modalWidth = window.innerWidth - 32; // 16px de padding en cada lado
    } else {
      this.modalWidth = 520;
    }
  }

  // Mostrar detalles en móvil
  showDetails(size: Size) {
    this.selectedSize = size;
    this.detailsModalVisible = true;
    this.cdr.detectChanges();
  }
  
  // Obtener nombres de categorías para mostrar en la tabla
  getCategoryNames(categoryIds: string[]): string {
    if (!categoryIds || !categoryIds.length || !this.categories.length) {
      return 'Sin categorías';
    }
    
    const categoryNames = categoryIds.map(id => {
      const category = this.categories.find(c => c.id === id);
      return category ? category.name : '';
    }).filter(Boolean);
    
    return categoryNames.length ? categoryNames.join(', ') : 'Sin categorías';
  }
}