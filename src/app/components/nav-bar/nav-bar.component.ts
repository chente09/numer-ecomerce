import { Component } from '@angular/core';
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
export class NavBarComponent {

  mobileMenuOpen = false;
  cartCount = 1;

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

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  changeLanguage(language: any): void {
    this.selectedLanguage = language;
  }
}
