import { Routes } from '@angular/router';
import { PayphoneFormComponent } from './pasarela-pago/payphone-form/payphone-form.component';
import { CarritoComponent } from './pasarela-pago/carrito/carrito.component';
import { RespuestaPagoComponent } from './pasarela-pago/respuesta-pago/respuesta-pago.component';
import { WelcomeComponent } from './pages/welcome/welcome.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
    {path: 'home', component: WelcomeComponent},
    { path: 'carrito', component: CarritoComponent },
    { path: 'pago', component: PayphoneFormComponent },
    { path: 'respuesta-pago', component: RespuestaPagoComponent },
];
