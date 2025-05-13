import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { Router, RouterLink, RouterModule } from '@angular/router';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { CartService } from '../../pasarela-pago/services/cart/cart.service';
import { Subscription } from 'rxjs';

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
export class NavBarComponent implements OnInit, OnDestroy {
  mobileMenuOpen = false;
  cartCount = 0;
  private cartSubscription: Subscription | null = null;
  isScrolled = false;
  hideHeader = false;
  lastScrollTop = 0;
  selectedLanguage = { name: 'Ecuador (ES)' };

  languages = [
    { code: 'es_ES', name: 'Ecuador (ES)' },
    { code: 'en_US', name: 'United States (EN)' },
  ];

  navItems = [
    { label: 'NOSOTROS', link: '/nosotros' },
    { label: 'TIENDA', link: '/productos' },
    { label: 'RESEÑAS', link: '/welcome', fragment: 'resenas' },
  ];

  constructor(
    private cartService: CartService, 
    private router: Router
  ) {}

  ngOnInit() {
    this.cartSubscription = this.cartService.getCartItemCount().subscribe(count => {
      this.cartCount = count;
    });
  }
  
  ngOnDestroy() {
    if (this.cartSubscription) {
      this.cartSubscription.unsubscribe();
    }
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  changeLanguage(language: any): void {
    this.selectedLanguage = language;
  }

  closeMenuOnMobile() {
    if (window.innerWidth <= 768) {
      this.mobileMenuOpen = false;
    }
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
    this.isScrolled = currentScroll > 50;

    if (currentScroll > this.lastScrollTop && currentScroll > 100) {
      this.hideHeader = true; // Scrolling down
    } else {
      this.hideHeader = false; // Scrolling up
    }

    this.lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
  }
  
}
