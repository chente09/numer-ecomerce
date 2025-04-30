import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzDropDownModule, NzPlacementType } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { RouterLink } from '@angular/router';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMenuModule } from 'ng-zorro-antd/menu';

@Component({
  selector: 'app-nav-bar',
  imports: [
    CommonModule,
    NzDropDownModule,
    NzIconModule,
    NzBadgeModule,
    RouterLink,
    NzGridModule,
    NzButtonModule,
    NzMenuModule
  ],
  templateUrl: './nav-bar.component.html',
  styleUrl: './nav-bar.component.css'
})
export class NavBarComponent implements OnInit {
  mobileMenuOpen = false;
  cartCount = 1;
  isScrolled = false;

  // Menú de navegación principal
  navItems = [
    { label: 'Nosotros', link: '/about' },
    { label: 'Productos', link: '/products' },
    { label: 'Historias', link: '/stories' }
  ];

  // Menú de idiomas
  languages = [
    { code: 'en_US', name: 'United States (EN)' },
    { code: 'es_ES', name: 'Ecuador (ES)' },
  ];

  selectedLanguage = this.languages[0];

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    this.isScrolled = scrollPosition > 50;
  }

  ngOnInit(): void {
    this.onWindowScroll(); // Para manejar el estado inicial
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  changeLanguage(language: any): void {
    this.selectedLanguage = language;
  }
}
