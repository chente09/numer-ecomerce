import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzDropDownModule, NzPlacementType } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NavigationEnd, Router, RouterLink, RouterModule } from '@angular/router';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { filter } from 'rxjs';

@Component({
  selector: 'app-nav-bar',
  standalone: true,
  imports: [
    CommonModule,
    NzDropDownModule,
    NzIconModule,
    NzBadgeModule,
    RouterLink,
    NzGridModule,
    NzButtonModule,
    NzMenuModule,
    RouterModule
  ],
  templateUrl: './nav-bar.component.html',
  styleUrl: './nav-bar.component.css'
})
export class NavBarComponent {
  mobileMenuOpen = false;
  cartCount = 1;
  isScrolled = false;
  selectedLanguage = { name: 'Ecuador (ES)' };

  // Menú de idiomas
  languages = [
    { code: 'es_ES', name: 'Ecuador (ES)' },
    { code: 'en_US', name: 'United States (EN)' },
  ];

  // Menú de navegación principal
  navItems = [
    { label: 'NOSOTROS', link: '/nosotros' },
    { label: 'PRODUCTOS', link: '/productos' },
    { label: 'RESEÑAS', link: '/resenas' }
  ]; 

  constructor(private router: Router) {
    // Escuchar eventos de scroll
    window.addEventListener('scroll', () => {
      this.isScrolled = window.scrollY > 50;
    });
  }


  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  changeLanguage(language: any): void {
    this.selectedLanguage = language;
  }

  // Cerrar menú al hacer clic en un enlace en móvil
  closeMenuOnMobile() {
    if (window.innerWidth <= 768) {
      this.mobileMenuOpen = false;
    }
  }
  
}
