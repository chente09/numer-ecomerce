import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';

@Component({
  selector: 'app-footer',
  imports: [
    CommonModule,
    NzGridModule,
    RouterLink,
    NzIconModule,
    NzInputModule
  ],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent {

  currentYear = new Date().getFullYear();

  shopLinks = [
    { label: 'Nuevas Llegadas', link: '/new-arrivals' },
    { label: 'Más Vendidos', link: '/best-sellers' },
    { label: 'Escalada', link: '/climbing' },
    { label: 'Esquí', link: '/skiing' },
    { label: 'Senderismo y Camping', link: '/hiking-camping' },
    { label: 'Ropa', link: '/apparel' }
  ];
  
  
  supportLinks = [
    { label: 'Contáctanos', link: '/contact' },
    { label: 'Envíos y Devoluciones', link: '/shipping-returns' },
    { label: 'Garantía', link: '/warranty' },
    { label: 'Cuidado del Producto', link: '/product-care' },
    { label: 'Preguntas Frecuentes', link: '/faq' }
  ];
  
  companyLinks = [
    { label: 'Sobre Nosotros', link: '/about' },
    { label: 'Sostenibilidad', link: '/sustainability' },
    { label: 'Carreras', link: '/careers' },
    { label: 'Embajadores', link: '/ambassadors' },
    { label: 'Encontrar un Distribuidor', link: '/dealers' }
  ];
  
  socialLinks = [
    { label: 'Instagram', icon: 'instagram', link: 'https://www.instagram.com/numer.ec' },
    { label: 'Facebook', icon: 'facebook', link: 'https://www.facebook.com' },
    { label: 'YouTube', icon: 'youtube', link: 'https://youtube.com/user/blackdiamondequipment' },
    { label: 'Strava', icon: 'bi bi-strava', link: 'https://www.strava.com' }
  ];

}
