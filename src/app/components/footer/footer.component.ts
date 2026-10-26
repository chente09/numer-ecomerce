import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { Category, CategoryService } from '../../services/admin/category/category.service';
import { MountainRidgeComponent } from "../mountain-ridge/mountain-ridge.component";
import { NzMessageService } from 'ng-zorro-antd/message';
import { UsersService } from '../../services/users/users.service';

@Component({
  selector: 'app-footer',
  imports: [
    CommonModule,
    NzGridModule,
    RouterLink,
    NzIconModule,
    NzInputModule,
    MountainRidgeComponent
],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent implements OnInit, OnDestroy {
  categories: Category[] = [];
  categoriesLoading = true;

  subscribing = false;
  isSubscribed = false;
  private newsletterSub?: Subscription;

  constructor(
      private categoryService: CategoryService,
      private usersService: UsersService,
      private message: NzMessageService
    ) { }

  async subscribeToNewsletter(): Promise<void> {
    if (this.subscribing) return;
    this.subscribing = true;
    try {
      const result = await this.usersService.subscribeToNewsletterWithAccount('footer-google-auth');
      if (result === 'already_subscribed') {
        this.message.info('Ya estás suscrito a nuestro newsletter 📧');
      } else {
        this.message.success('¡Te has suscrito exitosamente a nuestro newsletter! 🎉');
      }
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user') {
        this.message.info('Proceso de login cancelado');
      } else if (error?.code === 'auth/popup-blocked') {
        this.message.warning('Permite las ventanas emergentes para continuar');
      } else {
        this.message.error('No se pudo completar la suscripción. Inténtalo de nuevo.');
      }
    } finally {
      this.subscribing = false;
    }
  }
  
    
  currentYear = new Date().getFullYear();

  ngOnInit(): void {
    this.loadCategories();
    this.newsletterSub = this.usersService.newsletterSubscribed$.subscribe(v => (this.isSubscribed = v));
  }

  ngOnDestroy(): void {
    this.newsletterSub?.unsubscribe();
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
    { label: 'Encuentranos', link: '/ubicaciones' },
    { label: 'Distribuidores', link: '/ubicaciones' },
    { label: 'Chompas Impermeables', link: '/chompas-impermeables' },
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
    { label: 'Eventos', link: '/eventos' },
    { label: 'Embajadores', link: '/embajadores' },
  ];
  
  socialLinks = [
    { label: 'Instagram', icon: 'bi bi-instagram', link: 'https://www.instagram.com/numer.ec' },
    { label: 'Facebook', icon: 'bi bi-facebook', link: 'https://www.facebook.com' },
    { label: 'YouTube', icon: 'bi bi-youtube', link: 'https://youtube.com/user/blackdiamondequipment' },
    { label: 'Strava', icon: 'bi bi-strava', link: 'https://www.strava.com' }
  ];

}
