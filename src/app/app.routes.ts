import { Routes } from '@angular/router';
import { PayphoneFormComponent } from './pasarela-pago/payphone-form/payphone-form.component';
import { CarritoComponent } from './pasarela-pago/carrito/carrito.component';
import { RespuestaPagoComponent } from './pasarela-pago/respuesta-pago/respuesta-pago.component';
import { NosotrosComponent } from './pages/nosotros/nosotros.component';
import { DetalleProductoComponent } from './pages/shop/detalle-producto-component/detalle-producto-component.component';
import { ProductCatalogComponent } from './pages/shop/product-catalog/product-catalog.component';
import { WelcomeComponent } from './pages/welcome/welcome.component';
import { LayoutComponent } from './pages/admin/layout/layout.component';
import { ProductManagementComponent } from './pages/admin/product-management/product-management.component';
import { CategoriasComponent } from './pages/admin/categorias/categorias.component';
import { ServicioClienteComponent } from './pages/servicio-cliente/servicio-cliente.component';
import { CuidadoProductoComponent } from './pages/cuidado-producto/cuidado-producto.component';
import { HeroesComponent } from './pages/admin/heroes/heroes.component';
import { ReviewFormComponent } from './pages/review-form/review-form.component';
import { ReviewManagementComponent } from './pages/admin/review-management/review-management.component';
import { PerfilComponent } from './pages/user/perfil/perfil.component';
import { CompletarPerfilComponent } from './pages/user/completar-perfil/completar-perfil.component';
import { ClientesComponent } from './pages/admin/clientes/clientes.component';
import { UbicacionesComponent } from './pages/ubicaciones/ubicaciones.component';
import { EmbajadoresAtletasComponent } from './pages/embajadores-atletas/embajadores-atletas.component';
import { SitemapAdminComponent } from './pages/admin/sitemap-admin/sitemap-admin.component';
import { UserRolesManagementComponent } from './pages/admin/user-roles-management/user-roles-management.component';
import { DistributorManagementComponent } from './pages/admin/distributor-management/distributor-management.component';
import { DashboardComponent } from './pages/admin/dashboard/dashboard.component';
import { MyInventoryComponent } from './pages/admin/distributors/my-inventory/my-inventory.component';
import { AdminRacesComponent } from './pages/admin/admin-races/admin-races.component';
import { RacesComponent } from './pages/races/races.component';

import { authGuard } from './guards/auth-guard.guard';
import { profileCompletionGuard } from './guards/profile-completion.guard';
import { adminGuardGuard } from './guards/admin-guard.guard';
import { adminOnlyGuard } from './guards/admin-only.guard';


export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: '/welcome' },
    { path: 'welcome', component: WelcomeComponent },
    { path: 'servicio-cliente', component: ServicioClienteComponent },
    { path: 'carrito', component: CarritoComponent },
    { path: 'pago', component: PayphoneFormComponent, canActivate: [authGuard, profileCompletionGuard] },
    { path: 'respuesta-pago', component: RespuestaPagoComponent, canActivate: [authGuard] },
    { path: 'nosotros', component: NosotrosComponent, pathMatch: 'full' },
    { path: 'products/:id', component: DetalleProductoComponent },
    { path: 'shop', component: ProductCatalogComponent },
    { path: 'cuidado-producto', component: CuidadoProductoComponent },
    { path: 'review-form', component: ReviewFormComponent },
    { path: 'ubicaciones', component: UbicacionesComponent },
    { path: 'embajadores', component: EmbajadoresAtletasComponent },
    { path: 'carreras', component: RacesComponent },

    // Rutas protegidas que requieren autenticación pero no perfil completo
    { path: 'perfil', component: PerfilComponent, canActivate: [authGuard] },
    { path: 'completar-perfil', component: CompletarPerfilComponent, canActivate: [authGuard] },

    {
        path: 'admin',
        component: LayoutComponent,
        canActivate: [adminGuardGuard],
        children: [
            { path: '', component: DashboardComponent }, 
            { path: 'products', component: ProductManagementComponent, canActivate: [adminOnlyGuard] },
            { path: 'categories', component: CategoriasComponent, canActivate: [adminOnlyGuard] },
            { path: 'carreras', component: AdminRacesComponent, canActivate: [adminOnlyGuard] },
            { path: 'distributors', component: DistributorManagementComponent, canActivate: [adminOnlyGuard] },
            { path: 'heroes', component: HeroesComponent, canActivate: [adminOnlyGuard] },
            { path: 'reviews', component: ReviewManagementComponent, canActivate: [adminOnlyGuard] },
            { path: 'clientes', component: ClientesComponent, canActivate: [adminOnlyGuard] },
            { path: 'sitemap', component: SitemapAdminComponent, canActivate: [adminOnlyGuard] },
            { path: 'user-roles', component: UserRolesManagementComponent, canActivate: [adminOnlyGuard] },
            { path: 'my-inventory', component: MyInventoryComponent },
        ]
    },
];

