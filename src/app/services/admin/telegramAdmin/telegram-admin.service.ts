// src/app/services/telegram/telegram-admin.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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
  private readonly BACKEND_URL = 'https://backend-numer.netlify.app/.netlify/functions';

  constructor(private http: HttpClient) { }

  /**
   * ✅ NUEVO: Envía notificación usando el backend seguro
   */
  async sendOrderNotification(orderData: OrderNotification): Promise<void> {
    try {
      console.log('📱 Enviando notificación a través del backend...');

      const response = await fetch(`${this.BACKEND_URL}/telegram-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'order_success',
          data: {
            transactionId: orderData.transactionId,
            clientTransactionId: orderData.clientTransactionId,
            amount: orderData.paymentInfo.amount,
            currency: orderData.paymentInfo.currency,
            authorizationCode: orderData.paymentInfo.authorizationCode,
            paymentMethod: orderData.paymentInfo.paymentMethod,
            email: orderData.customerInfo.email,
            phone: orderData.customerInfo.phone,
            document: orderData.customerInfo.document,
            name: orderData.customerInfo.name,
            cartItems: orderData.cartItems || []
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend Error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Notificación enviada correctamente:', result);
    } catch (error) {
      console.error('❌ Error enviando notificación de orden:', error);
      throw error;
    }
  }

  /**
   * ✅ NUEVO: Envía problema de pago usando backend
   */
  async sendPaymentIssue(transactionId: string, customerEmail: string, errorDetails: string): Promise<void> {
    try {
      const response = await fetch(`${this.BACKEND_URL}/telegram-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'payment_issue',
          data: {
            transactionId,
            customerEmail,
            errorDetails
          }
        })
      });

      if (!response.ok) {
        console.warn('⚠️ No se pudo enviar notificación de problema:', await response.text());
      } else {
        console.log('✅ Notificación de problema enviada');
      }
    } catch (error) {
      console.error('❌ Error enviando notificación de problema:', error);
    }
  }

  /**
   * ✅ NUEVO: Envía cancelación usando backend
   */
  async sendPaymentCancellation(transactionId: string, customerInfo?: any): Promise<void> {
    try {
      const response = await fetch(`${this.BACKEND_URL}/telegram-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'payment_cancellation',
          data: {
            transactionId,
            email: customerInfo?.email,
            phone: customerInfo?.phone
          }
        })
      });

      if (!response.ok) {
        console.warn('⚠️ No se pudo enviar notificación de cancelación:', await response.text());
      } else {
        console.log('✅ Notificación de cancelación enviada');
      }
    } catch (error) {
      console.error('❌ Error enviando notificación de cancelación:', error);
    }
  }

  /**
   * ✅ NUEVO: Test de conexión usando backend
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 Probando conexión con backend...');

      const response = await fetch(`${this.BACKEND_URL}/telegram-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'test',
          data: {}
        })
      });

      const success = response.ok;

      if (success) {
        console.log('✅ Test de backend exitoso');
      } else {
        console.error('❌ Test de backend falló:', await response.text());
      }

      return success;
    } catch (error) {
      console.error('❌ Error en test de conexión:', error);
      return false;
    }
  }

  /**
   * ✅ NUEVO: Envía notificación de nueva solicitud de distribuidor
   */
  async sendDistributorRequestNotification(requestData: {
    nombreComercial: string;
    nombreContacto: string;
    email: string;
    telefono: string;
    direccion?: string;
    ciudad: string;
    provincia: string;
    tipoNegocio: 'minorista' | 'mayorista' | 'online';
    experiencia: string;
    volumenEstimado: string;
    motivacion: string;
    sitioWeb?: string;
    rlc: string;
  }): Promise<void> {
    try {
      console.log('📱 Enviando notificación de solicitud de distribuidor...');

      const response = await fetch(`${this.BACKEND_URL}/telegram-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'distributor_request',
          data: requestData,
          apiKey: 'numer_secret_key_2024' // ⚠️ TEMPORAL - mover a environment después
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend Error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Notificación de solicitud enviada correctamente:', result);
    } catch (error) {
      console.error('❌ Error enviando notificación de solicitud:', error);
      // No re-lanzamos el error para no bloquear el guardado de la solicitud
      console.warn('⚠️ La solicitud se guardó pero no se pudo notificar al equipo');
    }
  }

}