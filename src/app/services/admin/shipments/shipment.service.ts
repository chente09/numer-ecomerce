import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, addDoc, doc, updateDoc, query,
  where, orderBy, onSnapshot, serverTimestamp, Timestamp, getDocs, arrayUnion
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Shipment, ShipmentItem } from '../../../models/models';
import { DistributorLedgerService } from '../distributorLedger/distributor-ledger.service';

@Injectable({ providedIn: 'root' })
export class ShipmentService {
  private firestore = inject(Firestore);
  private ledger = inject(DistributorLedgerService);

  private col = 'shipments';

  /** Devuelve el shipment abierto del distribuidor, o crea uno nuevo */
  async getOrCreateOpenShipment(distributorId: string, adminUid: string): Promise<string> {
    const ref = collection(this.firestore, this.col);
    const q = query(ref, where('distributorId', '==', distributorId), where('status', '==', 'open'));
    const snap = await getDocs(q);

    if (!snap.empty) {
      return snap.docs[0].id;
    }

    const newShipment: Omit<Shipment, 'id'> = {
      distributorId,
      status: 'open',
      transferIds: [],
      itemSummary: [],
      createdAt: serverTimestamp() as Timestamp,
      createdBy: adminUid,
    };

    const docRef = await addDoc(collection(this.firestore, this.col), newShipment);
    return docRef.id;
  }

  /** Agrega una transferencia al shipment abierto */
  async addTransferToShipment(
    shipmentId: string,
    transferId: string,
    item: ShipmentItem
  ): Promise<void> {
    const ref = doc(this.firestore, this.col, shipmentId);
    await updateDoc(ref, {
      transferIds: arrayUnion(transferId),
      itemSummary: arrayUnion(item),
    });
  }

  /** Admin marca el shipment como enviado y registra el costo en el ledger */
  async markAsSent(
    shipmentId: string,
    distributorId: string,
    shippingCost: number,
    adminUid: string,
    trackingUrl?: string,
    notes?: string
  ): Promise<void> {
    const ref = doc(this.firestore, this.col, shipmentId);
    const updates: Record<string, any> = {
      status: 'sent',
      shippingCost,
      sentAt: serverTimestamp(),
      sentBy: adminUid,
    };
    if (trackingUrl) updates['trackingUrl'] = trackingUrl;
    if (notes) updates['notes'] = notes;

    // Registrar el débito ANTES de cambiar el estado: si el débito falla,
    // el envío no queda marcado como "enviado" sin haber cobrado el flete.
    if (shippingCost > 0) {
      await this.ledger.registerDebit(
        distributorId,
        shippingCost,
        `Costo de envío - Despacho #${shipmentId.slice(-6).toUpperCase()}`,
        shipmentId,
        'transfer'
      );
    }

    await updateDoc(ref, updates);
  }

  /** Distribuidor confirma que recibió el envío */
  async confirmDelivery(shipmentId: string): Promise<void> {
    const ref = doc(this.firestore, this.col, shipmentId);
    await updateDoc(ref, {
      status: 'delivered',
      deliveredAt: serverTimestamp(),
    });
  }

  /** Todos los shipments de un distribuidor en tiempo real */
  getShipmentsByDistributor(distributorId: string): Observable<Shipment[]> {
    return new Observable(subscriber => {
      const q = query(
        collection(this.firestore, this.col),
        where('distributorId', '==', distributorId),
        orderBy('createdAt', 'desc')
      );
      const unsub = onSnapshot(q,
        snap => subscriber.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shipment))),
        err => subscriber.error(err)
      );
      return () => unsub();
    });
  }

  /** Todos los shipments (vista admin) */
  getAllShipments(): Observable<Shipment[]> {
    return new Observable(subscriber => {
      const q = query(
        collection(this.firestore, this.col),
        orderBy('createdAt', 'desc')
      );
      const unsub = onSnapshot(q,
        snap => subscriber.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shipment))),
        err => subscriber.error(err)
      );
      return () => unsub();
    });
  }
}
