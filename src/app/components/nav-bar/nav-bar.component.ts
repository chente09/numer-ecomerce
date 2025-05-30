import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { Router, RouterLink, RouterModule } from '@angular/router';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CartService } from '../../pasarela-pago/services/cart/cart.service';
import { UsersService } from '../../services/users/users.service';
import { Subscription } from 'rxjs';
import { User } from '@angular/fire/auth';

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
    RouterModule,
    NzAvatarModule
  ],
  templateUrl: './nav-bar.component.html',
  styleUrl: './nav-bar.component.css'
})
export class NavBarComponent implements OnInit, OnDestroy {
  mobileMenuOpen = false;
  cartCount = 0;
  private cartSubscription: Subscription | null = null;
  private userSubscription: Subscription | null = null;
  isScrolled = false;
  hideHeader = false;
  lastScrollTop = 0;
  selectedLanguage = { name: 'Ecuador (ES)' };
  currentUser: User | null = null;
  isLoggingIn = false;

  languages = [
    { code: 'es_ES', name: 'Ecuador (ES)' },
    { code: 'en_US', name: 'United States (EN)' },
  ];

  navItems = [
    { label: 'TIENDA', link: '/shop' },
    { label: 'NOSOTROS', link: '/nosotros' },
    { label: 'RESEÑAS', link: '/review-form' },
  ];

  constructor(
    private cartService: CartService,
    private usersService: UsersService,
    private router: Router,
    private message: NzMessageService
  ) { }

  ngOnInit() {
    this.cartSubscription = this.cartService.getCartItemCount().subscribe(count => {
      this.cartCount = count;
    });

    // Suscribirse al estado de autenticación
    this.userSubscription = this.usersService.user$.subscribe(user => {
      this.currentUser = user;
    });
  }

  ngOnDestroy() {
    if (this.cartSubscription) {
      this.cartSubscription.unsubscribe();
    }
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
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

  async loginWithGoogle() {
    if (this.isLoggingIn) return;

    this.isLoggingIn = true;
    try {
      // Usar persistencia local para mantener la sesión activa entre visitas
      await this.usersService.setLocalPersistence();
      await this.usersService.loginWithGoogle();
      this.message.success('Inicio de sesión exitoso');

      // Registrar la actividad de inicio de sesión
      await this.usersService.logUserActivity('login', 'authentication', { method: 'google' });
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      this.message.error('No se pudo iniciar sesión. Intente nuevamente.');
    } finally {
      this.isLoggingIn = false;
    }
  }

  async logout() {
    try {
      // Registrar actividad antes de cerrar sesión
      await this.usersService.logUserActivity('logout', 'authentication');
      await this.usersService.logout();
      this.message.success('Sesión cerrada correctamente');

      // Opcional: redirigir a la página principal
      this.router.navigate(['/welcome']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      this.message.error('Error al cerrar sesión');
    }
  }

  navigateToProfile() {
    this.router.navigate(['/perfil']);
  }

  navigateToCompletarPerfil() {
    this.router.navigate(['/completar-perfil']);
  }

  // Método para verificar si el perfil está completo (implementa la lógica según tu modelo de datos)
  isProfileComplete(): boolean {
    // Simularemos que no está completo si no tiene displayName
    return this.currentUser?.displayName !== null &&
      this.currentUser?.displayName !== undefined &&
      this.currentUser?.displayName !== '';
  }
}