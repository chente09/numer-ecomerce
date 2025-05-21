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
import { ColorService } from '../../../services/admin/color/color.service';
import { Color } from '../../../models/models';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzColorPickerModule } from 'ng-zorro-antd/color-picker';
import { EMPTY, Subject, catchError, of } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

@Component({
  selector: 'app-colores',
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
    NzColorPickerModule
  ],
  templateUrl: './colores.component.html',
  styleUrls: ['./colores.component.css']
})
export class ColoresComponent implements OnInit, OnDestroy {
  // Variables principales
  colors: Color[] = [];
  loading = false;
  saving = false;
  modalVisible = false;
  isEditMode = false;
  colorForm!: FormGroup;
  editingId: string | null = null;
  fileList: NzUploadFile[] = [];
  imageFile: File | null = null;
  fallbackImageUrl: SafeUrl;

  // Manejo de errores y UI
  imageErrorMessage: string | null = null;
  modalWidth = 520;
  detailsModalVisible = false;
  selectedColor: Color | null = null;
  
  // Para control de suscripciones
  private destroy$ = new Subject<void>();

  constructor(
    private colorService: ColorService,
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
    this.colorForm = this.fb.group({
      name: ['', [Validators.required]],
      code: ['', [Validators.required, Validators.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)]],
      description: ['']
    });
  }

  ngOnInit(): void {
    this.fetchColors();
    this.setModalWidth();

    // Escuchar cambios en el selector de color
    this.colorForm.get('code')?.valueChanges.subscribe(value => {
      // Si el valor es un color válido, actualizar el color de la muestra
      if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
        const colorPreviewElement = document.getElementById('colorPreview');
        if (colorPreviewElement) {
          colorPreviewElement.style.backgroundColor = value;
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fetchColors(): void {
    this.loading = true;
    
    this.zone.runOutsideAngular(() => {
      this.colorService.getColors()
        .pipe(
          takeUntil(this.destroy$),
          catchError(error => {
            console.error('Error al cargar colores:', error);
            
            this.zone.run(() => {
              this.message.error('Error al cargar colores. Intente nuevamente.');
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
              this.colors = data || [];
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
    this.colorForm.reset();
    this.fileList = [];
    this.isEditMode = false;
    this.editingId = null;
    this.imageFile = null;
    this.imageErrorMessage = '';
    this.setModalWidth();
    
    // Establecer un color por defecto
    this.colorForm.get('code')?.setValue('#000000');
    
    this.cdr.detectChanges();
  }

  closeModal(): void {
    this.modalVisible = false;
    this.colorForm.reset();
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
    Object.keys(this.colorForm.controls).forEach(key => {
      this.colorForm.get(key)?.markAsDirty();
      this.colorForm.get(key)?.updateValueAndValidity();
    });

    // Verificar validez del formulario
    if (!this.colorForm.valid) {
      this.message.warning('Por favor complete todos los campos obligatorios correctamente.');
      return;
    }

    // No es necesario una imagen para un color, pero si proporcionan una, mejor
    
    // Iniciar proceso de guardado
    this.saving = true;
    this.cdr.detectChanges();
    
    const formData = this.colorForm.value;

    try {
      if (this.isEditMode && this.editingId) {
        await this.colorService.updateColor(
          this.editingId,
          formData,
          this.imageFile || undefined
        );
        this.message.success('Color actualizado correctamente.');
      } else {
        await this.colorService.createColor(
          {
            name: formData.name,
            code: formData.code,
            description: formData.description || '',
          },
          this.imageFile || undefined
        );
        this.message.success('Color creado correctamente.');
      }

      // Después de guardar exitosamente
      this.modalVisible = false;
      this.colorService.invalidateCache();
      this.fetchColors();
    } catch (error: any) {
      console.error('Error al guardar color:', error);
      this.message.error(error.message || 'Error al guardar el color. Intente nuevamente.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  editColor(color: Color): void {
    this.colorForm.setValue({
      name: color.name || '',
      code: color.code || '#000000',
      description: color.description || ''
    });
    
    this.editingId = color.id;
    this.isEditMode = true;

    // Mostrar la imagen actual en el fileList si existe
    this.fileList = color.imageUrl ? [
      {
        uid: '-1',
        name: 'image.png',
        status: 'done',
        url: color.imageUrl
      }
    ] : [];

    this.modalVisible = true;
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  async deleteColor(id: string): Promise<void> {
    try {
      await this.colorService.deleteColor(id);
      this.message.success('Color eliminado correctamente.');
      this.fetchColors();
    } catch (error: any) {
      console.error('Error al eliminar color:', error);
      this.message.error(error.message || 'Error al eliminar el color. Intente nuevamente.');
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
  showDetails(color: Color) {
    this.selectedColor = color;
    this.detailsModalVisible = true;
    this.cdr.detectChanges();
  }
  
  // Sugiere un nombre para un color basado en su código hexadecimal
  suggestColorName(hexCode: string): void {
    // Lista de colores comunes y sus códigos aproximados
    const commonColors: {[key: string]: string[]} = {
      'Rojo': ['#FF0000', '#FF0033', '#CC0000', '#E60000'],
      'Azul': ['#0000FF', '#0033FF', '#0066FF', '#3366FF'],
      'Verde': ['#00FF00', '#00CC00', '#33CC33', '#009900'],
      'Amarillo': ['#FFFF00', '#FFCC00', '#FFCC33', '#FFCC66'],
      'Negro': ['#000000'],
      'Blanco': ['#FFFFFF', '#FAFAFA', '#F0F0F0', '#EEEEEE'],
      'Gris': ['#808080', '#999999', '#CCCCCC', '#666666'],
      'Naranja': ['#FFA500', '#FF9900', '#FF6600', '#FF8000'],
      'Púrpura': ['#800080', '#9900CC', '#9933FF', '#660099'],
      'Rosa': ['#FFC0CB', '#FF99CC', '#FF66CC', '#FF3399'],
      'Marrón': ['#A52A2A', '#996633', '#663300', '#CC9966'],
      'Cian': ['#00FFFF', '#33CCCC', '#00CCCC', '#99FFFF'],
      'Lima': ['#00FF00', '#99FF00', '#CCFF00', '#66FF00'],
      'Beige': ['#F5F5DC', '#FFFFCC', '#FFFF99', '#FFFFDD']
    };
    
    // Normalizar el código hexadecimal
    const hex = hexCode.toUpperCase();
    
    // Buscar coincidencias exactas
    for (const [name, codes] of Object.entries(commonColors)) {
      if (codes.includes(hex)) {
        this.colorForm.get('name')?.setValue(name);
        return;
      }
    }
    
    // Si no hay un nombre exacto, dejar el campo como está
    // Aquí podrías implementar un algoritmo más sofisticado para sugerir 
    // nombres basados en la proximidad del color, pero eso requeriría 
    // conversiones de color y cálculos de distancia
  }
}