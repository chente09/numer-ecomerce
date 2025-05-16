import { Routes } from '@angular/router';
import { PayphoneFormComponent } from './pasarela-pago/payphone-form/payphone-form.component';
import { CarritoComponent } from './pasarela-pago/carrito/carrito.component';
import { RespuestaPagoComponent } from './pasarela-pago/respuesta-pago/respuesta-pago.component';
import { NosotrosComponent } from './pages/nosotros/nosotros.component';
import { DetalleProductoComponent } from './pages/shop/detalle-producto/detalle-producto/detalle-producto.component';
import { WelcomeComponent } from './pages/welcome/welcome.component';
import { LayoutComponent } from './pages/admin/layout/layout.component';
import { ProductManagementComponent } from './pages/admin/product-management/product-management.component';
import { CategoriasComponent } from './pages/admin/categorias/categorias.component';
import { ServicioClienteComponent } from './pages/servicio-cliente/servicio-cliente.component';
import { CuidadoProductoComponent } from './pages/cuidado-producto/cuidado-producto.component';
import { HeroesComponent } from './pages/admin/heroes/heroes.component';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: '/welcome' },
    { path: 'welcome', component: WelcomeComponent },
    { path: 'servicio-cliente', component: ServicioClienteComponent },
    { path: 'carrito', component: CarritoComponent },
    { path: 'pago', component: PayphoneFormComponent },
    { path: 'respuesta-pago', component: RespuestaPagoComponent },
    { path: 'nosotros', component: NosotrosComponent, pathMatch: 'full' },
    { path: 'products/:id', component: DetalleProductoComponent },
    { path: 'cuidado-producto', component: CuidadoProductoComponent },
    {
        path: 'admin',
        component: LayoutComponent,
        children: [
            { path: '', redirectTo: 'products', pathMatch: 'full' },
            { path: 'products', component: ProductManagementComponent },
            { path: 'categories', component: CategoriasComponent },
            { path: 'heroes', component: HeroesComponent },
        ]
    },
];

