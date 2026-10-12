import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';

@Component({
  selector: 'app-cuidado-producto',
  imports: [
    CommonModule,
    RouterModule,
    NzTabsModule,
    NzCardModule,
    NzGridModule,
    NzCollapseModule,
    NzDividerModule,
    NzTimelineModule
  ],
  templateUrl: './cuidado-producto.component.html',
  styleUrl: './cuidado-producto.component.css'
})
export class CuidadoProductoComponent {

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
        'Escríbenos por WhatsApp si tienes dudas sobre una reparación'
      ]
    }
  ];
  
  // Preguntas frecuentes sobre garantía
  warrantyFaqs = [
    {
      question: '¿Cómo puedo saber si mi problema está cubierto por la garantía?',
      answer: 'Si tu producto presenta un defecto en los materiales o fabricación bajo uso normal y dentro del período de garantía, generalmente estará cubierto. Los signos de defectos de fabricación incluyen costuras que se deshacen, cremalleras que fallan sin causa aparente, o materiales que se deterioran prematuramente. Si tienes dudas, puedes enviarnos fotos a <strong>numer.ec21@gmail.com</strong> para una evaluación inicial.'
    },
    {
      question: '¿Puedo transferir la garantía si regalo o vendo el producto?',
      answer: 'La garantía de Numer no es transferible y aplica únicamente para el comprador original. Es importante conservar tu factura o comprobante de compra como prueba de adquisición original.'
    },
    {
      question: '¿Qué pasa si no tengo el recibo de compra?',
      answer: 'El comprobante de compra es necesario para validar la garantía. Si compraste en esta tienda en línea, tu compra queda registrada en "Mis pedidos" y podemos verificarla con tu número de pedido o el correo de tu cuenta.'
    },
    {
      question: '¿Cuánto tiempo tarda el proceso de garantía?',
      answer: 'Una vez que recibamos tu producto y la documentación necesaria, nuestro equipo técnico realizará una evaluación en un plazo de 5-7 días hábiles. Si se aprueba la garantía, la reparación o reemplazo puede tomar entre 1-3 semanas adicionales, dependiendo de la disponibilidad del producto.'
    },
    {
      question: '¿Numer cubre los gastos de envío para la garantía?',
      answer: 'Sí. Si el caso está cubierto por la garantía (1 año desde la compra), Numer cubre los gastos de envío en ambas direcciones.'
    }
  ];
  
}
