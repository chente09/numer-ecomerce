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
  ) { }

  ngOnInit() {
    this.cartSubscription = this.cartService.getCartItemCount().subscribe(count => {
      this.cartCount = count;
    });
    this.handleVideoAutoplay();
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

    if (currentScroll > this.lastScrollTop && currentScroll > 50) {
      this.hideHeader = true; // Scrolling down
    } else {
      this.hideHeader = false; // Scrolling up
    }

    this.lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
  }

  handleVideoAutoplay() {
    const video = document.getElementById('background-video') as HTMLVideoElement;

    if (video) {
      // Intentar reproducir el video inmediatamente
      const playPromise = video.play();

      // Manejar el caso en que el navegador no permita la reproducción automática
      if (playPromise !== undefined) {
        playPromise.then(() => {
          // La reproducción automática comenzó
          console.log('Autoplay started');
        }).catch(error => {
          // La reproducción automática fue prevenida
          console.log('Autoplay prevented:', error);

          // Agregar event listener para reproducir el video en la primera interacción
          const playVideoOnce = () => {
            video.play();
            document.removeEventListener('click', playVideoOnce);
            document.removeEventListener('touchstart', playVideoOnce);
            document.removeEventListener('scroll', playVideoOnce);
          };

          document.addEventListener('click', playVideoOnce);
          document.addEventListener('touchstart', playVideoOnce);
          document.addEventListener('scroll', playVideoOnce);
        });
      }

      // Asegurarse de que el video se reproduzca cuando vuelva a ser visible
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          video.play();
        }
      });
    }
  }

}
