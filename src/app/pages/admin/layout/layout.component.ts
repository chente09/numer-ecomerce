import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterModule } from '@angular/router';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';

@Component({
  selector: 'app-layout',
  imports: [
    CommonModule,
    RouterModule,
    NzLayoutModule,
    NzMenuModule,
    NzIconModule,
    NzAvatarModule,
    NzDropDownModule,
    NzBreadCrumbModule,
    RouterLink
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent {

  isCollapsed = false;
  menuItems = [
    {
      level: 1,
      title: 'Dashboard',
      icon: 'dashboard',
      path: '/admin/dashboard'
    },
    {
      level: 1,
      title: 'Productos',
      icon: 'shopping',
      path: 'products'
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
      path: '/admin/customers'
    },
    {
      level: 1,
      title: 'Configuración',
      icon: 'setting',
      path: '/admin/heroes'
    },
  ];

}
