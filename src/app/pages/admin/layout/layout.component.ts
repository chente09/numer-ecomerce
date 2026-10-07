import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzMessageService } from 'ng-zorro-antd/message'; // ✅ Añadido NzMessageModule
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
    NzModalModule,
    NzSkeletonModule
  ],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css']
})
export class LayoutComponent implements OnInit, OnDestroy {
  isCollapsed = false;
  currentUser: User | null = null;
  userProfile: any = null;
  loading = true;
  userRoles: string[] = [];
  private userSubscription: Subscription | null = null;

  // Agrupado por dominio para el menú lateral (ver sección 01 de la auditoría de admin).
  // Los títulos de "Distribuidores" y "Distribuidores Autorizados" se renombraron porque
  // apuntaban a pantallas muy distintas (gestión interna vs. aprobación de solicitudes)
  // con nombres casi idénticos.
  adminMenuGroups = [
    {
      label: null, // Dashboard queda suelto, es el punto de entrada, no un grupo
      items: [
        { title: 'Dashboard', icon: 'dashboard', path: '/admin/dashboard' },
      ]
    },
    {
      label: 'Ventas',
      icon: 'shopping-cart',
      items: [
        { title: 'Pedidos', icon: 'file-done', path: '/admin/orders' },
      ]
    },
    {
      label: 'Catálogo',
      icon: 'appstore',
      items: [
        { title: 'Productos', icon: 'shopping', path: '/admin/products' },
        { title: 'Categorías', icon: 'tags', path: '/admin/categories' },
      ]
    },
    {
      label: 'Contenido',
      icon: 'picture',
      items: [
        { title: 'Banners', icon: 'picture', path: '/admin/heroes' },
        { title: 'Reseñas', icon: 'star', path: '/admin/reviews' },
        { title: 'Sitemap & SEO', icon: 'global', path: '/admin/sitemap' },
      ]
    },
    {
      label: 'Eventos',
      icon: 'flag',
      items: [
        { title: 'Eventos', icon: 'flag', path: '/admin/eventos' },
      ]
    },
    {
      label: 'Clientes y usuarios',
      icon: 'team',
      items: [
        { title: 'Clientes', icon: 'idcard', path: '/admin/clientes' },
        { title: 'Gestión de Usuarios', icon: 'team', path: '/admin/user-roles' },
      ]
    },
    {
      label: 'Distribuidores',
      icon: 'deployment-unit',
      items: [
        { title: 'Gestión de Distribuidores', icon: 'deployment-unit', path: '/admin/distributors' },
        { title: 'Solicitudes de Distribuidor', icon: 'shop', path: '/admin/authorized-distributors' },
        { title: 'Envíos a Distribuidores', icon: 'rocket', path: '/admin/shipments' },
      ]
    },
  ];

  // Lista plana derivada de los grupos: la usan getActiveSectionName() y la asignación de rol.
  adminMenuItems = this.adminMenuGroups.flatMap(g => g.items);

  distributorMenuItems = [
    { title: 'Mi Inventario', icon: 'shop', path: '/admin/distribuidores' },
    { title: 'Mis Envíos', icon: 'truck', path: '/admin/mis-envios' },
  ];

  visibleMenuItems: any[] = [];
  visibleMenuGroups: any[] = [];

  constructor(
    private usersService: UsersService,
    private router: Router,
    private message: NzMessageService,
    private modal: NzModalService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.userSubscription = this.usersService.user$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.loadUserProfileAndRoles();
      } else {
        this.router.navigate(['/welcome']);
        this.message.warning('Debes iniciar sesión para acceder al panel');
      }
    });
  }

  async loadUserProfileAndRoles() {
    this.loading = true;
    try {
      const [profile, roles] = await Promise.all([
        this.usersService.getUserProfile(),
        this.usersService.getUserRoles()
      ]);
      
      this.userProfile = profile;
      this.userRoles = roles;
      
      if (this.userRoles.includes('admin')) {
        this.visibleMenuItems = this.adminMenuItems;
        this.visibleMenuGroups = this.adminMenuGroups;
      } else if (this.userRoles.includes('distributor')) {
        this.visibleMenuItems = this.distributorMenuItems;
        this.visibleMenuGroups = [{ label: null, items: this.distributorMenuItems }];
      } else {
        this.message.error('No tienes permisos para acceder a esta sección.');
        this.router.navigate(['/welcome']);
      }
      
    } catch (error) {
      console.error('Error al cargar perfil y roles:', error);
      this.message.error('Error de autenticación');
      this.router.navigate(['/welcome']);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ... (logout, navigateToProfile, ngOnDestroy, etc. no cambian)
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

  getActiveSectionName(): string {
    const url = this.router.url;
    // Ahora busca en el array correcto, que es 'visibleMenuItems'
    const item = this.visibleMenuItems.find(item => url.includes(item.path));
    // Busca el título en el menú correspondiente al rol del usuario
    const adminItem = this.adminMenuItems.find(item => url.includes(item.path));
    const distributorItem = this.distributorMenuItems.find(item => url.includes(item.path));
    
    if (adminItem) return adminItem.title;
    if (distributorItem) return distributorItem.title;
    
    return 'Dashboard'; // Fallback por defecto
  }

  get currentYear(): number {
    return new Date().getFullYear();
  }

  isGroupActive(group: { items: { path: string }[] }): boolean {
    return group.items.some(item => this.router.url.includes(item.path));
  }

  closeMenu() {
    if (window.innerWidth <= 768) {
      this.isCollapsed = true;
    }
  }
}