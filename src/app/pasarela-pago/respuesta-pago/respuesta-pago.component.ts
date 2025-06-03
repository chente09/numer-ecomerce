import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CartService } from '../services/cart/cart.service';
import { WhatsAppAdminService, OrderNotification } from '../../services/admin/whatsAppAdmin/whats-app-admin.service';

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
    private cartService: CartService,
    private whatsappAdminService: WhatsAppAdminService
  ) { }

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

          if (res && !this.isCanceled()) {
            this.notifyAdminNewOrder(res);
          } else if (this.isCanceled()) {
            this.notifyAdminCancellation(res);
          }

          // ✅ LIMPIAR CARRITO si es exitoso
          this.checkAndClearCart(res);
        },
        error: err => {
          this.error = err.error || err;
          this.loading = false;
          this.notifyAdminPaymentIssue(err);
        }
      });
    });
  }

   // ✅ NUEVO: Notificar nueva venta al admin
  private notifyAdminNewOrder(transactionData: any): void {
    try {
      const orderNotification: OrderNotification = {
        transactionId: transactionData.transactionId,
        clientTransactionId: transactionData.clientTransactionId,
        customerInfo: {
          email: transactionData.email,
          phone: transactionData.phoneNumber,
          document: transactionData.document,
          name: transactionData.optionalParameter4 // Si tienes el nombre del cliente
        },
        paymentInfo: {
          amount: transactionData.amount / 100,
          currency: transactionData.currency || this.currencyCode,
          paymentMethod: this.getPaymentMethodDisplay(transactionData),
          authorizationCode: transactionData.authorizationCode,
          date: new Date(transactionData.date)
        },
        cartItems: this.getCartItemsFromStorage() // Ver método abajo
      };

      this.whatsappAdminService.notifyNewOrder(orderNotification);
      
      console.log('✅ Admin notificado sobre nueva venta');
    } catch (error) {
      console.error('❌ Error notificando admin:', error);
    }
  }

  // ✅ NUEVO: Notificar cancelación al admin
  private notifyAdminCancellation(transactionData: any): void {
    this.whatsappAdminService.notifyPaymentCancellation(
      transactionData?.transactionId || 'unknown',
      {
        email: transactionData?.email,
        phone: transactionData?.phoneNumber
      }
    );
  }

  // ✅ NUEVO: Notificar problema al admin
  private notifyAdminPaymentIssue(error: any): void {
    const transactionId = this.route.snapshot.queryParams['clientTransactionId'] || 'unknown';
    const customerEmail = 'unknown'; // Podrías obtenerlo del usuario logueado
    const errorDetails = error?.message || 'Error desconocido en confirmación';

    this.whatsappAdminService.notifyPaymentIssue(transactionId, customerEmail, errorDetails);
  }

  // ✅ NUEVO: Obtener método de pago formateado
  private getPaymentMethodDisplay(data: any): string {
    if (data.cardBrand && data.lastDigits) {
      return `${data.cardBrand} **** ${data.lastDigits}`;
    } else if (data.cardBrand) {
      return data.cardBrand;
    }
    return 'Tarjeta';
  }

  // ✅ NUEVO: Obtener items del carrito desde localStorage o servicio
  private getCartItemsFromStorage(): any[] {
    try {
      // Intentar obtener del localStorage
      const cartData = localStorage.getItem('cart');
      if (cartData) {
        const cart = JSON.parse(cartData);
        return cart.items?.map((item: any) => ({
          productName: item.product?.name || 'Producto',
          variant: `${item.variant?.colorName || ''} - ${item.variant?.sizeName || ''}`.trim(),
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          totalPrice: item.totalPrice || 0
        })) || [];
      }
    } catch (error) {
      console.warn('No se pudo obtener items del carrito:', error);
    }
    
    return []; // Retornar array vacío si no hay datos
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
    // Crear ventana de impresión
    const printWindow = window.open('', '_blank', 'width=800,height=600');

    if (!printWindow) {
      console.error('No se pudo abrir la ventana de impresión');
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