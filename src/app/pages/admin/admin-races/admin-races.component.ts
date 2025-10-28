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
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzTagModule } from 'ng-zorro-antd/tag';

import { Subject } from 'rxjs';
import { finalize, take, takeUntil } from 'rxjs/operators';
import { CacheService } from '../../../services/admin/cache/cache.service';

// Importaciones específicas del proyecto
import { RaceService } from '../../../services/races/race/race-service.service';
import {
  Race,
  RACE_TYPES,
  RACE_CATEGORIES,
  RACE_DIFFICULTIES,
  ECUADORIAN_PROVINCES
} from '../../../models/race.model';

@Component({
  selector: 'app-admin-races',
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
    NzDatePickerModule,
    NzInputNumberModule,
    NzSelectModule,
    NzSwitchModule,
    NzTabsModule,
    NzGridModule,
    NzTagModule
  ],
  templateUrl: './admin-races.component.html',
  styleUrls: ['./admin-races.component.css']
})
export class AdminRacesComponent implements OnInit, OnDestroy {

  // Variables de datos
  races: Race[] = [];
  raceForm!: FormGroup;
  editingId: string | null = null;

  // Estados de UI
  loading = false;
  saving = false;
  modalVisible = false;
  isEditMode = false;
  modalWidth = 800; // Más ancho para el formulario grande
  detailsModalVisible = false;
  selectedRace: Race | null = null;

  // Constantes para los <select>
  readonly raceTypes = RACE_TYPES;
  readonly raceCategories = RACE_CATEGORIES;
  readonly raceDifficulties = RACE_DIFFICULTIES;
  readonly ecuadorianProvinces = ECUADORIAN_PROVINCES;

  // Manejo de archivos (Imagen Principal)
  mainFileList: NzUploadFile[] = [];
  mainImageFile: File | null = null;
  mainImageError: string | null = null;

  // Manejo de archivos (Galería)
  galleryFileList: NzUploadFile[] = [];
  galleryImageFiles: File[] = [];
  galleryImageError: string | null = null;

  fallbackImageUrl: SafeUrl;
  private destroy$ = new Subject<void>();

  constructor(
    private raceService: RaceService,
    private message: NzMessageService,
    private modalService: NzModalService,
    private sanitizer: DomSanitizer,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private cacheService: CacheService,
    private zone: NgZone
  ) {
    const fallbackImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmaWxsPSIjOTk5OTk5Ij5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';
    this.fallbackImageUrl = this.sanitizer.bypassSecurityTrustUrl(fallbackImage);
    this.createForm();
  }

  createForm(): void {
    this.raceForm = this.fb.group({
      // Pestaña: General
      nombre: ['', [Validators.required]],
      slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
      fecha: [null, [Validators.required]],
      horaInicio: ['08:00', [Validators.required]],
      descripcion: ['', [Validators.required]],

      // Pestaña: Ubicación
      ubicacion: ['', [Validators.required]],
      ciudad: ['', [Validators.required]],
      provincia: [null, [Validators.required]],
      coordenadasLat: [null],
      coordenadasLng: [null],

      // Pestaña: Clasificación
      tipoEvento: [null, [Validators.required]],
      categoria: [null, [Validators.required]],
      dificultad: [null, [Validators.required]],

      // Pestaña: Detalles Deportivos
      distancia: [''],
      denivelePositivo: [null],
      altitudMaxima: [null],

      // Pestaña: Comercial
      precio: [0, [Validators.required, Validators.min(0)]],
      precioAntesDescuento: [null],
      cupoMaximo: [null, [Validators.min(1)]],

      // Pestaña: Información Adicional
      requisitos: [[]],
      incluye: [[]],
      premios: [[]],
      sponsors: [[]],
      videoPromo: [''],

      // Pestaña: Organización
      organizadorNombre: [''],
      contactoEmail: ['', [Validators.email]],
      contactoTelefono: [''],

      // Pestaña: Estado y Fechas
      activo: [true, [Validators.required]],
      publicado: [false, [Validators.required]],
      destacado: [false],
      fechaInscripcionInicio: [null],
      fechaInscripcionCierre: [null, [Validators.required]],
    });
  }

  ngOnInit(): void {
    this.cacheService.getInvalidationNotifier(this.raceService['cacheKey'])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.fetchRaces();
      });

    this.fetchRaces();
    this.setModalWidth();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fetchRaces(): void {
    this.loading = true;
    this.zone.runOutsideAngular(() => {
      this.raceService.getRaces()
        .pipe(
          takeUntil(this.destroy$),
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
              this.races = data || [];
              this.cdr.detectChanges();
            });
          },
          error: (error) => {
            this.zone.run(() => {
              this.message.error('Error al cargar carreras. Intente nuevamente.');
              this.loading = false;
            });
          }
        });
    });
  }

  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement && !imgElement.src.includes('data:image')) {
      imgElement.src = this.fallbackImageUrl as string;
      imgElement.classList.add('error-image');
    }
  }

  openModal(): void {
    this.modalVisible = true;
    this.raceForm.reset({
      activo: true,
      publicado: false,
      destacado: false,
      precio: 0,
      horaInicio: '08:00',
      requisitos: [],
      incluye: [],
      premios: [],
      sponsors: []
    });
    this.mainFileList = [];
    this.galleryFileList = [];
    this.isEditMode = false;
    this.editingId = null;
    this.mainImageFile = null;
    this.galleryImageFiles = [];
    this.mainImageError = '';
    this.galleryImageError = '';
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  closeModal(): void {
    this.modalVisible = false;
    this.raceForm.reset();
    this.cdr.detectChanges();
  }

  // --- Manejo de Imagen Principal ---

  beforeUploadMain = (file: NzUploadFile): boolean => {
    this.mainImageError = null;
    const actualFile = file as any as File;

    // Validaciones (copiadas de categorias.component)
    const isImage = actualFile.type?.startsWith('image/');
    if (!isImage) {
      this.mainImageError = 'Solo puedes subir archivos de imagen.';
      return false;
    }
    const maxSizeMB = 6;
    if (actualFile.size / 1024 / 1024 >= maxSizeMB) {
      this.mainImageError = `La imagen debe pesar menos de ${maxSizeMB}MB.`;
      return false;
    }

    // Crear preview
    this.createImagePreview(actualFile, 'main');
    return false; // Evitar upload automático
  };

  handleRemoveMain = (file: NzUploadFile): boolean => {
    this.mainFileList = [];
    this.mainImageFile = null;
    this.cdr.detectChanges();
    return true;
  };

  // --- Manejo de Galería ---

  beforeUploadGallery = (file: NzUploadFile): boolean => {
    this.galleryImageError = null;
    const actualFile = file as any as File;

    const isImage = actualFile.type?.startsWith('image/');
    if (!isImage) {
      this.galleryImageError = 'Solo puedes subir archivos de imagen.';
      return false;
    }
    const maxSizeMB = 6;
    if (actualFile.size / 1024 / 1024 >= maxSizeMB) {
      this.galleryImageError = `La imagen debe pesar menos de ${maxSizeMB}MB.`;
      return false;
    }

    // Añadir a la lista de archivos y previews
    this.galleryImageFiles.push(actualFile);
    this.createImagePreview(actualFile, 'gallery');

    return false; // Evitar upload automático
  };

  handleRemoveGallery = (file: NzUploadFile): boolean => {
    const index = this.galleryFileList.findIndex(f => f.uid === file.uid);
    if (index > -1) {
      this.galleryFileList.splice(index, 1);
      this.galleryImageFiles.splice(index, 1);
    }
    return true;
  };

  // --- Funciones comunes de imágenes ---

  private createImagePreview(file: File, type: 'main' | 'gallery'): void {
    try {
      const objectUrl = URL.createObjectURL(file);
      const uploadFile: NzUploadFile = {
        uid: `${Date.now()}-${file.name}`,
        name: file.name || 'imagen.jpg',
        status: 'done',
        url: objectUrl
      };

      if (type === 'main') {
        this.mainFileList = [uploadFile];
        this.mainImageFile = file;
      } else {
        this.galleryFileList = [...this.galleryFileList, uploadFile];
      }
    } catch (e) {
      if (type === 'main') this.mainImageError = 'No se pudo cargar la vista previa.';
      else this.galleryImageError = 'No se pudo cargar la vista previa.';
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

  // --- Acciones CRUD ---

  handleSubmit(): void {
    Object.keys(this.raceForm.controls).forEach(key => {
      this.raceForm.get(key)?.markAsDirty();
      this.raceForm.get(key)?.updateValueAndValidity();
    });

    if (!this.raceForm.valid) {
      this.message.warning('Por favor complete todos los campos obligatorios (marcados con rojo) en todas las pestañas.');
      return;
    }

    if (!this.mainImageFile && !this.isEditMode) {
      this.mainImageError = 'Por favor seleccione una imagen principal para la carrera.';
      return;
    }

    this.saving = true;
    this.cdr.detectChanges();

    const form = this.raceForm.value;

    // 1. Construir el objeto base solo con los campos requeridos o que siempre tienen valor
    const raceData: any = {
      nombre: form.nombre,
      slug: form.slug,
      fecha: form.fecha,
      horaInicio: form.horaInicio,
      descripcion: form.descripcion,
      ubicacion: form.ubicacion,
      ciudad: form.ciudad,
      provincia: form.provincia,
      tipoEvento: form.tipoEvento,
      categoria: form.categoria,
      dificultad: form.dificultad,
      precio: form.precio,
      activo: form.activo,
      publicado: form.publicado,
      destacado: form.destacado,
      fechaInscripcionCierre: form.fechaInscripcionCierre,
      // Los arrays pueden ir vacíos, no hay problema
      requisitos: form.requisitos,
      incluye: form.incluye,
      premios: form.premios,
      sponsors: form.sponsors,
    };

    // 2. Añadir campos opcionales SÓLO SI tienen un valor
    // Esto evita enviar 'undefined' o 'null' a Firestore
    if (form.coordenadasLat && form.coordenadasLng) {
      raceData.coordenadas = { lat: form.coordenadasLat, lng: form.coordenadasLng };
    }
    if (form.distancia) raceData.distancia = form.distancia;
    if (form.denivelePositivo) raceData.denivelePositivo = form.denivelePositivo;
    if (form.altitudMaxima) raceData.altitudMaxima = form.altitudMaxima;
    if (form.precioAntesDescuento) raceData.precioAntesDescuento = form.precioAntesDescuento;
    if (form.cupoMaximo) raceData.cupoMaximo = form.cupoMaximo;
    if (form.videoPromo) raceData.videoPromo = form.videoPromo;
    if (form.organizadorNombre) raceData.organizadorNombre = form.organizadorNombre;
    if (form.contactoEmail) raceData.contactoEmail = form.contactoEmail;
    if (form.contactoTelefono) raceData.contactoTelefono = form.contactoTelefono;
    if (form.fechaInscripcionInicio) raceData.fechaInscripcionInicio = form.fechaInscripcionInicio;


    if (this.isEditMode && this.editingId) {
      // Actualizar carrera (raceData se envía como Partial<Race>)
      this.raceService.updateRace(
        this.editingId,
        raceData, // <-- Esto ahora funciona
        this.mainImageFile || undefined,
        this.galleryImageFiles.length > 0 ? this.galleryImageFiles : undefined
      ).pipe(
        take(1),
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        })
      ).subscribe({
        next: () => {
          this.message.success('Carrera actualizada correctamente.');
          this.modalVisible = false;
        },
        error: (error) => this.message.error(error.message || 'Error al actualizar la carrera.')
      });
    } else {
      // Crear nueva carrera
      this.raceService.createRace(
        {
          ...raceData,
          inscritosActuales: 0 // Añadimos el campo requerido que faltaba
        },
        this.mainImageFile!,
        this.galleryImageFiles.length > 0 ? this.galleryImageFiles : undefined
      ).pipe(
        take(1),
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        })
      ).subscribe({
        next: () => {
          this.message.success('Carrera creada correctamente.');
          this.modalVisible = false;
        },
        error: (error) => this.message.error(error.message || 'Error al crear la carrera.')
      });
    }
  }

  editRace(race: Race): void {
    this.raceForm.setValue({
      // General
      nombre: race.nombre,
      slug: race.slug,
      fecha: race.fecha,
      horaInicio: race.horaInicio,
      descripcion: race.descripcion,

      // Ubicación
      ubicacion: race.ubicacion,
      ciudad: race.ciudad,
      provincia: race.provincia,
      coordenadasLat: race.coordenadas?.lat || null,
      coordenadasLng: race.coordenadas?.lng || null,

      // Clasificación
      tipoEvento: race.tipoEvento,
      categoria: race.categoria,
      dificultad: race.dificultad,

      // Deportivos
      distancia: race.distancia || '',
      denivelePositivo: race.denivelePositivo || null,
      altitudMaxima: race.altitudMaxima || null,

      // Comercial
      precio: race.precio,
      precioAntesDescuento: race.precioAntesDescuento || null,
      cupoMaximo: race.cupoMaximo || null,

      // Info Adicional (asegurarse que sean arrays, no undefined)
      requisitos: race.requisitos || [],
      incluye: race.incluye || [],
      premios: race.premios || [],
      sponsors: race.sponsors || [],
      videoPromo: race.videoPromo || '',

      // Organización
      organizadorNombre: race.organizadorNombre || '',
      contactoEmail: race.contactoEmail || '',
      contactoTelefono: race.contactoTelefono || '',

      // Estado y Fechas
      activo: race.activo,
      publicado: race.publicado,
      destacado: race.destacado || false,
      fechaInscripcionInicio: race.fechaInscripcionInicio || null,
      fechaInscripcionCierre: race.fechaInscripcionCierre,
    });

    this.editingId = race.id;
    this.isEditMode = true;

    // Mostrar imagen principal actual
    this.mainFileList = race.imagenPrincipal ? [
      { uid: '-1', name: 'imagen.png', status: 'done', url: race.imagenPrincipal }
    ] : [];

    // Mostrar galería actual
    this.galleryFileList = race.galeria ? race.galeria.map((url, index) => ({
      uid: `-${index + 1}`, name: `galeria-${index}.png`, status: 'done', url: url
    })) : [];

    this.mainImageFile = null;
    this.galleryImageFiles = []; // Se resetea, si sube nuevas, reemplaza la galería

    this.modalVisible = true;
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  deleteRace(id: string): void {
    this.raceService.deleteRace(id).pipe(take(1)).subscribe({
      next: () => this.message.success('Carrera eliminada correctamente.'),
      error: (error) => this.message.error(error.message || 'Error al eliminar la carrera.')
    });
  }

  @HostListener('window:resize')
  setModalWidth() {
    if (window.innerWidth < 992) {
      this.modalWidth = window.innerWidth - 32;
    } else {
      this.modalWidth = 800; // Ancho fijo para el formulario con tabs
    }
  }

  showDetails(race: Race) {
    this.selectedRace = race;
    this.detailsModalVisible = true;
    this.cdr.detectChanges();
  }

  generateSlug(): void {
    const nameControl = this.raceForm.get('nombre');
    const slugControl = this.raceForm.get('slug');

    if (nameControl && slugControl && nameControl.value && !slugControl.value) {
      const slug = nameControl.value
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
      slugControl.setValue(slug);
    }
  }

  // Utilidad para nz-date-picker
  disabledDate = (current: Date): boolean => {
    // No puede seleccionar días anteriores a hoy
    return current && current.getTime() < Date.now() - (24 * 60 * 60 * 1000);
  };
}