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
import { SeoService } from '../../services/seo/seo.service';
import { UsersService } from '../../services/users/users.service';
import { OrderService, getOrderStatusLabel } from '../../services/order/order.service';
import { RETURN_DAYS, SUPPORT_WHATSAPP } from '../../core/legal';

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

  readonly returnDays = RETURN_DAYS;

  // Preguntas frecuentes
  faqs: FAQ[] = [
    {
      question: '¿Cuáles son los métodos de pago aceptados?',
      answer: 'Pagas en línea con tarjeta de crédito o débito a través de Payphone, de forma segura.'
    },
    {
      question: '¿Cuánto tiempo tarda en llegar mi pedido?',
      answer: 'Los tiempos de entrega varían según tu ubicación: <br>• Quito: 1-2 días hábiles<br>• Otras ciudades principales: 2-3 días hábiles<br>• Resto del país: 3-5 días hábiles'
    },
    {
      question: '¿Cómo puedo cambiar la talla de un producto?',
      answer: `Tienes ${RETURN_DAYS} días desde que recibes tu pedido para solicitar un cambio. Escríbenos por WhatsApp indicando tu número de pedido (lo ves en "Mis pedidos") y la talla que necesitas. El producto debe estar sin uso y con sus etiquetas. Revisa los <a href="/terms">Términos y Condiciones</a>.`
    },
    {
      question: '¿Ofrecen envío internacional?',
      answer: 'Actualmente ofrecemos envíos a todas las ciudades de Ecuador mediante Servientrega. Estamos trabajando para expandir nuestros servicios a más países en un futuro próximo.'
    },
    {
      question: '¿Tienen tiendas físicas?',
      answer: 'Nuestra tienda es el Workshop de NUMER en Quito (Iliniza S7 - 90), y además contamos con distribuidores autorizados en el país. Encuentra direcciones y horarios en la sección <a href="/ubicaciones">Ubicaciones</a>.'
    },
    {
      question: '¿Puedo cancelar mi pedido?',
      answer: 'Si aún no ha sido enviado, escríbenos cuanto antes por WhatsApp indicando tu número de pedido y lo revisamos. Una vez despachado se maneja como devolución, según nuestros <a href="/terms">Términos y Condiciones</a>.'
    }
  ];

  constructor(
    private fb: FormBuilder,
    private message: NzMessageService,
    private seoService: SeoService,
    private usersService: UsersService,
    private orderService: OrderService
  ) {}

  ngOnInit(): void {

    this.seoService.updatePageSEO('servicio-cliente');


    // Configurar formulario de contacto
    this.contactForm = this.fb.group({
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      subject: ['', [Validators.required]],
      message: ['', [Validators.required, Validators.minLength(10)]]
    });

    // Establecer la primera FAQ como abierta por defecto
    if (this.faqs.length > 0) {
      this.faqs[0].active = true;
    }
  }

  submitContactForm(): void {
    if (this.contactForm.valid) {
      // There is no backend inbox: hand the message over to WhatsApp so it is never lost silently
      const { name, email, subject, message } = this.contactForm.value;
      const subjectLabel = this.subjects.find(s => s.value === subject)?.label || subject;
      const text = `Hola, soy ${name} (${email}).\nAsunto: ${subjectLabel}\n${message}`;
      window.open(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      this.contactForm.reset();
    } else {
      // Marcar todos los campos como touched para mostrar validaciones
      Object.values(this.contactForm.controls).forEach(control => {
        control.markAsTouched();
      });
    }
  }

  trackOrder(): void {
    if (!this.orderNumber) {
      this.message.warning('Por favor, ingresa un número de orden válido');
      return;
    }

    const currentUser = this.usersService.getCurrentUser();
    if (!currentUser || currentUser.isAnonymous) {
      this.message.warning('Inicia sesión para rastrear tu pedido — el número de pedido solo no es suficiente para mostrar datos de un cliente.');
      return;
    }

    this.orderService.getOrderById(this.orderNumber).subscribe({
      next: (order) => {
        if (!order || order.userId !== currentUser.uid) {
          this.message.error('No se encontró ningún pedido con ese número asociado a tu cuenta. Verifica e intenta nuevamente.');
          this.orderStatus = null;
          return;
        }

        this.orderStatus = {
          orderNumber: order.orderId,
          status: getOrderStatusLabel(order.status),
          steps: (order.statusHistory || []).map(step => ({
            title: getOrderStatusLabel(step.status),
            description: step.note || '',
            date: (step.date as any)?.toDate ? (step.date as any).toDate() : new Date(step.date as any),
            completed: true
          }))
        };
      },
      error: () => {
        this.message.error('No se encontró ningún pedido con ese número. Verifica e intenta nuevamente.');
        this.orderStatus = null;
      }
    });
  }
}
