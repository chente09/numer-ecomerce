import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  arrayUnion,
  Timestamp
} from '@angular/fire/firestore';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, firstValueFrom } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Order } from '../../models/models';
import { UsersService } from '../users/users.service';

const SHIPPING_EMAIL_URL = 'https://backend-numer.netlify.app/.netlify/functions/send-shipping-email';

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pago pendiente',
  processing: 'En proceso',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  completed: 'Completado',
  pending_distributor_payment: 'Pago pendiente'
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending_payment: '#f57c00',
  processing: '#424242',
  shipped: '#212121',
  delivered: '#2b7b2b',
  cancelled: '#d32f2f',
  completed: '#2b7b2b',
  pending_distributor_payment: '#f57c00'
};

export function getOrderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] || status;
}

export function getOrderStatusColor(status: string): string {
  return ORDER_STATUS_COLORS[status] || 'default';
}

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private firestore = inject(Firestore);
  private http = inject(HttpClient);
  private usersService = inject(UsersService);
  private collectionName = 'orders';

  /** Pedidos de un cliente, más recientes primero */
  getOrdersByUser(userId: string, maxResults?: number): Observable<Order[]> {
    if (!userId) return of([]);

    const ref = collection(this.firestore, this.collectionName);
    const q = maxResults
      ? query(ref, where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(maxResults))
      : query(ref, where('userId', '==', userId), orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }).pipe(
      map(data => data as Order[]),
      catchError(error => {
        console.error('Error obteniendo pedidos del usuario:', error);
        return of([]);
      })
    );
  }

  /**
   * Todos los pedidos de CLIENTES (para el panel de admin) — excluye los
   * pedidos de distribuidor, que viven en la misma colección pero tienen
   * distributorId en vez de userId. Se filtra en memoria en vez de con un
   * segundo campo en la query para no requerir un índice compuesto y poder
   * ordenar simplemente por fecha (orderBy con desigualdad + otro campo
   * ordenaría primero por ese campo, no cronológicamente).
   */
  getAllOrders(): Observable<Order[]> {
    const ref = collection(this.firestore, this.collectionName);
    const q = query(ref, orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }).pipe(
      map(data => (data as Order[]).filter(o => !!o.userId)),
      catchError(error => {
        console.error('Error obteniendo todos los pedidos:', error);
        return of([]);
      })
    );
  }

  /** Un pedido específico, para rastreo por número */
  getOrderById(orderId: string): Observable<Order | undefined> {
    if (!orderId) return of(undefined);
    const ref = doc(this.firestore, this.collectionName, orderId);
    return docData(ref, { idField: 'id' }).pipe(
      map(data => data as Order | undefined),
      catchError(error => {
        console.error('Error obteniendo el pedido:', error);
        return of(undefined);
      })
    );
  }

  /** Admin: cambia el estado del pedido y agrega una entrada al historial */
  async updateOrderStatus(orderId: string, status: string, note?: string): Promise<void> {
    const ref = doc(this.firestore, this.collectionName, orderId);
    await updateDoc(ref, {
      status,
      statusHistory: arrayUnion({ status, date: new Date(), note: note || '' }),
      updatedAt: Timestamp.now()
    });
  }

  /** Admin: asigna número/URL de tracking (Servientrega u otra transportadora) */
  async setTracking(orderId: string, trackingNumber: string, trackingCarrier: string, trackingUrl?: string): Promise<void> {
    const ref = doc(this.firestore, this.collectionName, orderId);
    await updateDoc(ref, {
      trackingNumber,
      trackingCarrier,
      trackingUrl: trackingUrl || null,
      updatedAt: Timestamp.now()
    });
  }

  /**
   * Admin: emails the customer the tracking number (server side, Gmail). `resend` forces a new email even if
   * one was already sent (e.g. the guide number changed).
   */
  async sendShippingEmail(orderId: string, resend = false): Promise<{ sent: boolean; skipped?: string; reason?: string }> {
    const token = await this.usersService.getIdToken();
    if (!token) throw new Error('No se pudo verificar la sesión');
    const headers = new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
    return firstValueFrom(this.http.post<{ sent: boolean; skipped?: string; reason?: string }>(
      SHIPPING_EMAIL_URL, { orderId, resend }, { headers }
    ));
  }

  /**
   * The saved order of a payment that was just confirmed. The server writes it in the same transaction as the
   * confirmation, so it is normally there at once; retry briefly just in case.
   */
  async waitForOrder(orderId: string, attempts = 3, delayMs = 1000): Promise<Order | undefined> {
    if (!orderId) return undefined;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const order = await firstValueFrom(this.getOrderById(orderId));
        if (order) return order;
      } catch {
        /* optional data: callers continue without it */
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return undefined;
  }
}
