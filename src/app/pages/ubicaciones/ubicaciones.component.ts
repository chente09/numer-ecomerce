import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { Subject, takeUntil, take, firstValueFrom } from 'rxjs';

// ✅ IMPORTAR SERVICIOS
import { SeoService } from '../../services/seo/seo.service';
import { AuthorizedDistributorService, AuthorizedDistributor } from '../../services/admin/authorized-distributor/authorized-distributor.service';
import { TelegramAdminService } from '../../services/admin/telegramAdmin/telegram-admin.service';

interface TiendaFisica {
  id: string;
  nombre: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  telefono: string;
  whatsapp?: string;
  email: string;
  horarios: string;
  coordenadas?: {
    lat: number;
    lng: number;
  };
  servicios: string[];
  imagen?: string;
  activa: boolean;
}

@Component({
  selector: 'app-ubicaciones',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzGridModule,
    NzIconModule,
    NzModalModule,
    NzTagModule,
    NzDividerModule,
    NzToolTipModule,
    NzSpinModule,
    NzAvatarModule  // ✅ AGREGADO
  ],
  templateUrl: './ubicaciones.component.html',
  styleUrl: './ubicaciones.component.css'
})
export class UbicacionesComponent implements OnInit, OnDestroy {
  // Estado del componente
  loading = false;
  loadingDistributors = true; // ✅ NUEVO: Estado específico para distribuidores
  submitting = false;
  modalVisible = false;

  // Datos
  tiendaFisica: TiendaFisica = {
    id: 'tienda-principal',
    nombre: 'NUMER - Workshop',
    direccion: 'Iliniza S7 - 90, Quito 170121',
    ciudad: 'Quito',
    provincia: 'Pichincha',
    telefono: '+593 2 225 4589',
    whatsapp: '+593 98 765 4321',
    email: 'numer.ec21@gmail.com',
    horarios: 'Lunes a Viernes: 8:00 AM - 5:00 PM\nSábados: Bajo cita previa\nDomingos: Cerrado',
    coordenadas: {
      lat: -0.24029944583596685,
      lng: -78.5150122067466
    },
    servicios: [
      'Venta de productos',
      'Asesoramiento especializado',
      'Servicio técnico',
      'Garantías y devoluciones',
      'Prueba de productos'
    ],
    activa: true
  };

  // ✅ CAMBIADO: Ahora será cargado desde Firebase
  distribuidores: AuthorizedDistributor[] = [];

  // Formulario
  solicitudForm!: FormGroup;

  // Opciones para selects
  provincias = [
    'Azuay', 'Bolívar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi',
    'El Oro', 'Esmeraldas', 'Galápagos', 'Guayas', 'Imbabura', 'Loja',
    'Los Ríos', 'Manabí', 'Morona Santiago', 'Napo', 'Orellana', 'Pastaza',
    'Pichincha', 'Santa Elena', 'Santo Domingo de los Tsáchilas',
    'Sucumbíos', 'Tungurahua', 'Zamora Chinchipe'
  ];

  tiposNegocio = [
    { value: 'minorista', label: 'Tienda Minorista (Venta al público)' },
    { value: 'mayorista', label: 'Distribuidor Mayorista' },
    { value: 'online', label: 'Tienda Online / E-commerce' }
  ];

  volumenesEstimados = [
    'Menos de $1,000 mensual',
    '$1,000 - $5,000 mensual',
    '$5,000 - $15,000 mensual',
    '$15,000 - $50,000 mensual',
    'Más de $50,000 mensual'
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private message: NzMessageService,
    private modal: NzModalService,
    private seoService: SeoService,
    private authorizedDistributorService: AuthorizedDistributorService,  // ✅ AGREGADO
    private telegramService: TelegramAdminService  // ✅ AGREGADO
  ) {
    this.createForm();
  }

  ngOnInit(): void {
    this.seoService.updatePageSEO('ubicaciones', {
      title: 'Ubicaciones y Distribuidores - NUMER Ecuador | Tiendas Físicas',
      description: 'Encuentra nuestra tienda física en Quito y distribuidores autorizados de NUMER en todo Ecuador. Ubicaciones, horarios, contacto y mapa. Pantalón Extraligero, Chompa AGUACERO.',
      keywords: 'NUMER tienda física Quito, distribuidores NUMER Ecuador, ubicaciones tienda outdoor, mapa NUMER store, horarios atención, contacto directo',
      image: 'https://firebasestorage.googleapis.com/v0/b/numer-16f35.firebasestorage.app/o/products%2F27d9425a-2698-452d-8b93-4962772f11b7%2Fcolors%2Fverde%20olivo.webp?alt=media&token=9aaea191-a3c5-47ef-ab6f-c59e0b8226c0'
    });

    // ✅ NUEVO: Cargar distribuidores
    this.loadDistribuidores();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ✅ NUEVO: Método para cargar distribuidores desde Firebase
  private loadDistribuidores(): void {
    this.loadingDistributors = true;

    this.authorizedDistributorService.getAuthorizedDistributors()
      .pipe(
        take(1),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (distribuidores) => {
          // Filtrar solo distribuidores activos
          this.distribuidores = distribuidores.filter(d => d.activo === true);
          console.log(`✅ Cargados ${this.distribuidores.length} distribuidores activos`);
          this.loadingDistributors = false;
        },
        error: (error) => {
          console.error('❌ Error cargando distribuidores:', error);
          this.message.error('Error al cargar distribuidores');
          this.loadingDistributors = false;
        }
      });
  }

  private createForm(): void {
    this.solicitudForm = this.fb.group({
      nombreComercial: ['', [Validators.required, Validators.minLength(3)]],
      nombreContacto: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      telefono: ['', [Validators.required, Validators.pattern(/^(\+593|593|0)[0-9]{9}$/)]],
      ciudad: ['', [Validators.required]],
      provincia: ['', [Validators.required]],
      tipoNegocio: ['', [Validators.required]],
      experiencia: ['', [Validators.required, Validators.minLength(20)]],
      volumenEstimado: ['', [Validators.required]],
      motivacion: ['', [Validators.required, Validators.minLength(20)]],
      sitioWeb: [''],
      rlc: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  // ==================== MÉTODOS DE ACCIONES ====================

  openDistributorModal(): void {
    this.modalVisible = true;
    this.solicitudForm.reset();
  }

  closeModal(): void {
    this.modalVisible = false;
  }

  async submitSolicitud(): Promise<void> {
    if (!this.solicitudForm.valid) {
      this.markFormGroupTouched();
      this.message.warning('Por favor complete todos los campos requeridos correctamente');
      return;
    }

    this.submitting = true;

    try {
      const formData = this.solicitudForm.value;

      // ✅ Formatear teléfono antes de enviar
      const solicitudData = {
        ...formData,
        telefono: this.formatPhoneNumber(formData.telefono)
      };


      // 1. Guardar solicitud en Firebase
      await firstValueFrom(
        this.authorizedDistributorService.createDistributorRequest(solicitudData)
      );

      console.log('✅ Solicitud guardada en Firebase');

      // 2. Enviar notificación a Telegram (sin bloquear si falla)
      try {
        await this.telegramService.sendDistributorRequestNotification(solicitudData);
        console.log('✅ Notificación de Telegram enviada');
      } catch (telegramError) {
        console.warn('⚠️ No se pudo enviar notificación a Telegram, pero la solicitud se guardó:', telegramError);
        // No mostramos error al usuario, solo logueamos
      }

      // 3. Mostrar mensaje de éxito
      this.message.success('¡Solicitud enviada correctamente! Te contactaremos pronto.');
      this.closeModal();

      console.log('📋 Proceso completado exitosamente');

    } catch (error) {
      console.error('❌ Error enviando solicitud:', error);
      this.message.error('Error al enviar la solicitud. Intenta nuevamente.');
    } finally {
      this.submitting = false;
    }
  }

  private markFormGroupTouched(): void {
    Object.keys(this.solicitudForm.controls).forEach(key => {
      const control = this.solicitudForm.get(key);
      control?.markAsTouched();
      control?.updateValueAndValidity();
    });
  }

  // ==================== MÉTODOS DE UTILIDAD ====================

  openGoogleMaps(): void {
    const url = `https://maps.app.goo.gl/xtY8Gbp8q6s6Juy4A`;
    window.open(url, '_blank');
  }

  openWhatsApp(): void {
    const phone = this.tiendaFisica.whatsapp?.replace(/[^0-9]/g, '');
    const message = encodeURIComponent('Hola! Quisiera más información sobre sus productos.');
    const url = `https://wa.me/${phone}?text=${message}`;
    window.open(url, '_blank');
  }

  callPhone(): void {
    window.open(`tel:${this.tiendaFisica.telefono}`, '_self');
  }

  sendEmail(): void {
    const subject = encodeURIComponent('Consulta sobre productos NUMER');
    const body = encodeURIComponent('Hola! Quisiera más información sobre sus productos.');
    const url = `mailto:${this.tiendaFisica.email}?subject=${subject}&body=${body}`;
    window.open(url, '_self');
  }

  // ✅ ACTUALIZADO: Usar la interfaz correcta
  contactDistributor(distribuidor: AuthorizedDistributor): void {
    const subject = encodeURIComponent('Consulta sobre productos NUMER');
    const body = encodeURIComponent(`Hola ${distribuidor.nombreContacto}! Quisiera más información sobre los productos NUMER disponibles en su tienda.`);
    const url = `mailto:${distribuidor.email}?subject=${subject}&body=${body}`;
    window.open(url, '_self');
  }

  visitWebsite(url: string): void {
    if (url) {
      window.open(url, '_blank');
    }
  }

  getTipoNegocioLabel(tipo: string): string {
    const found = this.tiposNegocio.find(t => t.value === tipo);
    return found ? found.label : tipo;
  }

  getDistributorTagColor(tipo: string): string {
    switch (tipo) {
      case 'mayorista': return 'purple';
      case 'online': return 'cyan';
      case 'minorista': return 'green';
      default: return 'blue';
    }
  }

  trackByDistributor(index: number, distribuidor: AuthorizedDistributor): string {
    return distribuidor.id;
  }

  trackByProduct(index: number, producto: string): string {
    return producto;
  }

  // ✅ NUEVO: Manejo de errores de imágenes
  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmaWxsPSIjOTk5OTk5Ij5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';
      imgElement.classList.add('error-image');
    }
  }

  // ==================== VALIDACIONES DEL FORMULARIO ====================

  isFieldInvalid(fieldName: string): boolean {
    const field = this.solicitudForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  getFieldError(fieldName: string): string {
    const field = this.solicitudForm.get(fieldName);
    if (field && field.errors && field.touched) {
      if (field.errors['required']) return 'Este campo es requerido';
      if (field.errors['email']) return 'Email inválido';
      if (field.errors['minlength']) return `Mínimo ${field.errors['minlength'].requiredLength} caracteres`;

      // ✅ Mensaje específico para teléfono
      if (field.errors['pattern'] && fieldName === 'telefono') {
        return 'Ingresa un número ecuatoriano válido (ej: 0999123456)';
      }

      if (field.errors['pattern']) return 'Formato inválido';
    }
    return '';
  }

  /**
 * Previene conflictos de eventos en inputs
 */
  onInputKeydown(event: KeyboardEvent): void {
    // No hacer nada - solo permitir que el evento fluya normalmente
    // Este handler vacío previene que ng-zorro interfiera con el input
    event.stopPropagation();
  }

  /**
   * Maneja el input para evitar pérdida de caracteres
   */
  onInputChange(event: Event, fieldName: string): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (target) {
      this.solicitudForm.patchValue({
        [fieldName]: target.value
      }, { emitEvent: false });
    }
  }

  /**
 * Formatea número de teléfono ecuatoriano con código de país
 * Acepta: 0999123456, 593999123456, +593999123456
 * Retorna: +593999123456
 */
  formatPhoneNumber(phone: string): string {
    if (!phone) return '';

    // Remover todos los caracteres no numéricos excepto el +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Casos:
    // 1. Ya tiene +593 al inicio
    if (cleaned.startsWith('+593')) {
      return cleaned;
    }

    // 2. Tiene 593 al inicio sin +
    if (cleaned.startsWith('593')) {
      return '+' + cleaned;
    }

    // 3. Número local que empieza con 0 (ej: 0999123456)
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      return '+593' + cleaned.substring(1);
    }

    // 4. Número sin código (ej: 999123456)
    if (cleaned.length === 9) {
      return '+593' + cleaned;
    }

    // Si no coincide con ningún patrón, retornar sin modificar
    console.warn('⚠️ Formato de teléfono no reconocido:', phone);
    return cleaned;
  }

  openWhatsAppDistributor(distribuidor: AuthorizedDistributor): void {
    if (distribuidor.whatsapp) {
      const cleanNumber = distribuidor.whatsapp.replace(/[^0-9]/g, '');
      const message = encodeURIComponent(`Hola ${distribuidor.nombreContacto}! Quisiera información sobre productos NUMER.`);
      const url = `https://wa.me/${cleanNumber}?text=${message}`;
      window.open(url, '_blank');
    }
  }

  formatProductoHashtag(producto: string): string {
    return producto.replace(/\s+/g, '');
  }
}