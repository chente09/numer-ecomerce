// src/app/services/telegram/telegram-admin.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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
  providedIn: 'root'
})
export class TelegramAdminService {
  private readonly BOT_TOKEN = '7885010912:AAHirk_3vTnU88bqugkUxUVkiAlnMqBib60'; // ✅ Reemplazar con tu token
  private readonly ADMIN_CHAT_ID = '7885010912'; // ✅ Reemplazar con tu chat ID
  private readonly API_URL = `https://api.telegram.org/bot${this.BOT_TOKEN}`;

  constructor(private http: HttpClient) { }

  /**
   * Envía notificación de nueva orden automáticamente
   */
  async sendOrderNotification(orderData: OrderNotification): Promise<void> {
    try {
      const message = this.buildOrderMessage(orderData);
      await this.sendMessage(message);
      console.log('✅ Notificación de orden enviada a Telegram');
    } catch (error) {
      console.error('❌ Error enviando notificación de orden:', error);
    }
  }

  /**
   * Envía notificación de problema de pago
   */
  async sendPaymentIssue(transactionId: string, customerEmail: string, errorDetails: string): Promise<void> {
    try {
      const message = this.buildPaymentIssueMessage(transactionId, customerEmail, errorDetails);
      await this.sendMessage(message);
      console.log('✅ Notificación de problema enviada a Telegram');
    } catch (error) {
      console.error('❌ Error enviando notificación de problema:', error);
    }
  }

  /**
   * Envía notificación de pago cancelado
   */
  async sendPaymentCancellation(transactionId: string, customerInfo?: any): Promise<void> {
    try {
      const message = this.buildCancellationMessage(transactionId, customerInfo);
      await this.sendMessage(message);
      console.log('✅ Notificación de cancelación enviada a Telegram');
    } catch (error) {
      console.error('❌ Error enviando notificación de cancelación:', error);
    }
  }

  /**
   * Método principal para enviar mensajes
   */
  private async sendMessage(text: string): Promise<void> {
    try {
      const payload = {
        chat_id: this.ADMIN_CHAT_ID,
        text: text,
        parse_mode: 'Markdown'
      };

      const response = await fetch(`${this.API_URL}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram API Error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log('📱 Mensaje enviado exitosamente a Telegram:', result.ok);

    } catch (error) {
      console.error('💥 Error crítico enviando mensaje a Telegram:', error);
      throw error;
    }
  }

  /**
   * Construye el mensaje de nueva orden
   */
  private buildOrderMessage(order: OrderNotification): string {
    const timestamp = new Date().toLocaleString('es-EC');

    let message = `🎉 *NUEVA VENTA CONFIRMADA*\n\n`;

    // Información básica
    message += `🏪 *NUMER ECOMMERCE*\n`;
    message += `📅 ${timestamp}\n\n`;

    // Información del pago
    message += `💰 *PAGO PROCESADO*\n`;
    message += `💵 Total: *$${order.paymentInfo.amount.toFixed(2)} ${order.paymentInfo.currency}*\n`;
    message += `🆔 ID: \`${order.transactionId}\`\n`;

    if (order.clientTransactionId) {
      message += `📋 Cliente ID: \`${order.clientTransactionId}\`\n`;
    }

    if (order.paymentInfo.authorizationCode) {
      message += `✅ Autorización: \`${order.paymentInfo.authorizationCode}\`\n`;
    }

    if (order.paymentInfo.paymentMethod) {
      message += `💳 Método: ${order.paymentInfo.paymentMethod}\n`;
    }

    // Información del cliente
    message += `\n👤 *INFORMACIÓN DEL CLIENTE*\n`;

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

    // Productos (si están disponibles)
    if (order.cartItems && order.cartItems.length > 0) {
      message += `\n🛒 *PRODUCTOS VENDIDOS*\n`;

      order.cartItems.forEach((item, index) => {
        message += `${index + 1}\\. ${item.productName}\n`;
        message += `   📦 Variante: ${item.variant || 'N/A'}\n`;
        message += `   📊 Cantidad: ${item.quantity}\n`;
        message += `   💲 Precio: $${item.unitPrice.toFixed(2)} c/u\n`;
        message += `   💰 Subtotal: $${item.totalPrice.toFixed(2)}\n\n`;
      });
    }

    // Próximos pasos
    message += `📦 *PRÓXIMOS PASOS*\n`;
    message += `1\\. ✅ Confirmar stock disponible\n`;
    message += `2\\. 📞 Contactar cliente para envío\n`;
    message += `3\\. 📦 Preparar productos\n`;
    message += `4\\. 🚚 Coordinar entrega\n\n`;

    message += `🔗 Revisa el panel de administración para más detalles`;

    return message;
  }

  /**
   * Construye mensaje de problema de pago
   */
  private buildPaymentIssueMessage(transactionId: string, customerEmail: string, errorDetails: string): string {
    return `⚠️ *PROBLEMA DE PAGO REPORTADO*

🏪 NUMER ECOMMERCE
📅 ${new Date().toLocaleString('es-EC')}

❌ *DETALLES DEL ERROR*
🆔 Transacción: \`${transactionId}\`
📧 Cliente: ${customerEmail}
🔧 Error: ${errorDetails}

🚨 *ACCIÓN REQUERIDA*
- Revisar estado del pago en Payphone
- Contactar al cliente si es necesario  
- Verificar si se procesó correctamente

💡 El cliente puede estar esperando confirmación\\.`;
  }

  /**
   * Construye mensaje de cancelación
   */
  private buildCancellationMessage(transactionId: string, customerInfo?: any): string {
    return `🚫 *PAGO CANCELADO*

🏪 NUMER ECOMMERCE  
📅 ${new Date().toLocaleString('es-EC')}

❌ *TRANSACCIÓN CANCELADA*
🆔 ID: \`${transactionId}\`
${customerInfo?.email ? `📧 Cliente: ${customerInfo.email}` : ''}

ℹ️ El cliente canceló el proceso de pago\\.
No se realizó ningún cargo\\.`;
  }

  /**
   * Método de testing para verificar conectividad
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.sendMessage('🧪 *TEST DE CONEXIÓN*\n\nEl bot de NUMER está funcionando correctamente\\!');
      return true;
    } catch (error) {
      console.error('❌ Test de conexión falló:', error);
      return false;
    }
  }
}