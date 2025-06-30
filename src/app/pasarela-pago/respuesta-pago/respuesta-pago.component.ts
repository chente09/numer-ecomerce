import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { firstValueFrom, Subject, take, takeUntil } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ActivityLogService } from '../../services/admin/activityLog/activity-log.service';

interface PaymentResult {
  transactionStatus: string;
  transactionId: string;
  clientTransactionId?: string;
  amount: number;
  currency: string;
  date: string;
  authorizationCode?: string;
  reference?: string;
  cardBrand?: string;
  lastDigits?: string;
  email?: string;
  inventoryProcessed?: boolean;
  phoneNumber?: string;
  storeName?: string;
}

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
    NzStepsModule,
    RouterLink
  ],
  templateUrl: './respuesta-pago.component.html',
  styleUrl: './respuesta-pago.component.css'
})
export class RespuestaPagoComponent implements OnInit, OnDestroy {
  resultado: PaymentResult | null = null;
  error: any = null;
  loading = true;
  public currencyCode = 'USD';

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private location: Location,
    private router: Router,
    private cartService: CartService,
    private message: NzMessageService,
    private activityLogService: ActivityLogService
  ) { }

  ngOnInit(): void {
    this.route.queryParams.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      const id = +params['id'] || 0;
      const clientTxId = params['clientTransactionId'] || '';

      // ✅ AGREGAR validación
      if (!id && !clientTxId) {
        this.error = 'Parámetros de transacción inválidos';
        this.loading = false;
        return;
      }

      this.http.post<any>(
        'https://backend-numer.netlify.app/.netlify/functions/confirmacion',
        { id, clientTxId }
      ).subscribe({
        next: res => {
          this.resultado = res;
          this.currencyCode = res.currency || this.currencyCode;
          this.loading = false;
          this.checkAndClearCart(res);
        },
        error: err => {
          console.error('Error en confirmación:', err); // ✅ AGREGAR log
          this.error = err.error || err;
          this.loading = false;
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }


  private async checkAndClearCart(confirmationResponse: any): Promise<void> {
    const shouldClearCart = confirmationResponse && (
      confirmationResponse.inventoryProcessed === true ||
      confirmationResponse.transactionStatus === 'Approved'
    );

    if (shouldClearCart) {
      console.log('✅ Pago confirmado, limpiando carrito...');

      // ✅ AGREGAR: Obtener datos del carrito ANTES de limpiarlo
      const currentCart = await firstValueFrom(this.cartService.cart$.pipe(take(1)));
      const transactionId = confirmationResponse.transactionId;

      // ✅ AGREGAR: Registrar compra (solo si hay items en el carrito)
      if (currentCart && currentCart.items.length > 0) {
        try {
          await this.activityLogService.logPurchase(transactionId, currentCart.items, currentCart.total);
          console.log('💰 Compra registrada exitosamente desde respuesta-pago');
        } catch (error) {
          console.warn('Error registrando compra:', error);
        }
      }

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
    // Crear ventana de impresión
    const printWindow = window.open('', '_blank', 'width=800,height=600');

    if (!printWindow) {
      this.message.warning('No se pudo abrir la ventana de impresión. Verifica que no esté bloqueada por el navegador.');
      return;
    }

    const printContent = this.generatePrintContent();

    printWindow.document.write(printContent);
    printWindow.document.close();

    // Esperar a que cargue el contenido y luego imprimir
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    };
  }

  private generatePrintContent(): string {
    const logoBase64 = 'https://i.postimg.cc/7LgKRbyJ/Logo-Numer-negro.png';

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Comprobante de Pago</title>
      <style>
        ${this.getPrintStyles()}
      </style>
    </head>
    <body>
      <div class="ticket-container">
        ${this.getTicketHeader(logoBase64)}
        ${this.getTicketBody()}
      </div>
    </body>
    </html>
  `;
  }

  private getPrintStyles(): string {
    return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Arial', sans-serif;
      background: white;
      color: #333;
      line-height: 1.4;
    }

    .ticket-container {
      height: 100px;
      margin: 0 auto;
      padding: 2px;
      background: white;
    }

    .ticket-header {
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }

    .logo {
      height: 90px;
      margin-bottom: 10px;
    }

    .company-info h1 {
      font-size: 24px;
      font-weight: bold;
      color: #000;
      margin-bottom: 5px;
    }

    .company-info p {
      font-size: 12px;
      color: #666;
      margin-bottom: 2px;
    }

    .ticket-title {
      background: #000;
      color: white;
      padding: 10px;
      text-align: center;
      font-size: 18px;
      font-weight: bold;
      margin: 20px 0;
    }

    .ticket-body {
      margin-bottom: 30px;
    }

    .status-section {
      background: #f0f8ff;
      border: 1px solid black;
      padding: 15px;
      margin-bottom: 20px;
      text-align: center;
    }

    .status-badge {
      background: #28a745;
      color: white;
      padding: 8px 16px;
      font-weight: bold;
      font-size: 16px;
      display: inline-block;
    }

    .amount-section {
      background: #f8f9fa;
      border: 2px solid #000;
      padding: 15px;
      text-align: center;
      margin-bottom: 20px;
    }

    .amount {
      font-size: 28px;
      font-weight: bold;
      color: #000;
    }

    .details-grid {
      display: grid;
      gap: 8px;
      margin-bottom: 20px;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px dotted #ccc;
    }

    .detail-row:last-child {
      border-bottom: none;
    }

    .detail-label {
      font-weight: bold;
      color: #555;
      flex: 1;
    }

    .detail-value {
      color: #000;
      text-align: right;
      flex: 1;
    }

    .transaction-id {
      background: #f5f5f5;
      border: 1px solid #ddd;
      padding: 10px;
      text-align: center;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      margin: 15px 0;
    }

    .ticket-footer {
      border-top: 1px solid #ccc;
      padding-top: 15px;
      text-align: center;
      font-size: 11px;
      color: #666;
    }

    .footer-note {
      margin-bottom: 10px;
    }

    .qr-placeholder {
      width: 80px;
      height: 80px;
      background: #f0f0f0;
      border: 1px solid #ccc;
      margin: 10px auto;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #999;
    }

    /* Estilos específicos para impresión */
    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      
      .ticket-container {
        margin: 0;
        padding: 1px;
        max-width: none;
      }
      
      .ticket-header {
        page-break-inside: avoid;
      }
      
      .amount-section {
        page-break-inside: avoid;
      }
    }
  `;
  }

  private getTicketHeader(logoBase64: string): string {
    return `
    <div class="ticket-header">
      <img src="${logoBase64}" alt="Logo" class="logo">
      <div class="company-info">
        <h1>NUMER</h1>
        <p>Iliniza S7 - 90, Quito 170121</p>
        <p>Teléfono: +593 098 712 5801</p>
        <p>Email: numer.ec21@gmail.com</p>
        <p>RUC: XXXXXXXXXXXXXXXXX</p>
      </div>
    </div>
    
    <div class="ticket-title">
      COMPROBANTE DE PAGO ELECTRÓNICO
    </div>
  `;
  }

  private getTicketBody(): string {
    if (!this.resultado) return '';

    return `
    <div class="ticket-body">
      
      <div class="status-section">
        <div class="status-badge">${this.friendlyStatus}</div>
      </div>

      <div class="amount-section">
        <div style="font-size: 14px; margin-bottom: 5px;">TOTAL PAGADO</div>
        <div class="amount">${(this.resultado.amount / 100).toLocaleString('es-EC', { style: 'currency', currency: this.currencyCode })}</div>
      </div>

      <div class="details-grid">
        <div class="detail-row">
          <span class="detail-label">ID Transacción:</span>
          <span class="detail-value">${this.resultado.transactionId}</span>
        </div>
        
        ${this.resultado.clientTransactionId ? `
        <div class="detail-row">
          <span class="detail-label">ID Cliente:</span>
          <span class="detail-value">${this.resultado.clientTransactionId}</span>
        </div>
        ` : ''}
        
        <div class="detail-row">
          <span class="detail-label">Fecha y Hora:</span>
          <span class="detail-value">${new Date(this.resultado.date).toLocaleString('es-EC')}</span>
        </div>
        
        ${this.resultado.authorizationCode ? `
        <div class="detail-row">
          <span class="detail-label">Código de Autorización:</span>
          <span class="detail-value">${this.resultado.authorizationCode}</span>
        </div>
        ` : ''}
        
        <div class="detail-row">
          <span class="detail-label">Moneda:</span>
          <span class="detail-value">${this.resultado.currency || this.currencyCode}</span>
        </div>
        
        ${this.resultado.reference ? `
        <div class="detail-row">
          <span class="detail-label">Referencia:</span>
          <span class="detail-value">${this.resultado.reference}</span>
        </div>
        ` : ''}
        
        ${this.resultado.cardBrand ? `
        <div class="detail-row">
          <span class="detail-label">Método de Pago:</span>
          <span class="detail-value">${this.resultado.cardBrand}${this.resultado.lastDigits ? ' **** ' + this.resultado.lastDigits : ''}</span>
        </div>
        ` : ''}
        
        ${this.resultado.email ? `
        <div class="detail-row">
          <span class="detail-label">Email:</span>
          <span class="detail-value">${this.resultado.email}</span>
        </div>
        ` : ''}
      </div>

      <div class="transaction-id">
        <strong>Código de Verificación:</strong><br>
        ${this.resultado.transactionId}
      </div>

    </div>
  `;
  }

}