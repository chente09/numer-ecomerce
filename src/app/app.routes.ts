import { Routes } from '@angular/router';
import { PayphoneFormComponent } from './pasarela-pago/payphone-form/payphone-form.component';
import { CarritoComponent } from './pasarela-pago/carrito/carrito.component';
import { RespuestaPagoComponent } from './pasarela-pago/respuesta-pago/respuesta-pago.component';
import { NosotrosComponent } from './pages/nosotros/nosotros.component';
import { DetalleProductoComponent } from './pages/shop/detalle-producto/detalle-producto/detalle-producto.component';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: '/welcome' },
    { path: 'welcome', loadChildren: () => import('./pages/welcome/welcome.routes').then(m => m.WELCOME_ROUTES) },
    { path: 'carrito', component: CarritoComponent },
    { path: 'pago', component: PayphoneFormComponent },
    { path: 'respuesta-pago', component: RespuestaPagoComponent },
    { path: 'nosotros', component: NosotrosComponent, pathMatch: 'full' },
    { path: 'products/:id', component: DetalleProductoComponent },
];

