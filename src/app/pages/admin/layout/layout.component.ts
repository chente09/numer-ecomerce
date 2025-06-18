import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink, RouterModule } from '@angular/router';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzMessageModule, NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { User } from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { UsersService } from '../../../services/users/users.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NzLayoutModule,
    NzMenuModule,
    NzIconModule,
    NzAvatarModule,
    NzDropDownModule,
    NzBreadCrumbModule,
    NzMessageModule,
    NzModalModule,
    NzSkeletonModule,
    RouterLink
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent implements OnInit, OnDestroy {
  isCollapsed = false;
  currentUser: User | null = null;
  userProfile: any = null;
  loading = true;
  isAdmin = false;
  private userSubscription: Subscription | null = null;

  menuItems = [
    {
      level: 1,
      title: 'Dashboard',
      icon: 'dashboard',
      path: '/admin/dashboard'
    },
    {
      level: 1,
      title: 'Sitemap & SEO',
      icon: 'sitemap',
      path: '/admin/sitemap'
    },
    {
      level: 1,
      title: 'Productos',
      icon: 'shopping',
      path: '/admin/products'
    },
    {
      level: 1,
      title: 'Categorías',
      icon: 'appstore',
      path: '/admin/categories'
    },
    {
      level: 1,
      title: 'Pedidos',
      icon: 'shopping-cart',
      path: '/admin/orders'
    },
    {
      level: 1,
      title: 'Clientes',
      icon: 'user',
      path: '/hola'
    },
    {
      level: 1,
      title: 'Banners',
      icon: 'picture',
      path: '/admin/heroes'
    },
    {
      level: 1,
      title: 'Reseñas',
      icon: 'star',
      path: '/admin/reviews'
    }
  ];

  constructor(
    private usersService: UsersService,
    private router: Router,
    private message: NzMessageService,
    private modal: NzModalService
  ) { }

  ngOnInit(): void {
    this.userSubscription = this.usersService.user$.subscribe(user => {
      this.currentUser = user;

      if (user) {
        this.loadUserProfile();
        this.checkAdminRole();
      } else {
        // Si no hay usuario autenticado, redirigir al login
        this.router.navigate(['/welcome']);
        this.message.warning('Debes iniciar sesión para acceder al panel de administración');
      }
    });
  }

  async loadUserProfile() {
    try {
      this.loading = true;
      this.userProfile = await this.usersService.getUserProfile();
    } catch (error) {
      console.error('Error al cargar perfil:', error);
    } finally {
      this.loading = false;
    }
  }

  async checkAdminRole() {
    try {
      this.isAdmin = await this.usersService.hasRole('admin');

      if (!this.isAdmin) {
        this.message.error('No tienes permisos para acceder al panel de administración');
        this.router.navigate(['/welcome']);
      }
    } catch (error) {
      console.error('Error al verificar rol de admin:', error);
      this.message.error('Error de autenticación');
      this.router.navigate(['/welcome']);
    }
  }

  logout() {
    this.modal.confirm({
      nzTitle: '¿Cerrar sesión?',
      nzContent: '¿Estás seguro de que quieres cerrar sesión?',
      nzOkText: 'Sí',
      nzCancelText: 'No',
      nzOnOk: async () => {
        try {
          await this.usersService.logout();
          this.message.success('Sesión cerrada correctamente');
          this.router.navigate(['/welcome']);
        } catch (error) {
          console.error('Error al cerrar sesión:', error);
          this.message.error('Error al cerrar sesión');
        }
      }
    });
  }

  navigateToProfile() {
    this.router.navigate(['/perfil']);
  }

  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  // Añade este método a la clase LayoutComponent
  getActiveSectionName(): string {
    const url = this.router.url;
    const item = this.menuItems.find(item => url.includes(item.path));
    return item ? item.title : 'Dashboard';
  }

  // También añade esta propiedad para el footer
  get currentYear(): number {
    return new Date().getFullYear();
  }

  closeMenu() {
    if (window.innerWidth <= 768) {
      this.isCollapsed = true;
    }
  }
}