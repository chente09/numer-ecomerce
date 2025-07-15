import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc, query, where, getDocs, orderBy, serverTimestamp, Timestamp } from '@angular/fire/firestore';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { UsersService } from '../../users/users.service';
import { LedgerEntry, LedgerSummary } from '../../../models/models';

@Injectable({
  providedIn: 'root'
})
export class DistributorLedgerService {
  private firestore = inject(Firestore);
  private usersService = inject(UsersService);
  private collectionName = 'distributor_ledger';

  constructor() { }

  /**
   * Obtiene todos los movimientos del libro contable para un distribuidor, ordenados por fecha.
   * @param distributorId El UID del distribuidor.
   * @returns Un Observable con un array de entradas del libro contable.
   */
  getLedgerEntries(distributorId: string): Observable<LedgerEntry[]> {
    if (!distributorId) return of([]);
    
    const ledgerRef = collection(this.firestore, this.collectionName);
    const q = query(
      ledgerRef,
      where('distributorId', '==', distributorId),
      orderBy('createdAt', 'desc')
    );

    return from(getDocs(q)).pipe(
      map(snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerEntry))),
      catchError(error => {
        console.error("Error al obtener los registros del libro contable:", error);
        return of([]);
      })
    );
  }

  /**
   * Registra un nuevo pago (crédito) para un distribuidor.
   * @param distributorId El UID del distribuidor que realiza el pago.
   * @param amount El monto del pago.
   * @param description Una descripción para el pago (ej. "Abono semanal").
   * @returns Una promesa que se resuelve cuando la operación finaliza.
   */
  async registerPayment(distributorId: string, amount: number, description: string): Promise<void> {
    const adminUid = this.usersService.getCurrentUser()?.uid;
    if (!adminUid) throw new Error("No se pudo identificar al administrador.");
    if (amount <= 0) throw new Error("El monto del pago debe ser mayor a cero.");

    const ledgerRef = collection(this.firestore, this.collectionName);
    const newEntry = {
      distributorId,
      type: 'credit',
      amount,
      description,
      sourceId: `payment-${Date.now()}`,
      sourceType: 'manual_payment',
      createdAt: serverTimestamp(),
      createdBy: adminUid
    };
    await addDoc(ledgerRef, newEntry);
  }

  /**
   * ✅ NUEVO: Registra una nueva deuda (débito) para un distribuidor.
   */
  async registerDebit(distributorId: string, amount: number, description: string, sourceId: string, sourceType: 'transfer' | 'distributor_order'): Promise<void> {
    const adminUid = this.usersService.getCurrentUser()?.uid;
    if (!adminUid) throw new Error("No se pudo identificar al administrador.");
    if (amount <= 0) throw new Error("El monto de la deuda debe ser mayor a cero.");

    const ledgerRef = collection(this.firestore, this.collectionName);
    const newEntry = {
      distributorId,
      type: 'debit', // Es una deuda
      amount,
      description,
      sourceId,
      sourceType,
      createdAt: serverTimestamp(),
      createdBy: adminUid
    };
    await addDoc(ledgerRef, newEntry);
  }

  /**
   * Calcula el resumen financiero a partir de los movimientos del libro contable.
   * @param entries Un array de LedgerEntry.
   * @returns Un objeto LedgerSummary con los totales y el saldo.
   */
  calculateSummary(entries: LedgerEntry[]): LedgerSummary {
    const summary: LedgerSummary = { totalDebit: 0, totalCredit: 0, balance: 0 };
    entries.forEach(entry => {
      if (entry.type === 'debit') {
        summary.totalDebit += entry.amount;
      } else if (entry.type === 'credit') {
        summary.totalCredit += entry.amount;
      }
    });
    summary.balance = summary.totalDebit - summary.totalCredit;
    return summary;
  }
}
