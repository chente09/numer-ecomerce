import { AfterViewInit, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CartService } from '../services/cart/cart.service';
import { HttpClient } from '@angular/common/http';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { firstValueFrom, take } from 'rxjs';

@Component({
  selector: 'app-payphone-form',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    NzSpinModule, 
    NzAlertModule,
    NzButtonModule
  ],
  templateUrl: './payphone-form.component.html',
  styleUrl: './payphone-form.component.css',
})
export class PayphoneFormComponent implements AfterViewInit {
  isLoading = true;
  error: string | null = null;
  transactionId: string | null = null;
  
  constructor(
    private route: ActivatedRoute, 
    private router: Router,
    private cartService: CartService, 
    private http: HttpClient
  ) {}

  ngAfterViewInit(): void {
    // Obtenemos el carrito actual una sola vez usando firstValueFrom o take(1)
    firstValueFrom(this.cartService.cart$.pipe(take(1)))
      .then(cart => {
        if (cart.items.length === 0) {
          this.error = 'El carrito está vacío. No se puede procesar el pago.';
          this.isLoading = false;
          return;
        }

        // Usamos el total calculado por el servicio de carrito
        const amount = Math.round(cart.total * 100);
        
        // Generamos un ID de transacción único si no viene en los parámetros
        this.route.queryParams.subscribe(params => {
          this.transactionId = params['transId'] || `order-${Date.now()}`;
          
          this.http.post('https://backend-numer.netlify.app/.netlify/functions/payphone', {
            amount,
            reference: params['referencia'] || 'Compra desde carrito',
            transactionId: this.transactionId
          }).subscribe({
            next: (data: any) => {
              this.crearBotonSeguro(data);
              this.isLoading = false;
            },
            error: (err) => {
              console.error('Error al inicializar Payphone:', err);
              this.error = 'No se pudo conectar con el servicio de pago. Por favor, intenta de nuevo más tarde.';
              this.isLoading = false;
            }
          });
        });
      })
      .catch(err => {
        console.error('Error al obtener el carrito:', err);
        this.error = 'Ocurrió un error al procesar tu carrito. Por favor, intenta de nuevo.';
        this.isLoading = false;
      });
  }

  crearBotonSeguro(data: any) {
    const esperarRender = setInterval(() => {
      const target = document.getElementById('pp-button');
      if (target && typeof (window as any).PPaymentButtonBox !== 'undefined') {
        clearInterval(esperarRender);
  
        new (window as any).PPaymentButtonBox({
          ...data,
          lang: 'es',
          defaultMethod: 'card',
          timeZone: -5,
          lat: '-0.2299',
          lng: '-78.5249',
          onSuccess: this.handlePaymentSuccess.bind(this),
          onError: this.handlePaymentError.bind(this)
        }).render('pp-button');
      }
    }, 300);
  }
  
  // Manejador para pago exitoso
  handlePaymentSuccess(response: any) {
    console.log('Pago exitoso:', response);
    
    // Aquí procesamos el checkout final
    this.cartService.checkout()
      .then(result => {
        if (result.success) {
          // Redirigir a la página de confirmación
          this.router.navigate(['/confirmacion'], {
            queryParams: { 
              orderId: result.orderId,
              paymentId: response.transactionId || this.transactionId
            }
          });
        } else {
          this.error = 'El pago fue procesado pero hubo un problema al finalizar la orden. Por favor, contacta con servicio al cliente.';
        }
      })
      .catch(err => {
        console.error('Error en checkout después del pago:', err);
        this.error = 'El pago fue procesado pero hubo un problema al finalizar la orden. Por favor, contacta con servicio al cliente.';
      });
  }
  
  // Manejador para error de pago
  handlePaymentError(error: any) {
    console.error('Error en el pago:', error);
    this.error = 'Se produjo un error al procesar el pago. Por favor, intenta con otro método de pago o contacta con servicio al cliente.';
  }
  
  // Método para volver al carrito
  volverAlCarrito() {
    this.router.navigate(['/carrito']);
  }
}