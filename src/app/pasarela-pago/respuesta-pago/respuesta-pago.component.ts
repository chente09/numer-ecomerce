import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CartService } from '../services/cart/cart.service';

// ✅ AGREGAR imports de NG Zorro
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzResultModule } from 'ng-zorro-antd/result';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzStepsModule } from 'ng-zorro-antd/steps';

@Component({
  selector: 'app-respuesta-pago',
  standalone: true,
  imports: [
    CommonModule,
    NzSpinModule,
    NzResultModule,
    NzButtonModule,
    NzCardModule,
    NzTagModule,
    NzCollapseModule,
    NzAlertModule,
    NzIconModule,
    NzStepsModule
  ],
  templateUrl: './respuesta-pago.component.html',
  styleUrl: './respuesta-pago.component.css'
})
export class RespuestaPagoComponent implements OnInit {
  resultado: any = null;
  error: any = null;
  loading = true;
  public currencyCode = 'USD';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private location: Location,
    private router: Router,
    private cartService: CartService
  ) {}

  ngOnInit(): void {
    console.log('💳 Procesando respuesta de pago...');

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
        },
        error: err => {
          this.error = err.error || err;
          this.loading = false;
        }
      });
    });
  }

  private checkAndClearCart(confirmationResponse: any): void {
    const shouldClearCart = confirmationResponse && (
      confirmationResponse.inventoryProcessed === true ||
      confirmationResponse.transactionStatus === 'Approved'
    );

    if (shouldClearCart) {
      console.log('✅ Pago confirmado, limpiando carrito...');
      this.cartService.clearCart();
    } else {
      console.warn('⚠️ Pago no confirmado');
    }
  }

  goToMainFlow(): void {
    this.router.navigate(['/shop']);
  }

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