import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { NzUploadChangeParam, NzUploadModule } from 'ng-zorro-antd/upload';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';

@Component({
  selector: 'app-cuidado-producto',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    NzTabsModule,
    NzCardModule,
    NzGridModule,
    NzCollapseModule,
    NzDividerModule,
    NzTimelineModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzDatePickerModule,
    NzUploadModule,
    NzButtonModule,
    NzIconModule,
    NzSpinModule
  ],
  templateUrl: './cuidado-producto.component.html',
  styleUrl: './cuidado-producto.component.css'
})
export class CuidadoProductoComponent implements OnInit {

  // Formulario para registro de garantía
  warrantyForm!: FormGroup;
  
  // Categorías de cuidado de productos
  productCareCategories = [
    {
      title: 'Ropa de Montaña',
      description: 'Cuidado específico para prendas técnicas y de alto rendimiento',
      imageUrl: 'https://i.postimg.cc/RZNyyyFQ/53894.jpg',
      instructions: [
        'Lavar a mano o en ciclo suave con agua fría',
        'Usar detergente especial para telas técnicas',
        'No usar suavizante',
        'Dejar secar a temperatura ambiente',
        'Guardar en un lugar fresco y seco'
      ]
    },
    {
      title: 'Equipamiento de Escalada',
      description: 'Mantenimiento adecuado para material de escalada y seguridad',
      imageUrl: 'https://i.postimg.cc/ZYXTw8jQ/bg.jpg',
      instructions: [
        'Revisar visualmente antes de cada uso',
        'Limpiar con agua tibia y jabón neutro',
        'Secar completamente antes de guardar',
        'Almacenar lejos de productos químicos',
        'Reemplazar según las recomendaciones del fabricante'
      ]
    },
    {
      title: 'Esquí y Deportes de Invierno',
      description: 'Consejos para mantener tu equipo de esquí y snowboard',
      imageUrl: 'https://i.postimg.cc/RZNyyyFQ/53894.jpg',
      instructions: [
        'Limpiar después de cada uso',
        'Aplicar cera según condiciones de nieve',
        'Almacenar en lugar seco y temperatura estable',
        'Revisar fijaciones periódicamente',
        'Proteger de la humedad y óxido'
      ]
    }
  ];
  
  // Consejos generales
  generalTips = [
    {
      title: 'Lavado y Mantenimiento Regular',
      content: 'El cuidado regular extiende significativamente la vida útil de tus productos Numer:',
      bullets: [
        'Sigue siempre las instrucciones de la etiqueta de cuidado',
        'Utiliza detergentes específicos para tejidos técnicos',
        'Evita suavizantes y blanqueadores',
        'Cierra todos los cierres antes del lavado',
        'Seca al aire libre, evitando la luz solar directa'
      ]
    },
    {
      title: 'Almacenamiento Adecuado',
      content: 'El almacenamiento correcto es crucial para mantener las propiedades técnicas de los productos:',
      bullets: [
        'Guarda en un lugar fresco y seco',
        'Evita la compresión prolongada de materiales aislantes',
        'No almacenes productos húmedos',
        'Mantén alejado de fuentes de calor directas',
        'Usa perchas adecuadas para prendas técnicas'
      ]
    },
    {
      title: 'Reparaciones y Mantenimiento Preventivo',
      content: 'El mantenimiento preventivo puede evitar problemas mayores:',
      bullets: [
        'Repara pequeños desgarros o roturas inmediatamente',
        'Realiza inspecciones periódicas de costuras y cierres',
        'Renueva el tratamiento DWR cuando notes que el agua ya no se desliza',
        'Utiliza productos específicos para cada tipo de material',
        'Consulta nuestro servicio técnico para reparaciones complejas'
      ]
    }
  ];
  
  // Preguntas frecuentes sobre garantía
  warrantyFaqs = [
    {
      question: '¿Cómo puedo saber si mi problema está cubierto por la garantía?',
      answer: 'Si tu producto presenta un defecto en los materiales o fabricación bajo uso normal y dentro del período de garantía, generalmente estará cubierto. Los signos de defectos de fabricación incluyen costuras que se deshacen, cremalleras que fallan sin causa aparente, o materiales que se deterioran prematuramente. Si tienes dudas, puedes enviarnos fotos a <strong>garantia@numer.ec</strong> para una evaluación inicial.'
    },
    {
      question: '¿Puedo transferir la garantía si regalo o vendo el producto?',
      answer: 'La garantía de Numer no es transferible y aplica únicamente para el comprador original. Es importante conservar tu factura o comprobante de compra como prueba de adquisición original.'
    },
    {
      question: '¿Qué pasa si no tengo el recibo de compra?',
      answer: 'El comprobante de compra es necesario para validar la garantía. Sin embargo, en algunos casos podemos verificar la compra a través de nuestro sistema si proporcionas información detallada como la fecha aproximada, método de pago y tienda donde realizaste la compra. También puedes registrar tu producto en nuestra web tras la compra para facilitar este proceso.'
    },
    {
      question: '¿Cuánto tiempo tarda el proceso de garantía?',
      answer: 'Una vez que recibamos tu producto y la documentación necesaria, nuestro equipo técnico realizará una evaluación en un plazo de 5-7 días hábiles. Si se aprueba la garantía, la reparación o reemplazo puede tomar entre 1-3 semanas adicionales, dependiendo de la disponibilidad del producto.'
    },
    {
      question: '¿Numer cubre los gastos de envío para la garantía?',
      answer: 'Para productos dentro del primer año de garantía, Numer cubre los gastos de envío en ambas direcciones. Para productos entre 1-2 años, el cliente debe cubrir el costo de envío inicial, y Numer cubrirá el costo de devolución si el caso está cubierto por la garantía.'
    }
  ];
  
  // Modelos de productos para el formulario
  productModels = [
    { value: 'sendero', label: 'Pantalón Sendero' },
    { value: 'barranco', label: 'Pantalón Barranco' },
    { value: 'aguacero', label: 'Chaqueta Aguacero' },
    { value: 'cumbre', label: 'Mochila Cumbre' },
    { value: 'rocio', label: 'Camiseta Rocío' },
    { value: 'bosque', label: 'Polar Bosque' }
  ];

  constructor(
    private fb: FormBuilder,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  // Inicializar formulario con validaciones
  initForm(): void {
    this.warrantyForm = this.fb.group({
      fullName: [null, [Validators.required]],
      email: [null, [Validators.required, Validators.email]],
      productModel: [null, [Validators.required]],
      serialNumber: [null, [Validators.required]],
      purchaseDate: [null, [Validators.required]],
      receipt: [null]
    });
  }

  // Manejar cambios en la carga de archivos
  handleUploadChange(info: NzUploadChangeParam): void {
    if (info.file.status === 'done') {
      this.message.success(`${info.file.name} se ha subido correctamente`);
    } else if (info.file.status === 'error') {
      this.message.error(`${info.file.name} no se pudo subir.`);
    }
  }

  // Enviar formulario de garantía
  submitWarrantyForm(): void {
    if (this.warrantyForm.valid) {
      // Aquí iría la lógica para enviar el formulario al backend
      console.log('Formulario enviado:', this.warrantyForm.value);
      this.message.success('¡Tu producto ha sido registrado correctamente!');
      this.warrantyForm.reset();
    } else {
      Object.values(this.warrantyForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }

}
