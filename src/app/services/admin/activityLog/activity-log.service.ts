import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
import { UsersService } from '../../users/users.service';

@Injectable({
  providedIn: 'root'
})
export class ActivityLogService {
  private firestore = inject(Firestore);

  constructor(private usersService: UsersService) {}

  /**
   * 👁️ Registra vista de producto
   */
  async logProductView(productId: string, productName?: string): Promise<void> {
    try {
      const user = this.usersService.getCurrentUser();
      if (!user || user.isAnonymous) return;

      await addDoc(collection(this.firestore, 'user_activity_logs'), {
        action: 'product_view',
        userId: user.uid,
        timestamp: new Date(),
        resource: 'product',
        details: {
          productId,
          productName: productName || '',
          source: 'web'
        },
        metadata: {
          productId,
          userAgent: navigator.userAgent,
          url: window.location.href
        }
      });

      console.log('👁️ Vista de producto registrada:', productId);
    } catch (error) {
      console.error('❌ Error registrando vista:', error);
    }
  }

  /**
   * 💰 Registra compra de productos
   */
  async logPurchase(transactionId: string, cartItems: any[], total: number): Promise<void> {
    try {
      const user = this.usersService.getCurrentUser();
      if (!user) return;

      // Log individual para cada producto
      for (const item of cartItems) {
        await addDoc(collection(this.firestore, 'user_activity_logs'), {
          action: 'product_purchase',
          userId: user.uid,
          timestamp: new Date(),
          resource: 'product',
          details: {
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            transactionId
          },
          metadata: {
            productId: item.productId,
            transactionId
          }
        });
      }

      console.log('💰 Compra registrada:', transactionId);
    } catch (error) {
      console.error('❌ Error registrando compra:', error);
    }
  }
}