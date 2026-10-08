import { Routes } from '@angular/router';
import { WelcomeComponent } from './pages/welcome/welcome.component';

import { authGuard } from './guards/auth-guard.guard';
import { profileCompletionGuard } from './guards/profile-completion.guard';
import { adminGuardGuard } from './guards/admin-guard.guard';
import { adminOnlyGuard } from './guards/admin-only.guard';


export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: '/welcome' },
    { path: 'welcome', component: WelcomeComponent },
    { path: 'servicio-cliente', loadComponent: () => import('./pages/servicio-cliente/servicio-cliente.component').then(m => m.ServicioClienteComponent) },
    { path: 'carrito', loadComponent: () => import('./pasarela-pago/carrito/carrito.component').then(m => m.CarritoComponent), data: { preload: true } },
    { path: 'pago', loadComponent: () => import('./pasarela-pago/payphone-form/payphone-form.component').then(m => m.PayphoneFormComponent), canActivate: [authGuard, profileCompletionGuard] },
    { path: 'respuesta-pago', loadComponent: () => import('./pasarela-pago/respuesta-pago/respuesta-pago.component').then(m => m.RespuestaPagoComponent), canActivate: [authGuard] },
    { path: 'nosotros', loadComponent: () => import('./pages/nosotros/nosotros.component').then(m => m.NosotrosComponent), pathMatch: 'full' },
    { path: 'products/:id', loadComponent: () => import('./pages/shop/detalle-producto-component/detalle-producto-component.component').then(m => m.DetalleProductoComponent), data: { preload: true } },
    { path: 'shop', loadComponent: () => import('./pages/shop/product-catalog/product-catalog.component').then(m => m.ProductCatalogComponent), data: { preload: true } },
    { path: 'cuidado-producto', loadComponent: () => import('./pages/cuidado-producto/cuidado-producto.component').then(m => m.CuidadoProductoComponent) },
    { path: 'review-form', loadComponent: () => import('./pages/review-form/review-form.component').then(m => m.ReviewFormComponent) },
    { path: 'ubicaciones', loadComponent: () => import('./pages/ubicaciones/ubicaciones.component').then(m => m.UbicacionesComponent) },
    { path: 'embajadores', loadComponent: () => import('./pages/embajadores-atletas/embajadores-atletas.component').then(m => m.EmbajadoresAtletasComponent) },
    { path: 'eventos', loadComponent: () => import('./pages/eventos/races/races.component').then(m => m.RacesComponent) },
    { path: 'eventos/:slug', loadComponent: () => import('./pages/eventos/race-detail/race-detail.component').then(m => m.RaceDetailComponent),title: 'Detalle del Evento - NUMER' },

    // Rutas protegidas que requieren autenticación pero no perfil completo
    { path: 'perfil', loadComponent: () => import('./pages/user/perfil/perfil.component').then(m => m.PerfilComponent), canActivate: [authGuard] },
    { path: 'completar-perfil', loadComponent: () => import('./pages/user/completar-perfil/completar-perfil.component').then(m => m.CompletarPerfilComponent), canActivate: [authGuard] },
    { path: 'mis-pedidos', loadComponent: () => import('./pages/user/mis-pedidos/mis-pedidos.component').then(m => m.MisPedidosComponent), canActivate: [authGuard] },
    { path: 'mis-pedidos/:id', loadComponent: () => import('./pages/user/mis-pedidos/mis-pedidos.component').then(m => m.MisPedidosComponent), canActivate: [authGuard] },

    {
        path: 'admin',
        loadComponent: () => import('./pages/admin/layout/layout.component').then(m => m.LayoutComponent),
        canActivate: [adminGuardGuard],
        children: [
            { path: '', loadComponent: () => import('./pages/admin/dashboard/dashboard.component').then(m => m.DashboardComponent) }, 
            { path: 'products', loadComponent: () => import('./pages/admin/product-management/product-management.component').then(m => m.ProductManagementComponent), canActivate: [adminOnlyGuard] },
            { path: 'categories', loadComponent: () => import('./pages/admin/categorias/categorias.component').then(m => m.CategoriasComponent), canActivate: [adminOnlyGuard] },
            { path: 'eventos', loadComponent: () => import('./pages/admin/admin-races/admin-races.component').then(m => m.AdminRacesComponent), canActivate: [adminOnlyGuard] },
            { path: 'distributors', loadComponent: () => import('./pages/admin/distributor-management/distributor-management.component').then(m => m.DistributorManagementComponent), canActivate: [adminOnlyGuard] },
            { path: 'authorized-distributors', loadComponent: () => import('./pages/admin/distribuidores/distribuidores.component').then(m => m.DistribuidoresComponent), canActivate: [adminOnlyGuard] },
            { path: 'heroes', loadComponent: () => import('./pages/admin/heroes/heroes.component').then(m => m.HeroesComponent), canActivate: [adminOnlyGuard] },
            { path: 'reviews', loadComponent: () => import('./pages/admin/review-management/review-management.component').then(m => m.ReviewManagementComponent), canActivate: [adminOnlyGuard] },
            { path: 'clientes', loadComponent: () => import('./pages/admin/clientes/clientes.component').then(m => m.ClientesComponent), canActivate: [adminOnlyGuard] },
            { path: 'orders', loadComponent: () => import('./pages/admin/orders/admin-orders.component').then(m => m.AdminOrdersComponent), canActivate: [adminOnlyGuard] },
            { path: 'sitemap', loadComponent: () => import('./pages/admin/sitemap-admin/sitemap-admin.component').then(m => m.SitemapAdminComponent), canActivate: [adminOnlyGuard] },
            { path: 'user-roles', loadComponent: () => import('./pages/admin/user-roles-management/user-roles-management.component').then(m => m.UserRolesManagementComponent), canActivate: [adminOnlyGuard] },
            { path: 'distribuidores', loadComponent: () => import('./pages/admin/distributors/my-inventory/my-inventory.component').then(m => m.MyInventoryComponent) },
            { path: 'shipments', loadComponent: () => import('./pages/admin/shipments/admin-shipments.component').then(m => m.AdminShipmentsComponent), canActivate: [adminOnlyGuard] },
            { path: 'mis-envios', loadComponent: () => import('./pages/admin/distributors/my-shipments/my-shipments.component').then(m => m.MyShipmentsComponent) },
        ]
    },
];

