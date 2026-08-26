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
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Order } from '../../models/models';

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
  pending_payment: 'orange',
  processing: 'blue',
  shipped: 'geekblue',
  delivered: 'green',
  cancelled: 'red',
  completed: 'green',
  pending_distributor_payment: 'orange'
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
}
