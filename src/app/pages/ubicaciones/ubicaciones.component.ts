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
import { Subject, takeUntil } from 'rxjs';

// ✅ IMPORTAR SEO SERVICE
import { SeoService } from '../../services/seo/seo.service';

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

interface DistribuidorAutorizado {
  id: string;
  nombreComercial: string;
  nombreContacto: string;
  ciudad: string;
  provincia: string;
  telefono: string;
  email: string;
  tipo: 'minorista' | 'mayorista' | 'online';
  productosAutorizados: string[];
  fechaAutorizacion: Date;
  activo: boolean;
  logo?: string;
  sitioWeb?: string;
}

interface SolicitudDistribuidor {
  nombreComercial: string;
  nombreContacto: string;
  email: string;
  telefono: string;
  ciudad: string;
  provincia: string;
  tipoNegocio: 'minorista' | 'mayorista' | 'online';
  experiencia: string;
  volumenEstimado: string;
  motivacion: string;
  sitioWeb?: string;
  rlc?: string; // RUC, cédula, etc.
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
    NzSpinModule
  ],
  templateUrl: './ubicaciones.component.html',
  styleUrl: './ubicaciones.component.css'
})
export class UbicacionesComponent implements OnInit, OnDestroy {
  // Estado del componente
  loading = false;
  submitting = false;
  modalVisible = false;

  // Datos
  tiendaFisica: TiendaFisica = {
    id: 'tienda-principal',
    nombre: 'NUMER Store - Tienda Principal',
    direccion: 'Iliniza S7 - 90, Quito 170121',
    ciudad: 'Quito',
    provincia: 'Pichincha',
    telefono: '+593 2 225 4589',
    whatsapp: '+593 98 765 4321',
    email: 'numer.ec21@gmail.com',
    horarios: 'Lunes a Viernes: 9:00 AM - 7:00 PM\nSábados: 9:00 AM - 6:00 PM\nDomingos: 10:00 AM - 4:00 PM',
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

  distribuidores: DistribuidorAutorizado[] = [
    {
      id: '1',
      nombreComercial: 'Aventura Sport',
      nombreContacto: 'Carlos Mendoza',
      ciudad: 'Guayaquil',
      provincia: 'Guayas',
      telefono: '+593 4 123 4567',
      email: 'carlos@aventurasport.com',
      tipo: 'minorista',
      productosAutorizados: ['Calzado', 'Ropa deportiva', 'Accesorios'],
      fechaAutorizacion: new Date('2023-01-15'),
      activo: true
    },
    {
      id: '2',
      nombreComercial: 'Mountain Gear',
      nombreContacto: 'Ana López',
      ciudad: 'Cuenca',
      provincia: 'Azuay',
      telefono: '+593 7 234 5678',
      email: 'ana@mountaingear.ec',
      tipo: 'mayorista',
      productosAutorizados: ['Equipamiento de montaña', 'Camping', 'Escalada'],
      fechaAutorizacion: new Date('2023-03-20'),
      activo: true,
      sitioWeb: 'https://mountaingear.ec'
    }
  ];

  // Formulario
  solicitudForm!: FormGroup;
  
  // Opciones para selects
  provincias = [
    'Pichincha', 'Guayas', 'Azuay', 'Manabí', 'El Oro', 'Tungurahua', 
    'Imbabura', 'Chimborazo', 'Cotopaxi', 'Loja', 'Esmeraldas', 'Los Ríos',
    'Carchi', 'Bolívar', 'Cañar', 'Morona Santiago', 'Pastaza', 'Zamora Chinchipe',
    'Sucumbíos', 'Orellana', 'Napo', 'Francisco de Orellana', 'Santa Elena',
    'Santo Domingo de los Tsáchilas'
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
    // ✅ AGREGAR SEO SERVICE
    private seoService: SeoService
  ) {
    this.createForm();
  }

  ngOnInit(): void {
    // ✅ CONFIGURAR SEO PARA UBICACIONES
    this.seoService.updatePageSEO('ubicaciones', {
      title: 'Ubicaciones y Distribuidores - NUMER Ecuador | Tiendas Físicas',
      description: 'Encuentra nuestra tienda física en Quito y distribuidores autorizados de NUMER en todo Ecuador. Ubicaciones, horarios, contacto y mapa. Pantalón Extraligero, Chompa AGUACERO.',
      keywords: 'NUMER tienda física Quito, distribuidores NUMER Ecuador, ubicaciones tienda outdoor, mapa NUMER store, horarios atención, contacto directo',
      image: 'https://firebasestorage.googleapis.com/v0/b/numer-16f35.firebasestorage.app/o/products%2F27d9425a-2698-452d-8b93-4962772f11b7%2Fcolors%2Fverde%20olivo.webp?alt=media&token=9aaea191-a3c5-47ef-ab6f-c59e0b8226c0'
    });

    console.log('🏪 UbicacionesComponent inicializado con SEO');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createForm(): void {
    this.solicitudForm = this.fb.group({
      nombreComercial: ['', [Validators.required, Validators.minLength(3)]],
      nombreContacto: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      telefono: ['', [Validators.required, Validators.pattern(/^[0-9+\-\s()]+$/)]],
      ciudad: ['', [Validators.required]],
      provincia: ['', [Validators.required]],
      tipoNegocio: ['', [Validators.required]],
      experiencia: ['', [Validators.required, Validators.minLength(20)]],
      volumenEstimado: ['', [Validators.required]],
      motivacion: ['', [Validators.required, Validators.minLength(50)]],
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
      const solicitud: SolicitudDistribuidor = this.solicitudForm.value;
      
      // Aquí integrarías con tu servicio de backend
      console.log('📋 Solicitud de distribuidor:', solicitud);
      
      // Simular llamada al servidor
      await this.simulateApiCall();
      
      this.message.success('¡Solicitud enviada correctamente! Te contactaremos pronto.');
      this.closeModal();
      
      // Opcional: Enviar email o notificación
      this.sendNotificationEmail(solicitud);
      
    } catch (error) {
      console.error('Error enviando solicitud:', error);
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

  private async simulateApiCall(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => resolve(), 2000);
    });
  }

  private async sendNotificationEmail(solicitud: SolicitudDistribuidor): Promise<void> {
    // Aquí integrarías con tu servicio de email
    console.log('📧 Enviando notificación por email...');
  }

  // ==================== MÉTODOS DE UTILIDAD ====================

  openGoogleMaps(): void {
    const { lat, lng } = this.tiendaFisica.coordenadas!;
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

  contactDistributor(distribuidor: DistribuidorAutorizado): void {
    const subject = encodeURIComponent('Consulta sobre productos NUMER');
    const body = encodeURIComponent(`Hola ${distribuidor.nombreContacto}! Quisiera más información sobre los productos NUMER disponibles en su tienda.`);
    const url = `mailto:${distribuidor.email}?subject=${subject}&body=${body}`;
    window.open(url, '_self');
  }

  visitWebsite(url: string): void {
    window.open(url, '_blank');
  }

  getTipoNegocioLabel(tipo: string): string {
    const found = this.tiposNegocio.find(t => t.value === tipo);
    return found ? found.label : tipo;
  }

  // ✅ NUEVO: Método para obtener color del tag según tipo
  getDistributorTagColor(tipo: string): string {
    switch (tipo) {
      case 'mayorista': return 'purple';
      case 'online': return 'cyan';
      case 'minorista': return 'green';
      default: return 'blue';
    }
  }

  // ✅ NUEVO: TrackBy functions para mejorar performance
  trackByDistributor(index: number, distribuidor: DistribuidorAutorizado): string {
    return distribuidor.id;
  }

  trackByProduct(index: number, producto: string): string {
    return producto;
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
      if (field.errors['pattern']) return 'Formato inválido';
    }
    return '';
  }
}