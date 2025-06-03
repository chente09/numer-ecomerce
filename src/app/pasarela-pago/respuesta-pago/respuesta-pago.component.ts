import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CartService } from '../services/cart/cart.service';

@Component({
  selector: 'app-respuesta-pago',
  imports: [CommonModule],
  templateUrl: './respuesta-pago.component.html',
  styleUrl: './respuesta-pago.component.css'
})
export class RespuestaPagoComponent implements OnInit {
  resultado: any = null;
  error: any = null;
  loading = true;
  public currencyCode = 'USD';
  showFallbackNotice = true; // ✅ NUEVO: Mostrar aviso

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private location: Location,
    private router: Router, // ✅ AGREGAR Router
    private cartService: CartService // ✅ AGREGAR CartService
  ) {}

  ngOnInit(): void {
    // ✅ AVISO: Este debería ser un flujo de respaldo
    console.warn('⚠️ Usuario llegó a respuesta-pago (flujo de respaldo)');

    this.route.queryParams.subscribe(params => {
      const id = +params['id'] || 0;
      const clientTxId = params['clientTransactionId'] || '';

      this.http.post<any>(
        'https://backend-numer.netlify.app/.netlify/functions/confirmacion',
        { id, clientTxId }
      ).subscribe({
        next: res => {
          this.resultado = res;
          this.currencyCode = res.currency || this.currencyCode;
          this.loading = false;

          // ✅ LIMPIAR CARRITO si es exitoso
          this.checkAndClearCart(res);

          // ✅ OPCIONAL: Redirigir después de 5 segundos
          setTimeout(() => {
            this.showFallbackNotice = false;
            // Podrías redirigir a /shop o mantener al usuario aquí
          }, 5000);
        },
        error: err => {
          this.error = err.error || err;
          this.loading = false;
        }
      });
    });
  }

  // ✅ NUEVA FUNCIÓN: Verificar y limpiar carrito
  private checkAndClearCart(confirmationResponse: any): void {
    const shouldClearCart = confirmationResponse && (
      confirmationResponse.inventoryProcessed === true ||
      confirmationResponse.transactionStatus === 'Approved'
    );

    if (shouldClearCart) {
      console.log('✅ Pago confirmado en respuesta-pago (fallback), limpiando carrito...');
      this.cartService.clearCart();
    } else {
      console.warn('⚠️ Pago no confirmado en flujo de respaldo');
    }
  }

  // ✅ NUEVO: Ir al flujo principal
  goToMainFlow(): void {
    this.router.navigate(['/shop']);
  }

  // Métodos existentes...
  get friendlyStatus(): string {
    const status = this.resultado?.transactionStatus;
    switch (status) {
      case 'Approved': return 'Aprobado';
      case 'Canceled':
      case 'Cancelled': return 'Cancelado';
      case 'Error': return 'Error en la transacción';
      default: return status || '';
    }
  }

  isCanceled(): boolean {
    const s = this.resultado?.transactionStatus;
    return s === 'Canceled' || s === 'Cancelled';
  }

  goBack(): void {
    this.location.back();
  }

  printTicket(): void {
    window.print();
  }
}