// src/app/services/whatsapp/whatsapp-admin.service.ts
import { Injectable } from '@angular/core';

export interface OrderNotification {
  transactionId: string;
  clientTransactionId?: string;
  customerInfo: {
    email?: string;
    phone?: string;
    document?: string;
    name?: string;
  };
  paymentInfo: {
    amount: number;
    currency: string;
    paymentMethod?: string;
    authorizationCode?: string;
    date: Date;
  };
  cartItems?: {
    productName: string;
    variant: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];
}

@Injectable({
  providedIn: 'root',
})
export class WhatsAppAdminService {
  private readonly adminPhone = '593983875666'; // Número del administrador
  private readonly businessName = 'Ecommerce NUMER'; // Nombre de tu negocio

  constructor() { }

  /**
   * Notifica al admin sobre nueva venta exitosa
   */
  notifyNewOrder(orderData: OrderNotification): void {
    const message = this.buildNewOrderMessage(orderData);
    this.sendToAdmin(message);
  }

  /**
   * Notifica problemas de pago al admin
   */
  notifyPaymentIssue(
    transactionId: string,
    customerEmail: string,
    errorDetails: string
  ): void {
    const message = this.buildPaymentIssueMessage(
      transactionId,
      customerEmail,
      errorDetails
    );
    this.sendToAdmin(message);
  }

  /**
   * Notifica cancelación de pago
   */
  notifyPaymentCancellation(transactionId: string, customerInfo?: any): void {
    const message = this.buildCancellationMessage(transactionId, customerInfo);
    this.sendToAdmin(message);
  }

  private sendToAdmin(message: string): void {
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${this.adminPhone}?text=${encodedMessage}`;

    // Abrir automáticamente (o en nueva ventana pequeña que se cierre)
    const popup = window.open(whatsappUrl, '_blank', 'width=400,height=600');

    // Cerrar popup automáticamente después de 3 segundos (opcional)
    setTimeout(() => {
      if (popup && !popup.closed) {
        popup.close();
      }
    }, 3000);
  }

  private buildNewOrderMessage(order: OrderNotification): string {
    const timestamp = new Date().toLocaleString('es-EC');

    // Sección principal
    let message = `🎉 *¡NUEVA VENTA CONFIRMADA!*\n\n`;

    // Información básica
    message += `🏪 *${this.businessName}*\n`;
    message += `📅 ${timestamp}\n\n`;

    // Detalles de la transacción
    message += `💳 *PAGO PROCESADO*\n`;
    message += `💰 Total: *$${order.paymentInfo.amount.toFixed(2)} ${order.paymentInfo.currency
      }*\n`;
    message += `🆔 ID: ${order.transactionId}\n`;

    if (order.clientTransactionId) {
      message += `📋 Cliente ID: ${order.clientTransactionId}\n`;
    }

    if (order.paymentInfo.authorizationCode) {
      message += `✅ Autorización: ${order.paymentInfo.authorizationCode}\n`;
    }

    if (order.paymentInfo.paymentMethod) {
      message += `💳 Método: ${order.paymentInfo.paymentMethod}\n`;
    }

    message += `\n`;

    // Información del cliente
    message += `👤 *INFORMACIÓN DEL CLIENTE*\n`;

    if (order.customerInfo.name) {
      message += `📛 Nombre: ${order.customerInfo.name}\n`;
    }

    if (order.customerInfo.email) {
      message += `📧 Email: ${order.customerInfo.email}\n`;
    }

    if (order.customerInfo.phone) {
      message += `📱 Teléfono: ${order.customerInfo.phone}\n`;
    }

    if (order.customerInfo.document) {
      message += `🆔 Documento: ${order.customerInfo.document}\n`;
    }

    // Productos comprados (si disponible)
    if (order.cartItems && order.cartItems.length > 0) {
      message += `\n🛒 *PRODUCTOS VENDIDOS*\n`;

      order.cartItems.forEach((item, index) => {
        message += `${index + 1}. ${item.productName}\n`;
        message += `   Variante: ${item.variant}\n`;
        message += `   Cantidad: ${item.quantity}\n`;
        message += `   Precio: $${item.unitPrice.toFixed(2)} c/u\n`;
        message += `   Subtotal: $${item.totalPrice.toFixed(2)}\n\n`;
      });
    }

    // Próximos pasos
    message += `📦 *PRÓXIMOS PASOS*\n`;
    message += `1. ✅ Confirmar stock disponible\n`;
    message += `2. 📞 Contactar cliente para envío\n`;
    message += `3. 📦 Preparar productos\n`;
    message += `4. 🚚 Coordinar entrega\n\n`;

    message += `🔗 Ver detalles completos en el panel admin`;

    return message;
  }

  private buildPaymentIssueMessage(
    transactionId: string,
    customerEmail: string,
    errorDetails: string
  ): string {
    return `⚠️ *PROBLEMA DE PAGO REPORTADO*

🏪 ${this.businessName}
📅 ${new Date().toLocaleString('es-EC')}

❌ *DETALLES DEL ERROR*
🆔 Transacción: ${transactionId}
📧 Cliente: ${customerEmail}
🔧 Error: ${errorDetails}

🚨 *ACCIÓN REQUERIDA*
- Revisar estado del pago en Payphone
- Contactar al cliente si es necesario
- Verificar si se procesó correctamente

💡 El cliente puede estar esperando confirmación.`;
  }

  private buildCancellationMessage(
    transactionId: string,
    customerInfo?: any
  ): string {
    return `🚫 *PAGO CANCELADO*

🏪 ${this.businessName}
📅 ${new Date().toLocaleString('es-EC')}

❌ *TRANSACCIÓN CANCELADA*
🆔 ID: ${transactionId}
${customerInfo?.email ? `📧 Cliente: ${customerInfo.email}` : ''}

ℹ️ El cliente canceló el proceso de pago.
No se realizó ningún cargo.`;
  }
}
