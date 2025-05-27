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
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { EMPTY, Subject, catchError, of, finalize, take, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ColoresComponent } from "../colores/colores.component";
import { TallasComponent } from "../tallas/tallas.component";
import { CacheService } from '../../../services/admin/cache/cache.service';

@Component({
  selector: 'app-categorias',
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
    ColoresComponent,
    TallasComponent
  ],
  templateUrl: './categorias.component.html',
  styleUrls: ['./categorias.component.css']
})
export class CategoriasComponent implements OnInit, OnDestroy {
  // Variables principales
  categories: Category[] = [];
  loading = false; // Mantenemos esto para compatibilidad, pero no lo usamos en el template
  saving = false;
  modalVisible = false;
  isEditMode = false;
  categoryForm!: FormGroup;
  editingId: string | null = null;
  fileList: NzUploadFile[] = [];
  imageFile: File | null = null;
  fallbackImageUrl: SafeUrl;

  // Manejo de errores y UI
  imageErrorMessage: string | null = null;
  modalWidth = 520;
  detailsModalVisible = false;
  selectedCategory: Category | null = null;

  // Para control de suscripciones
  private destroy$ = new Subject<void>();

  constructor(
    private categoryService: CategoryService,
    private message: NzMessageService,
    private modalService: NzModalService,
    private sanitizer: DomSanitizer,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private cacheService: CacheService,
    private zone: NgZone // Añadido NgZone para forzar la ejecución fuera de zonas
  ) {
    // Crear imagen de fallback
    const fallbackImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmaWxsPSIjOTk5OTk5Ij5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';
    this.fallbackImageUrl = this.sanitizer.bypassSecurityTrustUrl(fallbackImage);

    // Inicializar formulario
    this.createForm();
  }

  createForm(): void {
    this.categoryForm = this.fb.group({
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]]
    });
  }

  ngOnInit(): void {

    // Suscribirse a las notificaciones de invalidación de caché
    this.cacheService.getInvalidationNotifier(this.categoryService['cacheKey'])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.fetchCategories();
      });

    this.fetchCategories();
    this.setModalWidth();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fetchCategories(): void {
    this.loading = true;

    // Ejecutar fuera de zona de Angular para evitar ciclos de detección de cambios innecesarios
    this.zone.runOutsideAngular(() => {
      this.categoryService.getCategories()
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => {
            console.log('Finalizando carga de categorías');

            // Volver a la zona de Angular para actualizar la UI
            this.zone.run(() => {
              this.loading = false;
              this.cdr.detectChanges();
              console.log('Loading set to false and change detection triggered');
            });
          })
        )
        .subscribe({
          next: (data) => {
            // Volver a la zona de Angular para actualizar los datos
            this.zone.run(() => {
              this.categories = data || [];
              this.cdr.detectChanges();
            });
          },
          error: (error) => {
            console.error('Error al cargar categorías:', error);

            // Volver a la zona de Angular para mostrar el mensaje de error
            this.zone.run(() => {
              this.message.error('Error al cargar categorías. Intente nuevamente.');
              this.loading = false;
              this.cdr.detectChanges();
            });
          }
        });
    });
  }

  // Método mejorado para el manejo de errores de imágenes
  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement && !imgElement.src.includes('data:image')) {
      imgElement.src = this.fallbackImageUrl as string;
      imgElement.classList.add('error-image');
    }
  }

  openModal(): void {
    this.modalVisible = true;
    this.categoryForm.reset();
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
    this.categoryForm.reset();
    this.cdr.detectChanges();
  }

  // Versión limpia SIN constantes innecesarias

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

    // Verificar tamaño mínimo (20KB para mejor calidad)
    const minSizeKB = 20;
    if (actualFile.size / 1024 <= minSizeKB) {
      this.imageErrorMessage = `La imagen debe pesar al menos ${minSizeKB}KB para garantizar buena calidad.`;
      return false;
    }

    // Verificar tamaño máximo (6MB para alta calidad en welcome)
    const maxSizeMB = 6;
    if (actualFile.size / 1024 / 1024 >= maxSizeMB) {
      this.imageErrorMessage = `La imagen debe pesar menos de ${maxSizeMB}MB.`;
      return false;
    }

    // Validación asíncrona de dimensiones
    this.validateImageDimensionsAsync(actualFile);

    return false; // Evitar upload automático
  };

  private async validateImageDimensionsAsync(file: File): Promise<void> {
    try {
      const isValid = await this.checkImageDimensions(file);

      if (isValid) {
        this.createImagePreview(file);
      }

      this.cdr.detectChanges();
    } catch (error) {
      this.imageErrorMessage = 'Error al validar la imagen.';
      this.cdr.detectChanges();
    }
  }

  private checkImageDimensions(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        // Dimensiones mínimas para categorías
        const minWidth = 200;
        const minHeight = 200;

        if (img.width < minWidth || img.height < minHeight) {
          this.imageErrorMessage = `La imagen debe tener al menos ${minWidth}x${minHeight} píxeles para buena calidad en el sitio.`;
          resolve(false);
          return;
        }

        resolve(true);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        this.imageErrorMessage = 'No se pudo cargar la imagen. Archivo corrupto.';
        resolve(false);
      };

      img.src = objectUrl;
    });
  }

  private createImagePreview(file: File): void {
    try {
      const objectUrl = URL.createObjectURL(file);
      this.fileList = [{
        uid: `${Date.now()}-${file.name}`,
        name: file.name || 'imagen.jpg',
        status: 'done',
        url: objectUrl
      }];
      this.imageFile = file;
    } catch (e) {
      this.imageErrorMessage = 'No se pudo cargar la vista previa.';
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

  handleRemove = (file: NzUploadFile): boolean => {
    this.fileList = [];
    this.imageFile = null;
    this.cdr.detectChanges();
    return true;
  };

  handleSubmit(): void {
    // Marcar todos los campos como tocados para mostrar errores
    Object.keys(this.categoryForm.controls).forEach(key => {
      this.categoryForm.get(key)?.markAsDirty();
      this.categoryForm.get(key)?.updateValueAndValidity();
    });

    // Verificar validez del formulario
    if (!this.categoryForm.valid) {
      this.message.warning('Por favor complete todos los campos obligatorios correctamente.');
      return;
    }

    // Validación de imagen solo si no está en modo edición
    if (!this.imageFile && !this.isEditMode) {
      this.imageErrorMessage = 'Por favor seleccione una imagen para la categoría.';
      return;
    }

    // Iniciar proceso de guardado
    this.saving = true;
    this.cdr.detectChanges();

    const formData = this.categoryForm.value;

    if (this.isEditMode && this.editingId) {
      // Actualizar categoría existente
      this.categoryService.updateCategory(
        this.editingId,
        formData,
        this.imageFile || undefined
      ).pipe(
        take(1),
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        })
      ).subscribe({
        next: () => {
          this.message.success('Categoría actualizada correctamente.');
          this.modalVisible = false;
          // No es necesario llamar a fetchCategories() aquí porque
          // updateCategory ya invalida la caché
        },
        error: (error) => {
          console.error('Error al actualizar categoría:', error);
          this.message.error(error.message || 'Error al actualizar la categoría. Intente nuevamente.');
        }
      });
    } else {
      // Crear nueva categoría
      this.categoryService.createCategory(
        {
          name: formData.name,
          description: formData.description,
          slug: formData.slug
        },
        this.imageFile!
      ).pipe(
        take(1),
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        })
      ).subscribe({
        next: () => {
          this.message.success('Categoría creada correctamente.');
          this.modalVisible = false;
          // No es necesario llamar a fetchCategories() aquí porque
          // createCategory ya invalida la caché
        },
        error: (error) => {
          console.error('Error al crear categoría:', error);
          this.message.error(error.message || 'Error al crear la categoría. Intente nuevamente.');
        }
      });
    }
  }

  async editCategory(category: Category): Promise<void> {
    this.categoryForm.setValue({
      name: category.name || '',
      description: category.description || '',
      slug: category.slug || ''
    });

    this.editingId = category.id;
    this.isEditMode = true;

    // Mostrar la imagen actual en el fileList
    this.fileList = category.imageUrl ? [
      {
        uid: '-1',
        name: 'image.png',
        status: 'done',
        url: category.imageUrl
      }
    ] : [];

    this.modalVisible = true;
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  deleteCategory(id: string): void {
    this.categoryService.deleteCategory(id).pipe(
      take(1)
    ).subscribe({
      next: () => {
        this.message.success('Categoría eliminada correctamente.');
        // No es necesario llamar a fetchCategories() porque
        // deleteCategory ya invalida la caché
      },
      error: (error) => {
        console.error('Error al eliminar categoría:', error);
        this.message.error(error.message || 'Error al eliminar la categoría. Intente nuevamente.');
      }
    });
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
  showDetails(category: Category) {
    this.selectedCategory = category;
    this.detailsModalVisible = true;
    this.cdr.detectChanges();
  }

  // Generar slug automáticamente a partir del nombre
  generateSlug(): void {
    const nameControl = this.categoryForm.get('name');
    const slugControl = this.categoryForm.get('slug');

    if (nameControl && slugControl && nameControl.value && !slugControl.value) {
      const slug = nameControl.value
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Eliminar caracteres especiales
        .replace(/\s+/g, '-')     // Reemplazar espacios con guiones
        .replace(/-+/g, '-');     // Eliminar guiones duplicados

      slugControl.setValue(slug);
    }
  }
}