import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzUploadModule, NzUploadFile } from 'ng-zorro-antd/upload';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Subject, takeUntil, finalize, take, switchMap, catchError, of } from 'rxjs';

import { AuthorizedDistributorService, AuthorizedDistributor, DistributorRequest } from '../../../services/admin/authorized-distributor/authorized-distributor.service';
import { NzBadgeModule } from 'ng-zorro-antd/badge';

@Component({
  selector: 'app-distribuidores',
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
    NzTabsModule,
    NzSelectModule,
    NzSwitchModule,
    NzTagModule,
    NzDividerModule,
    NzDescriptionsModule,
    NzBadgeModule
  ],
  templateUrl: './distribuidores.component.html',
  styleUrls: ['./distribuidores.component.css']
})
export class DistribuidoresComponent implements OnInit, OnDestroy {
  // ==================== VARIABLES PRINCIPALES ====================

  // Distribuidores autorizados
  distributors: AuthorizedDistributor[] = [];
  loading = false;
  saving = false;
  modalVisible = false;
  isEditMode = false;
  distributorForm!: FormGroup;
  editingId: string | null = null;
  detailsModalVisible = false;
  viewingDistributor: AuthorizedDistributor | null = null;
  convertingRequestId: string | null = null;

  // Solicitudes de distribuidores
  solicitudes: DistributorRequest[] = [];
  loadingSolicitudes = false;
  solicitudModalVisible = false;
  viewingSolicitud: DistributorRequest | null = null;

  // Upload de imágenes
  logoFileList: NzUploadFile[] = [];
  storeImageFileList: NzUploadFile[] = [];
  logoFile: File | null = null;
  storeImageFile: File | null = null;
  logoErrorMessage: string | null = null;
  storeImageErrorMessage: string | null = null;

  // UI
  currentTab = 0;
  modalWidth = 700;
  fallbackImageUrl: SafeUrl;
  selectedDistributor: AuthorizedDistributor | null = null;

  // Provincias de Ecuador
  provincias = [
    'Azuay', 'Bolívar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi',
    'El Oro', 'Esmeraldas', 'Galápagos', 'Guayas', 'Imbabura', 'Loja',
    'Los Ríos', 'Manabí', 'Morona Santiago', 'Napo', 'Orellana', 'Pastaza',
    'Pichincha', 'Santa Elena', 'Santo Domingo de los Tsáchilas',
    'Sucumbíos', 'Tungurahua', 'Zamora Chinchipe'
  ];

  tiposDistribuidor = [
    { value: 'minorista', label: 'Minorista' },
    { value: 'mayorista', label: 'Mayorista' },
    { value: 'online', label: 'Online' }
  ];

  // Tab actual para solicitudes/distribuidores
  mainTabIndex = 0;

  get solicitudesPendientes(): number {
    return this.solicitudes.filter(s => s.estado === 'pendiente').length;
  }

  private destroy$ = new Subject<void>();

  constructor(
    private authorizedDistributorService: AuthorizedDistributorService,
    private message: NzMessageService,
    private modalService: NzModalService,
    private sanitizer: DomSanitizer,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    const fallbackImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmaWxsPSIjOTk5OTk5Ij5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';
    this.fallbackImageUrl = this.sanitizer.bypassSecurityTrustUrl(fallbackImage);
    this.createForm();
  }

  ngOnInit(): void {
    this.fetchDistributors();
    this.fetchSolicitudes();
    this.setModalWidth();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==================== FORMULARIO ====================

  createForm(): void {
    this.distributorForm = this.fb.group({
      // Tab 1: Información Básica
      nombreComercial: ['', [Validators.required, Validators.minLength(3)]],
      nombreContacto: ['', [Validators.required, Validators.minLength(3)]],
      tipo: ['', [Validators.required]],
      activo: [true],

      // Tab 2: Ubicación y Contacto
      direccion: ['', [Validators.required]],
      ciudad: ['', [Validators.required]],
      provincia: ['', [Validators.required]],
      telefono: ['', [Validators.required, Validators.pattern(/^[0-9+\-\s()]+$/)]],
      whatsapp: ['', [Validators.pattern(/^[0-9+\-\s()]+$/)]],
      email: ['', [Validators.required, Validators.email]],
      googleMapsLink: ['', [Validators.pattern(/^https?:\/\/.+/)]],

      // Tab 3: Presencia Digital
      sitioWeb: ['', [Validators.pattern(/^https?:\/\/.+/)]],
      redesSociales: [''],

      // Tab 4: Comentarios
      comentarios: ['']
    });
  }

  // ==================== CARGA DE DATOS ====================

  fetchDistributors(): void {
    this.loading = true;
    this.cdr.detectChanges();

    this.authorizedDistributorService.getAuthorizedDistributors()
      .pipe(
        take(1),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data) => {
          this.distributors = data || [];
          console.log(`✅ Cargados ${this.distributors.length} distribuidores`);
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error al cargar distribuidores:', error);
          this.message.error('Error al cargar distribuidores. Intente nuevamente.');
        }
      });
  }

  fetchSolicitudes(): void {
    this.loadingSolicitudes = true;
    this.cdr.detectChanges();

    this.authorizedDistributorService.getDistributorRequests()
      .pipe(
        take(1),
        finalize(() => {
          this.loadingSolicitudes = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data) => {
          // Ordenar por fecha más reciente primero
          this.solicitudes = data.sort((a, b) => {
            const dateA = a.fechaSolicitud instanceof Date ? a.fechaSolicitud.getTime() :
              (a.fechaSolicitud as any)?.toDate ? (a.fechaSolicitud as any).toDate().getTime() : 0;
            const dateB = b.fechaSolicitud instanceof Date ? b.fechaSolicitud.getTime() :
              (b.fechaSolicitud as any)?.toDate ? (b.fechaSolicitud as any).toDate().getTime() : 0;
            return dateB - dateA;
          });
          console.log(`✅ Cargadas ${this.solicitudes.length} solicitudes`);
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error cargando solicitudes:', error);
          this.message.error('Error al cargar solicitudes');
        }
      });
  }

  // ==================== MODAL DISTRIBUIDORES ====================

  openModal(): void {
    this.modalVisible = true;
    this.currentTab = 0;
    this.distributorForm.reset({ activo: true });
    this.logoFileList = [];
    this.storeImageFileList = [];
    this.isEditMode = false;
    this.editingId = null;
    this.logoFile = null;
    this.storeImageFile = null;
    this.logoErrorMessage = null;
    this.storeImageErrorMessage = null;
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  // ✅ MODIFICADO: Asegurar limpieza al cerrar modal
  closeModal(): void {
    this.modalVisible = false;
    this.saving = false;
    this.currentTab = 0;
    this.logoFileList = [];
    this.storeImageFileList = [];
    this.logoFile = null;
    this.storeImageFile = null;
    this.logoErrorMessage = null;
    this.storeImageErrorMessage = null;
    this.isEditMode = false;
    this.editingId = null;

    // Limpieza de estado de conversión
    this.convertingRequestId = null;

    this.distributorForm.reset({ activo: true });
    this.cdr.detectChanges();
  }
  async editDistributor(distributor: AuthorizedDistributor): Promise<void> {
    // Parsear redes sociales si existen
    let redesSocialesText = '';
    if (distributor.redesSociales) {
      const redes = [];
      if (distributor.redesSociales.facebook) redes.push(`Facebook: ${distributor.redesSociales.facebook}`);
      if (distributor.redesSociales.instagram) redes.push(`Instagram: ${distributor.redesSociales.instagram}`);
      if (distributor.redesSociales.tiktok) redes.push(`TikTok: ${distributor.redesSociales.tiktok}`);
      if (distributor.redesSociales.twitter) redes.push(`Twitter: ${distributor.redesSociales.twitter}`);
      redesSocialesText = redes.join('\n');
    }

    this.distributorForm.patchValue({
      nombreComercial: distributor.nombreComercial,
      nombreContacto: distributor.nombreContacto,
      tipo: distributor.tipo,
      activo: distributor.activo,
      direccion: distributor.direccion,
      ciudad: distributor.ciudad,
      provincia: distributor.provincia,
      telefono: distributor.telefono,
      whatsapp: distributor.whatsapp || '',
      email: distributor.email,
      googleMapsLink: distributor.googleMapsLink || '',
      sitioWeb: distributor.sitioWeb || '',
      redesSociales: redesSocialesText,
      comentarios: distributor.comentarios || ''
    });

    this.editingId = distributor.id;
    this.isEditMode = true;

    // Mostrar imágenes actuales
    this.logoFileList = distributor.logoUrl ? [{
      uid: '-1',
      name: 'logo.webp',
      status: 'done',
      url: distributor.logoUrl
    }] : [];

    this.storeImageFileList = distributor.storeImageUrl ? [{
      uid: '-2',
      name: 'store.webp',
      status: 'done',
      url: distributor.storeImageUrl
    }] : [];

    this.modalVisible = true;
    this.currentTab = 0;
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  viewDistributor(distributor: AuthorizedDistributor): void {
    this.viewingDistributor = distributor;
    this.detailsModalVisible = true;
    this.cdr.detectChanges();
  }

  closeDetailsModal(): void {
    this.detailsModalVisible = false;
    this.viewingDistributor = null;
    this.cdr.detectChanges();
  }

  editFromDetails(): void {
    if (this.viewingDistributor) {
      this.closeDetailsModal();
      this.editDistributor(this.viewingDistributor);
    }
  }

  // ==================== SUBMIT ====================

  handleSubmit(): void {
    // 1. Marcar todos los campos como tocados (Validación visual)
    Object.keys(this.distributorForm.controls).forEach(key => {
      this.distributorForm.get(key)?.markAsDirty();
      this.distributorForm.get(key)?.updateValueAndValidity();
    });

    // 2. Validación general del formulario
    if (!this.distributorForm.valid) {
      this.message.warning('Por favor complete todos los campos obligatorios correctamente.');
      return;
    }

    // 3. Validación de imágenes (Solo requeridas si es creación nueva)
    if (!this.isEditMode && (!this.logoFile || !this.storeImageFile)) {
      this.message.warning('Por favor seleccione el logo y la foto de la tienda.');
      return;
    }

    // 4. Iniciar estado de carga
    this.saving = true;
    this.cdr.detectChanges();

    // 5. Preparar datos
    const formData = this.distributorForm.value;
    const redesSociales = this.parseRedesSociales(formData.redesSociales);

    const distributorData: any = {
      nombreComercial: formData.nombreComercial,
      nombreContacto: formData.nombreContacto,
      tipo: formData.tipo,
      activo: formData.activo,
      direccion: formData.direccion,
      ciudad: formData.ciudad,
      provincia: formData.provincia,
      telefono: formData.telefono,
      whatsapp: formData.whatsapp || null,
      email: formData.email,
      googleMapsLink: formData.googleMapsLink || null,
      sitioWeb: formData.sitioWeb || null,
      redesSociales: Object.keys(redesSociales).length > 0 ? redesSociales : null,
      comentarios: formData.comentarios || null,
      productosAutorizados: []
    };

    // ================= LÓGICA DE GUARDADO =================

    if (this.isEditMode && this.editingId) {
      // CASO A: ACTUALIZAR (UPDATE)
      this.authorizedDistributorService.updateAuthorizedDistributor(
        this.editingId,
        distributorData,
        this.logoFile || undefined,
        this.storeImageFile || undefined
      ).pipe(
        take(1),
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        })
      ).subscribe({
        next: () => {
          this.message.success('Distribuidor actualizado correctamente.');
          this.fetchDistributors();
          setTimeout(() => this.closeModal(), 300);
        },
        error: (error) => {
          console.error('Error al actualizar distribuidor:', error);
          this.message.error(error.message || 'Error al actualizar el distribuidor.');
        }
      });

    } else {
      // CASO B: CREAR (CREATE) - Aquí integramos la lógica de conversión
      this.authorizedDistributorService.createAuthorizedDistributor(
        distributorData,
        this.logoFile!,
        this.storeImageFile!
      ).pipe(
        take(1),
        // Encadenamos la siguiente operación: Actualizar solicitud (si existe)
        switchMap((newDistributorId) => {

          // Si venimos de una solicitud ("Aprobar y Crear")
          if (this.convertingRequestId) {
            console.log(`🔗 Vinculando nuevo distribuidor con solicitud ${this.convertingRequestId}`);

            return this.authorizedDistributorService.updateDistributorRequestStatus(
              this.convertingRequestId,
              'aprobada'
            ).pipe(
              // Manejamos error específico de la actualización de estado para no romper todo el flujo
              catchError(err => {
                console.error('⚠️ Distribuidor creado, pero falló actualización de estado de solicitud', err);
                return of(null); // Retornamos null para continuar el flujo exitoso del distribuidor
              })
            );
          }

          // Si es creación manual normal, retornamos observable vacío para seguir
          return of(null);
        }),
        // Finalize se ejecuta siempre al terminar todo el flujo
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        })
      ).subscribe({
        next: () => {
          // Mensaje dinámico según el caso
          const msg = this.convertingRequestId
            ? 'Solicitud aprobada y Distribuidor creado correctamente.'
            : 'Distribuidor creado correctamente.';

          this.message.success(msg);

          // Recargamos ambas tablas
          this.fetchDistributors();
          if (this.convertingRequestId) {
            this.fetchSolicitudes(); // Para ver que desapareció de pendientes o cambió estado
          }

          setTimeout(() => this.closeModal(), 300);
        },
        error: (error) => {
          console.error('Error al crear distribuidor:', error);
          this.message.error(error.message || 'Error al crear el distribuidor.');
        }
      });
    }
  }

  deleteDistributor(id: string): void {
    this.authorizedDistributorService.deleteAuthorizedDistributor(id).pipe(
      take(1)
    ).subscribe({
      next: () => {
        this.message.success('Distribuidor eliminado correctamente.');
        this.fetchDistributors();
      },
      error: (error) => {
        console.error('Error al eliminar distribuidor:', error);
        this.message.error(error.message || 'Error al eliminar el distribuidor.');
      }
    });
  }

  // ==================== GESTIÓN DE SOLICITUDES ====================

  viewSolicitud(solicitud: DistributorRequest): void {
    this.viewingSolicitud = solicitud;
    this.solicitudModalVisible = true;
    this.cdr.detectChanges();
  }

  closeSolicitudModal(): void {
    this.solicitudModalVisible = false;
    this.viewingSolicitud = null;
    this.cdr.detectChanges();
  }

  // ✅ MODIFICADO: Ahora inicia el flujo de creación con pre-llenado
  aprobarSolicitud(solicitud: DistributorRequest): void {
    // 1. Preparamos el entorno
    this.convertingRequestId = solicitud.id; // Guardamos el ID para actualizarlo luego
    this.openModal(); // Abrimos el modal (esto resetea el form, así que el patch va después)

    // 2. Construimos el comentario con la info extra que no tiene campo propio
    const comentariosExtra = `
      [DATOS DE SOLICITUD]
      RUC/Cédula: ${solicitud.rlc}
      Experiencia: ${solicitud.experiencia}
      Volumen Est.: ${solicitud.volumenEstimado}
      Motivación: ${solicitud.motivacion}
    `.trim();

    // 3. Pre-llenamos el formulario (Mapeo de campos)
    this.distributorForm.patchValue({
      nombreComercial: solicitud.nombreComercial,
      nombreContacto: solicitud.nombreContacto,
      email: solicitud.email,
      telefono: solicitud.telefono,
      whatsapp: solicitud.telefono, // Sugerimos el mismo número para WA
      direccion: solicitud.direccion || '', // A veces es opcional en solicitud
      ciudad: solicitud.ciudad,
      provincia: solicitud.provincia,
      tipo: solicitud.tipoNegocio, // Asegúrate que los values coincidan ('minorista', etc)
      sitioWeb: solicitud.sitioWeb || '',
      activo: true,
      comentarios: comentariosExtra
    });

    // 4. Feedback visual
    this.message.info('Revisa los datos, sube las imágenes y guarda para aprobar.');
  }

  rechazarSolicitud(solicitud: DistributorRequest): void {
    this.modalService.confirm({
      nzTitle: '¿Rechazar esta solicitud?',
      nzContent: `La solicitud de "${solicitud.nombreComercial}" será marcada como rechazada.`,
      nzOkText: 'Rechazar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: 'Cancelar',
      nzOnOk: () => {
        this.actualizarEstadoSolicitud(solicitud.id, 'rechazada');
      }
    });
  }

  eliminarSolicitud(solicitud: DistributorRequest): void {
    this.modalService.confirm({
      nzTitle: '¿Eliminar esta solicitud permanentemente?',
      nzContent: `La solicitud de "${solicitud.nombreComercial}" será eliminada de forma permanente. Esta acción no se puede deshacer.`,
      nzOkText: 'Eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: 'Cancelar',
      nzOnOk: () => {
        this.saving = true;
        this.cdr.detectChanges();

        this.authorizedDistributorService.deleteDistributorRequest(solicitud.id)
          .pipe(
            take(1),
            finalize(() => {
              this.saving = false;
              this.cdr.detectChanges();
            })
          )
          .subscribe({
            next: () => {
              this.message.success('Solicitud eliminada correctamente');
              this.fetchSolicitudes();
              this.closeSolicitudModal();
            },
            error: (error) => {
              console.error('Error eliminando solicitud:', error);
              this.message.error('Error al eliminar la solicitud');
            }
          });
      }
    });
  }

  private actualizarEstadoSolicitud(id: string, estado: 'aprobada' | 'rechazada'): void {
    this.saving = true;
    this.cdr.detectChanges();

    this.authorizedDistributorService.updateDistributorRequestStatus(id, estado)
      .pipe(
        take(1),
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          this.message.success(`Solicitud ${estado === 'aprobada' ? 'aprobada' : 'rechazada'} correctamente`);
          this.fetchSolicitudes();
          this.closeSolicitudModal();
        },
        error: (error) => {
          console.error('Error actualizando solicitud:', error);
          this.message.error('Error al actualizar la solicitud');
        }
      });
  }

  // ==================== MANEJO DE IMÁGENES ====================

  beforeUploadLogo = (file: NzUploadFile): boolean => {
    this.logoErrorMessage = null;
    return this.validateAndSetImage(file, 'logo');
  };

  beforeUploadStoreImage = (file: NzUploadFile): boolean => {
    this.storeImageErrorMessage = null;
    return this.validateAndSetImage(file, 'store');
  };

  private validateAndSetImage(file: NzUploadFile, type: 'logo' | 'store'): boolean {
    const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name || '');
    if (!isImage) {
      const errorMsg = 'Solo puedes subir archivos de imagen (.jpg, .png, .gif, .webp).';
      if (type === 'logo') {
        this.logoErrorMessage = errorMsg;
      } else {
        this.storeImageErrorMessage = errorMsg;
      }
      return false;
    }

    const actualFile = (file.originFileObj as File) || (file as any);
    if (!actualFile || typeof actualFile.size !== 'number') {
      const errorMsg = 'El archivo es inválido o está corrupto.';
      if (type === 'logo') {
        this.logoErrorMessage = errorMsg;
      } else {
        this.storeImageErrorMessage = errorMsg;
      }
      return false;
    }

    const minSizeKB = 20;
    if (actualFile.size / 1024 <= minSizeKB) {
      const errorMsg = `La imagen debe pesar al menos ${minSizeKB}KB.`;
      if (type === 'logo') {
        this.logoErrorMessage = errorMsg;
      } else {
        this.storeImageErrorMessage = errorMsg;
      }
      return false;
    }

    const maxSizeMB = 6;
    if (actualFile.size / 1024 / 1024 >= maxSizeMB) {
      const errorMsg = `La imagen debe pesar menos de ${maxSizeMB}MB.`;
      if (type === 'logo') {
        this.logoErrorMessage = errorMsg;
      } else {
        this.storeImageErrorMessage = errorMsg;
      }
      return false;
    }

    this.validateImageDimensionsAsync(actualFile, type);
    return false;
  }

  private async validateImageDimensionsAsync(file: File, type: 'logo' | 'store'): Promise<void> {
    try {
      const isValid = await this.checkImageDimensions(file, type);
      if (isValid) {
        this.createImagePreview(file, type);
      }
      this.cdr.detectChanges();
    } catch (error) {
      const errorMsg = 'Error al validar la imagen.';
      if (type === 'logo') {
        this.logoErrorMessage = errorMsg;
      } else {
        this.storeImageErrorMessage = errorMsg;
      }
      this.cdr.detectChanges();
    }
  }

  private checkImageDimensions(file: File, type: 'logo' | 'store'): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        const minWidth = 200;
        const minHeight = 200;

        if (img.width < minWidth || img.height < minHeight) {
          const errorMsg = `La imagen debe tener al menos ${minWidth}x${minHeight} píxeles.`;
          if (type === 'logo') {
            this.logoErrorMessage = errorMsg;
          } else {
            this.storeImageErrorMessage = errorMsg;
          }
          resolve(false);
          return;
        }

        resolve(true);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        const errorMsg = 'No se pudo cargar la imagen. Archivo corrupto.';
        if (type === 'logo') {
          this.logoErrorMessage = errorMsg;
        } else {
          this.storeImageErrorMessage = errorMsg;
        }
        resolve(false);
      };

      img.src = objectUrl;
    });
  }

  private createImagePreview(file: File, type: 'logo' | 'store'): void {
    try {
      const objectUrl = URL.createObjectURL(file);
      const uploadFile: NzUploadFile = {
        uid: `${Date.now()}-${file.name}`,
        name: file.name || 'imagen.jpg',
        status: 'done',
        url: objectUrl
      };

      if (type === 'logo') {
        this.logoFileList = [uploadFile];
        this.logoFile = file;
      } else {
        this.storeImageFileList = [uploadFile];
        this.storeImageFile = file;
      }
    } catch (e) {
      const errorMsg = 'No se pudo cargar la vista previa.';
      if (type === 'logo') {
        this.logoErrorMessage = errorMsg;
      } else {
        this.storeImageErrorMessage = errorMsg;
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

  handleRemoveLogo = (): boolean => {
    this.logoFileList = [];
    this.logoFile = null;
    this.cdr.detectChanges();
    return true;
  };

  handleRemoveStoreImage = (): boolean => {
    this.storeImageFileList = [];
    this.storeImageFile = null;
    this.cdr.detectChanges();
    return true;
  };

  // ==================== UTILIDADES ====================

  private parseRedesSociales(text: string): any {
    if (!text || !text.trim()) return {};

    const redes: any = {};
    const lines = text.split('\n');

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      const colonIndex = trimmedLine.indexOf(':');
      if (colonIndex === -1) return;

      const key = trimmedLine.substring(0, colonIndex).trim().toLowerCase();
      const value = trimmedLine.substring(colonIndex + 1).trim();

      if (key === 'facebook') {
        redes.facebook = value;
      } else if (key === 'instagram') {
        redes.instagram = value;
      } else if (key === 'tiktok') {
        redes.tiktok = value;
      } else if (key === 'twitter' || key === 'x') {
        redes.twitter = value;
      }
    });

    return redes;
  }

  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement && !imgElement.src.includes('data:image')) {
      imgElement.src = this.fallbackImageUrl as string;
      imgElement.classList.add('error-image');
    }
  }

  getTipoLabel(tipo: string): string {
    const found = this.tiposDistribuidor.find(t => t.value === tipo);
    return found ? found.label : tipo;
  }

  getTipoTagColor(tipo: string): string {
    switch (tipo) {
      case 'mayorista': return 'purple';
      case 'online': return 'cyan';
      case 'minorista': return 'green';
      default: return 'blue';
    }
  }

  getEstadoColor(estado: string): string {
    switch (estado) {
      case 'pendiente': return 'orange';
      case 'aprobada': return 'green';
      case 'rechazada': return 'red';
      default: return 'default';
    }
  }

  getEstadoLabel(estado: string): string {
    switch (estado) {
      case 'pendiente': return 'Pendiente';
      case 'aprobada': return 'Aprobada';
      case 'rechazada': return 'Rechazada';
      default: return estado;
    }
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';

    try {
      let dateObj: Date;

      if (date instanceof Date) {
        dateObj = date;
      } else if (date.toDate && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else {
        return 'Fecha inválida';
      }

      return dateObj.toLocaleDateString('es-EC', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Error en fecha';
    }
  }

  @HostListener('window:resize')
  setModalWidth(): void {
    if (window.innerWidth < 768) {
      this.modalWidth = window.innerWidth - 32;
    } else {
      this.modalWidth = 700;
    }
  }

  getWhatsAppLink(whatsapp: string): string {
    const cleanNumber = whatsapp.replace(/[^0-9]/g, '');
    return `https://wa.me/${cleanNumber}`;
  }

  // Navegación entre tabs
  canProceedToNextTab(): boolean {
    switch (this.currentTab) {
      case 0:
        const tab0Valid =
          this.distributorForm.get('nombreComercial')?.valid === true &&
          this.distributorForm.get('nombreContacto')?.valid === true &&
          this.distributorForm.get('tipo')?.valid === true;
        return tab0Valid;
      case 1:
        const tab1Valid =
          this.distributorForm.get('direccion')?.valid === true &&
          this.distributorForm.get('ciudad')?.valid === true &&
          this.distributorForm.get('provincia')?.valid === true &&
          this.distributorForm.get('telefono')?.valid === true &&
          this.distributorForm.get('email')?.valid === true;
        return tab1Valid;
      default:
        return true;
    }
  }

  nextTab(): void {
    if (this.canProceedToNextTab()) {
      this.currentTab++;
    } else {
      this.message.warning('Por favor complete los campos requeridos antes de continuar.');
    }
  }

  prevTab(): void {
    if (this.currentTab > 0) {
      this.currentTab--;
    }
  }
}