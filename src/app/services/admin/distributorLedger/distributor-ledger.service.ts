import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc, query, where, getDocs, orderBy, serverTimestamp, Timestamp, doc, updateDoc, getDoc, onSnapshot } from '@angular/fire/firestore';
import { Observable, from, of, forkJoin } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { UsersService } from '../../users/users.service';
import { LedgerEntry, EnhancedLedgerSummary, PaymentDetails, PaymentReportFilter, PaymentReportData } from '../../../models/models';

@Injectable({
  providedIn: 'root'
})
export class DistributorLedgerService {
  private firestore = inject(Firestore);
  private usersService = inject(UsersService);
  private collectionName = 'distributor_ledger';
  private paymentDetailsCollection = 'payment_details';

  constructor() { }


  /**
   * Obtiene todos los movimientos del libro contable para un distribuidor, ordenados por fecha.
   */
  getLedgerEntries(distributorId: string): Observable<LedgerEntry[]> {
    if (!distributorId) return of([]);

    const ledgerRef = collection(this.firestore, this.collectionName);
    const q = query(
      ledgerRef,
      where('distributorId', '==', distributorId),
      orderBy('createdAt', 'desc')
    );

    // Creamos un nuevo Observable que envuelve el listener de Firestore.
    return new Observable(subscriber => {
      // onSnapshot se activa una vez con los datos iniciales y luego cada vez que hay un cambio.
      const unsubscribe = onSnapshot(q,
        (snapshot) => {
          const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerEntry));
          // Enviamos la nueva lista de entradas al componente que esté suscrito.
          subscriber.next(entries);
        },
        (error) => {
          // En caso de un error en el listener, lo notificamos.
          console.error("Error en el listener del libro contable:", error);
          subscriber.error(error);
        }
      );

      // Esto se ejecuta cuando el componente se destruye y cancela la suscripción,
      // evitando fugas de memoria.
      return () => unsubscribe();
    });
  }

  /**
   * Registra un nuevo pago (crédito) - EXTENDIDO con nuevos campos
   */
  async registerPayment(
    distributorId: string,
    amount: number,
    description: string,
    paymentDetails?: Partial<PaymentDetails>
  ): Promise<void> {
    const adminUid = this.usersService.getCurrentUser()?.uid;
    if (!adminUid) throw new Error("No se pudo identificar al administrador.");
    if (amount <= 0) throw new Error("El monto del pago debe ser mayor a cero.");

    const ledgerRef = collection(this.firestore, this.collectionName);
    const sourceId = `payment-${Date.now()}`;

    const newEntry = {
      distributorId,
      type: 'credit',
      amount,
      description,
      sourceId,
      sourceType: 'manual_payment',
      createdAt: serverTimestamp(),
      createdBy: adminUid,

      // ✅ NUEVOS CAMPOS
      paymentStatus: 'paid',
      paidAmount: amount,
      paymentDate: serverTimestamp(),
      paymentNotes: paymentDetails?.notes || '',
      paymentVoucher: paymentDetails?.voucherUrl || null
    };

    // Registrar en el libro contable
    const docRef = await addDoc(ledgerRef, newEntry);

    // Si hay detalles adicionales del pago, registrarlos
    if (paymentDetails) {
      await this.registerPaymentDetails(docRef.id, {
        ...paymentDetails,
        ledgerEntryId: docRef.id,
        distributorId,
        amount,
        registeredBy: adminUid,
        createdAt: serverTimestamp()
      } as PaymentDetails);
    }
  }

  /**
   * ✅ NUEVO: Registra una nueva deuda (débito) - EXTENDIDO
   */
  async registerDebit(
    distributorId: string,
    amount: number,
    description: string,
    sourceId: string,
    sourceType: 'transfer' | 'distributor_order',
    dueDate?: Date,
    relatedTransferId?: string
  ): Promise<void> {
    const adminUid = this.usersService.getCurrentUser()?.uid;
    if (!adminUid) throw new Error("No se pudo identificar al administrador.");
    if (amount <= 0) throw new Error("El monto de la deuda debe ser mayor a cero.");

    const ledgerRef = collection(this.firestore, this.collectionName);
    const newEntry = {
      distributorId,
      type: 'debit',
      amount,
      description,
      sourceId,
      sourceType,
      createdAt: serverTimestamp(),
      createdBy: adminUid,

      // ✅ NUEVOS CAMPOS PARA CONTROL
      paymentStatus: 'pending',
      paidAmount: 0,
      remainingAmount: amount,
      isPartialPayment: false,
      dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
      relatedTransferId: relatedTransferId || null
    };

    await addDoc(ledgerRef, newEntry);
  }

  // =====================================
  // ✅ NUEVOS MÉTODOS PARA CONTROL MEJORADO
  // =====================================

  /**
   * Marca un débito como pagado (total o parcialmente)
   */
  async markDebitAsPaid(
    debitId: string,
    paidAmount: number,
    paymentDetails: Partial<PaymentDetails>
  ): Promise<void> {
    const adminUid = this.usersService.getCurrentUser()?.uid;
    if (!adminUid) throw new Error("No se pudo identificar al administrador.");

    // Obtener el débito original
    const debitRef = doc(this.firestore, this.collectionName, debitId);
    const debitDoc = await getDoc(debitRef);

    if (!debitDoc.exists()) {
      throw new Error("No se encontró el registro de deuda.");
    }

    const debitData = debitDoc.data() as LedgerEntry;
    const currentPaid = debitData.paidAmount || 0;
    const totalPaid = currentPaid + paidAmount;
    const remaining = debitData.amount - totalPaid;

    // Determinar el estado del pago
    let paymentStatus: 'pending' | 'paid' | 'partial';
    if (remaining <= 0) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      paymentStatus = 'partial';
    } else {
      paymentStatus = 'pending';
    }

    // Actualizar el débito
    await updateDoc(debitRef, {
      paidAmount: totalPaid,
      remainingAmount: Math.max(0, remaining),
      paymentStatus,
      paymentDate: paymentStatus === 'paid' ? serverTimestamp() : null,
      paymentNotes: paymentDetails.notes || '',
      paymentVoucher: paymentDetails.voucherUrl || null,
      isPartialPayment: totalPaid > 0 && remaining > 0
    });

    // Registrar el pago como crédito
    await this.registerPayment(
      debitData.distributorId,
      paidAmount,
      `Pago aplicado a: ${debitData.description}`,
      {
        ...paymentDetails,
        parentDebitId: debitId
      }
    );
  }

  /**
 * ✅ CORREGIDO: Obtiene resumen financiero mejorado con redondeo correcto
 */
  calculateEnhancedSummary(entries: LedgerEntry[]): EnhancedLedgerSummary {
    const now = new Date();

    // ✅ PASO 1: Calcular remainingAmount correcto para débitos considerando devoluciones
    const debitsWithCorrectRemaining = this.calculateRemainingAmountsForDebits(entries);

    let totalDebit = 0;
    let totalCredit = 0;
    let pendingAmount = 0;
    let paidAmount = 0;
    let overdueAmount = 0;
    let partialPayments = 0;
    let totalAgeInDays = 0;
    let ageCount = 0;
    let oldestUnpaidDate: Date | undefined;
    let lastPaymentDate: Date | undefined;

    entries.forEach(entry => {
      if (entry.type === 'debit') {
        totalDebit += entry.amount;

        // ✅ USAR remainingAmount corregido que considera devoluciones
        const correctedDebit = debitsWithCorrectRemaining.find(d => d.id === entry.id);
        const actualRemaining = correctedDebit?.remainingAmount ?? entry.remainingAmount ?? entry.amount;
        const actualPaid = correctedDebit?.paidAmount ?? entry.paidAmount ?? 0;

        if (entry.paymentStatus === 'pending' || entry.paymentStatus === 'partial' || actualRemaining > 0) {
          pendingAmount += actualRemaining;

          // Calcular edad de la deuda
          const createdDate = entry.createdAt.toDate();
          const ageInDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
          totalAgeInDays += ageInDays;
          ageCount++;

          // Verificar si está vencida
          if (entry.dueDate && entry.dueDate.toDate() < now) {
            overdueAmount += actualRemaining;
          }

          // Rastrear la deuda sin pagar más antigua
          if (!oldestUnpaidDate || createdDate < oldestUnpaidDate) {
            oldestUnpaidDate = createdDate;
          }
        }

        if (actualPaid > 0) {
          paidAmount += actualPaid;
          if (entry.isPartialPayment || (actualPaid > 0 && actualRemaining > 0)) {
            partialPayments++;
          }
        }
      } else if (entry.type === 'credit') {
        totalCredit += entry.amount;

        // Rastrear último pago
        const paymentDate = entry.paymentDate?.toDate() || entry.createdAt.toDate();
        if (!lastPaymentDate || paymentDate > lastPaymentDate) {
          lastPaymentDate = paymentDate;
        }
      }
    });

    // ✅ REDONDEO MEJORADO PARA EVITAR ERRORES DE FLOTANTES
    const roundedTotalDebit = Math.round(totalDebit * 100) / 100;
    const roundedTotalCredit = Math.round(totalCredit * 100) / 100;
    const roundedPendingAmount = Math.round(pendingAmount * 100) / 100;
    const roundedPaidAmount = Math.round(paidAmount * 100) / 100;
    const roundedOverdueAmount = Math.round(overdueAmount * 100) / 100;

    return {
      totalDebit: roundedTotalDebit,
      totalCredit: roundedTotalCredit,
      balance: Math.round((roundedTotalDebit - roundedTotalCredit) * 100) / 100,
      pendingAmount: roundedPendingAmount,
      paidAmount: roundedPaidAmount,
      overdueAmount: roundedOverdueAmount,
      partialPayments,
      totalTransactions: entries.length,
      averageDebtAge: ageCount > 0 ? Math.round(totalAgeInDays / ageCount) : 0,
      oldestUnpaidDate,
      lastPaymentDate
    };
  }

  /**
   * ✅ NUEVO: Calcula remainingAmount correcto para cada débito
   * considerando devoluciones automáticas relacionadas por producto/variante
   */
  private calculateRemainingAmountsForDebits(entries: LedgerEntry[]): LedgerEntry[] {
    const debits = entries.filter(e => e.type === 'debit');
    const credits = entries.filter(e => e.type === 'credit');

    return debits.map(debit => {
      // Buscar créditos que sean devoluciones relacionadas con este débito
      const relatedReturns = credits.filter(credit => {
        // Solo considerar devoluciones automáticas
        if (!credit.description.toLowerCase().includes('devolución')) {
          return false;
        }

        // Comparar producto/variante usando el mismo método que el componente
        const debitInfo = this.extractProductInfo(debit.description);
        const creditInfo = this.extractProductInfo(credit.description);

        return debitInfo.product === creditInfo.product &&
          debitInfo.variant === creditInfo.variant;
      });

      // Calcular total de devoluciones automáticas
      const totalAutomaticReturns = relatedReturns.reduce((sum, returnEntry) => {
        return sum + returnEntry.amount;
      }, 0);

      // Calcular pagos manuales realizados
      const manualPayments = debit.paidAmount || 0;

      // Calcular remainingAmount considerando tanto pagos manuales como devoluciones
      const totalReductions = manualPayments + totalAutomaticReturns;
      const remainingAmount = Math.max(0, debit.amount - totalReductions);

      return {
        ...debit,
        remainingAmount,
        paidAmount: manualPayments // Solo pagos manuales, no incluir devoluciones aquí
      };
    });
  }

  /**
   * ✅ NUEVO: Extrae información de producto/variante de la descripción
   * (Mantiene consistencia con la lógica del componente)
   */
  private extractProductInfo(description: string): { product: string; variant: string } {
    const PRODUCT_VARIANT_REGEX = /(.+?)\s*\(([^)]+)\)/;
    const CLEAN_PATTERNS = [
      /^.*?\d+\s*x\s*/i,           // "transferencia de 2 x"
      /^transferencia\s+de\s*/i,   // "transferencia de"
      /^devolución\s+de\s*/i       // "devolución de"
    ];

    const match = description.match(PRODUCT_VARIANT_REGEX);

    if (match) {
      let productPart = match[1].toLowerCase().trim();
      const variantPart = match[2].toLowerCase().trim();

      // Limpieza con patrones predefinidos
      for (const pattern of CLEAN_PATTERNS) {
        productPart = productPart.replace(pattern, '').trim();
      }

      return {
        product: productPart,
        variant: variantPart
      };
    }

    return { product: description.toLowerCase(), variant: '' };
  }

  /**
   * Obtiene entradas filtradas para reportes
   */
  getFilteredLedgerEntries(filter: PaymentReportFilter): Observable<LedgerEntry[]> {
    const ledgerRef = collection(this.firestore, this.collectionName);
    let constraints: any[] = [];

    if (filter.distributorId) {
      constraints.push(where('distributorId', '==', filter.distributorId));
    }

    if (filter.sourceType && filter.sourceType !== 'all') {
      constraints.push(where('sourceType', '==', filter.sourceType));
    }

    if (filter.paymentStatus && filter.paymentStatus !== 'all') {
      constraints.push(where('paymentStatus', '==', filter.paymentStatus));
    }

    constraints.push(orderBy('createdAt', 'desc'));

    const q = query(ledgerRef, ...constraints);

    return from(getDocs(q)).pipe(
      map(snapshot => {
        let entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerEntry));

        // Filtros adicionales que no se pueden hacer en Firestore
        if (filter.dateFrom) {
          entries = entries.filter(entry => entry.createdAt.toDate() >= filter.dateFrom!);
        }
        if (filter.dateTo) {
          entries = entries.filter(entry => entry.createdAt.toDate() <= filter.dateTo!);
        }
        if (filter.minAmount) {
          entries = entries.filter(entry => entry.amount >= filter.minAmount!);
        }
        if (filter.maxAmount) {
          entries = entries.filter(entry => entry.amount <= filter.maxAmount!);
        }

        return entries;
      }),
      catchError(error => {
        console.error("Error al obtener entradas filtradas:", error);
        return of([]);
      })
    );
  }

  /**
   * Registra detalles adicionales del pago
   */
  private async registerPaymentDetails(ledgerEntryId: string, details: PaymentDetails): Promise<void> {
    const detailsRef = collection(this.firestore, this.paymentDetailsCollection);
    await addDoc(detailsRef, {
      ...details,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  /**
   * Obtiene detalles de un pago específico
   */
  getPaymentDetails(ledgerEntryId: string): Observable<PaymentDetails | null> {
    const detailsRef = collection(this.firestore, this.paymentDetailsCollection);
    const q = query(detailsRef, where('ledgerEntryId', '==', ledgerEntryId));

    return from(getDocs(q)).pipe(
      map(snapshot => {
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() } as PaymentDetails;
      }),
      catchError(() => of(null))
    );
  }

  /**
   * ✅ MÉTODO LEGACY: Mantiene compatibilidad con el método original
   */
  calculateSummary(entries: LedgerEntry[]): { totalDebit: number; totalCredit: number; balance: number } {
    const enhanced = this.calculateEnhancedSummary(entries);
    return {
      totalDebit: enhanced.totalDebit,
      totalCredit: enhanced.totalCredit,
      balance: enhanced.balance
    };
  }


}