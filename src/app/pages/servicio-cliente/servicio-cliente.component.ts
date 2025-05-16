import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';

interface FAQ {
  question: string;
  answer: string;
  active?: boolean;
}

interface OrderStatus {
  orderNumber: string;
  status: string;
  steps: Array<{
    title: string;
    description: string;
    date?: Date;
    completed: boolean;
  }>;
}

@Component({
  selector: 'app-servicio-cliente',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    NzTabsModule,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzIconModule,
    NzCollapseModule,
    NzDividerModule,
    NzSelectModule,
    NzTimelineModule
  ],
  templateUrl: './servicio-cliente.component.html',
  styleUrl: './servicio-cliente.component.css'
})
export class ServicioClienteComponent implements OnInit {

  contactForm!: FormGroup;
  returnForm!: FormGroup;
  orderNumber: string = '';
  orderStatus: OrderStatus | null = null;

  // Datos para desplegables
  subjects = [
    { value: 'product', label: 'Consulta sobre productos' },
    { value: 'order', label: 'Estado de mi pedido' },
    { value: 'return', label: 'Devoluciones' },
    { value: 'payment', label: 'Problemas con el pago' },
    { value: 'other', label: 'Otros' }
  ];

  returnReasons = [
    { value: 'wrong_size', label: 'Talla incorrecta' },
    { value: 'damaged', label: 'Producto dañado' },
    { value: 'not_as_described', label: 'No corresponde a la descripción' },
    { value: 'wrong_item', label: 'Producto incorrecto' },
    { value: 'other', label: 'Otro motivo' }
  ];

  // Preguntas frecuentes
  faqs: FAQ[] = [
    {
      question: '¿Cuáles son los métodos de pago aceptados?',
      answer: 'Aceptamos tarjetas de crédito/débito (Visa, Mastercard), transferencias bancarias y pago contra entrega en determinadas zonas.'
    },
    {
      question: '¿Cuánto tiempo tarda en llegar mi pedido?',
      answer: 'Los tiempos de entrega varían según tu ubicación: <br>• Quito: 1-2 días hábiles<br>• Otras ciudades principales: 2-3 días hábiles<br>• Resto del país: 3-5 días hábiles'
    },
    {
      question: '¿Cómo puedo cambiar la talla de un producto?',
      answer: 'Para cambiar la talla, dirígete a la sección "Mis pedidos" en tu cuenta, selecciona el pedido y elige la opción "Solicitar cambio". Alternativamente, puedes contactarnos directamente a través del botón de contacto o WhatsApp.'
    },
    {
      question: '¿Ofrecen envío internacional?',
      answer: 'Actualmente ofrecemos envíos a todas las ciudades de Ecuador mediante Servientrega. Estamos trabajando para expandir nuestros servicios a más países en un futuro próximo.'
    },
    {
      question: '¿Tienen tiendas físicas?',
      answer: 'Sí, tenemos tiendas físicas en Quito, Guayaquil y Cuenca. Puedes encontrar las direcciones y horarios en la sección "Nuestras Tiendas".'
    },
    {
      question: '¿Puedo cancelar mi pedido?',
      answer: 'Puedes cancelar tu pedido dentro de las primeras 2 horas después de realizarlo. Para hacerlo, ve a "Mis pedidos" y selecciona la opción de cancelar, o contáctanos inmediatamente.'
    }
  ];

  constructor(
    private fb: FormBuilder,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {
    // Configurar formulario de contacto
    this.contactForm = this.fb.group({
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      subject: ['', [Validators.required]],
      message: ['', [Validators.required, Validators.minLength(10)]]
    });

    // Configurar formulario de devolución
    this.returnForm = this.fb.group({
      orderNumber: ['', [Validators.required, Validators.pattern(/^ORD-\d{5}$/)]],
      email: ['', [Validators.required, Validators.email]],
      reason: ['', [Validators.required]],
      comments: ['']
    });

    // Establecer la primera FAQ como abierta por defecto
    if (this.faqs.length > 0) {
      this.faqs[0].active = true;
    }
  }

  submitContactForm(): void {
    if (this.contactForm.valid) {
      // Aquí implementarías la lógica para enviar el formulario
      console.log('Formulario de contacto enviado:', this.contactForm.value);
      
      // Simulación de éxito
      this.message.success('Tu mensaje ha sido enviado. Te responderemos en breve.');
      this.contactForm.reset();
    } else {
      // Marcar todos los campos como touched para mostrar validaciones
      Object.values(this.contactForm.controls).forEach(control => {
        control.markAsTouched();
      });
    }
  }

  submitReturnForm(): void {
    if (this.returnForm.valid) {
      // Aquí implementarías la lógica para procesar la devolución
      console.log('Solicitud de devolución:', this.returnForm.value);
      
      // Simulación de éxito
      this.message.success('Tu solicitud de devolución ha sido recibida. Recibirás instrucciones por correo electrónico.');
      this.returnForm.reset();
    } else {
      Object.values(this.returnForm.controls).forEach(control => {
        control.markAsTouched();
      });
    }
  }

  trackOrder(): void {
    if (!this.orderNumber) {
      this.message.warning('Por favor, ingresa un número de orden válido');
      return;
    }

    // Aquí se conectaría con tu servicio de seguimiento de pedidos
    // Por ahora, simularemos datos de un pedido
    setTimeout(() => {
      // Simulación de búsqueda
      if (this.orderNumber.startsWith('ORD-')) {
        this.orderStatus = {
          orderNumber: this.orderNumber,
          status: 'En proceso',
          steps: [
            {
              title: 'Pedido recibido',
              description: 'Hemos recibido tu pedido correctamente.',
              date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 días atrás
              completed: true
            },
            {
              title: 'Pago confirmado',
              description: 'El pago ha sido procesado correctamente.',
              date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 días atrás
              completed: true
            },
            {
              title: 'Preparando envío',
              description: 'Tu pedido está siendo preparado en nuestro almacén.',
              date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 día atrás
              completed: true
            },
            {
              title: 'En tránsito',
              description: 'Tu pedido está en camino.',
              date: new Date(), // Hoy
              completed: true
            },
            {
              title: 'Entregado',
              description: 'Tu pedido ha sido entregado.',
              completed: false
            }
          ]
        };
      } else {
        this.message.error('No se encontró ningún pedido con ese número. Verifica e intenta nuevamente.');
        this.orderStatus = null;
      }
    }, 1000);
  }
}
