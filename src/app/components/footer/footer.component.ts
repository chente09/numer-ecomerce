import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { Category, CategoryService } from '../../services/admin/category/category.service';

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
export class FooterComponent implements OnInit {
  categories: Category[] = [];
  categoriesLoading = true;

  constructor(
      private categoryService: CategoryService
    ) { }
  
    
  currentYear = new Date().getFullYear();

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.categoryService.getCategories().subscribe({
      next: (data) => {
        this.categoriesLoading = false;
      },
      error: (error) => {
        console.error('Error loading categories:', error);
        this.categoriesLoading = false;
      }
    });
  }

  shopLinks = [
    { label: 'Encuentranos', link: '/shop' },
    { label: 'Distribuidores', link: '/shop' },
    { label: 'Nuevas Llegadas', link: '/shop' },
    { label: 'Más Vendidos', link: '/shop' },
  ];
  
  
  supportLinks = [
    { label: 'Contáctanos', link: '/servicio-cliente' },
    { label: 'Envíos y Devoluciones', link: '/servicio-cliente' },
    { label: 'Garantía', link: '/cuidado-producto' },
    { label: 'Cuidado del Producto', link: '/cuidado-producto' },
    { label: 'Preguntas Frecuentes', link: '/servicio-cliente' }
  ];
  
  companyLinks = [
    { label: 'Sobre Nosotros', link: '/nosotros' },
    { label: 'Sostenibilidad', link: '/sustainability' },
    { label: 'Carreras', link: '/careers' },
    { label: 'Embajadores', link: '/ambassadors' },
  ];
  
  socialLinks = [
    { label: 'Instagram', icon: 'bi bi-instagram', link: 'https://www.instagram.com/numer.ec' },
    { label: 'Facebook', icon: 'bi bi-facebook', link: 'https://www.facebook.com' },
    { label: 'YouTube', icon: 'bi bi-youtube', link: 'https://youtube.com/user/blackdiamondequipment' },
    { label: 'Strava', icon: 'bi bi-strava', link: 'https://www.strava.com' }
  ];

}
