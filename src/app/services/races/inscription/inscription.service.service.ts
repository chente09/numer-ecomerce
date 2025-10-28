import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDocs,
  Timestamp
} from '@angular/fire/firestore';
import {
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from '@angular/fire/storage';
import { Observable, from, of, forkJoin } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { ErrorUtil } from '../../../utils/error-util';
import { RaceInscription, InscriptionSummary } from '../../../models/race.model';
import { RaceService } from '../race/race-service.service';

@Injectable({
  providedIn: 'root'
})
export class InscriptionService {
  private collectionName = 'race-inscriptions';

  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private raceService: RaceService
  ) { }

  // ==================== MÉTODOS DE LECTURA ====================

  /**
   * Obtener todas las inscripciones de un usuario
   */
  getUserInscriptions(userId: string): Observable<RaceInscription[]> {
    const inscriptionsRef = collection(this.firestore, this.collectionName);
    const q = query(
      inscriptionsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(data => this.convertTimestamps(data as any[])),
      catchError(error => ErrorUtil.handleError(error, `getUserInscriptions(${userId})`))
    );
  }

  /**
   * Obtener inscripción por ID
   */
  getInscriptionById(id: string): Observable<RaceInscription | undefined> {
    return from(this.fetchInscriptionById(id)).pipe(
      catchError(error => ErrorUtil.handleError(error, `getInscriptionById(${id})`))
    );
  }

  /**
   * Obtener todas las inscripciones de una carrera específica
   */
  getRaceInscriptions(raceId: string): Observable<RaceInscription[]> {
    const inscriptionsRef = collection(this.firestore, this.collectionName);
    const q = query(
      inscriptionsRef,
      where('raceId', '==', raceId),
      orderBy('createdAt', 'asc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(data => this.convertTimestamps(data as any[])),
      catchError(error => ErrorUtil.handleError(error, `getRaceInscriptions(${raceId})`))
    );
  }

  /**
   * Verificar si un usuario ya está inscrito en una carrera
   */
  isUserRegistered(userId: string, raceId: string): Observable<boolean> {
    const inscriptionsRef = collection(this.firestore, this.collectionName);
    const q = query(
      inscriptionsRef,
      where('userId', '==', userId),
      where('raceId', '==', raceId),
      where('status', 'in', ['pending-payment', 'confirmed'])
    );

    return from(getDocs(q)).pipe(
      map(snapshot => !snapshot.empty),
      catchError(error => {
        console.error('Error verificando inscripción:', error);
        return of(false);
      })
    );
  }

  /**
   * Obtener resumen de inscripciones del usuario
   */
  getUserInscriptionsSummary(userId: string): Observable<InscriptionSummary[]> {
    return this.getUserInscriptions(userId).pipe(
      map(inscriptions => inscriptions.map(i => ({
        inscriptionId: i.id,
        raceName: i.raceName,
        raceDate: i.participante.fechaNacimiento, // Usando fecha de carrera
        participantName: `${i.participante.nombre} ${i.participante.apellido}`,
        status: i.status,
        amount: i.payment.amount,
        createdAt: i.createdAt
      })))
    );
  }

  /**
   * Obtener inscripciones confirmadas de una carrera (para estadísticas)
   */
  getConfirmedInscriptions(raceId: string): Observable<number> {
    const inscriptionsRef = collection(this.firestore, this.collectionName);
    const q = query(
      inscriptionsRef,
      where('raceId', '==', raceId),
      where('status', '==', 'confirmed')
    );

    return from(getDocs(q)).pipe(
      map(snapshot => snapshot.size),
      catchError(() => of(0))
    );
  }

  // ==================== MÉTODOS DE ESCRITURA ====================

  /**
   * Crear una nueva inscripción (estado inicial: pending-payment)
   */
  createInscription(
    inscription: Omit<RaceInscription, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'payment'>,
    certificadoMedicoFile?: File
  ): Observable<string> {
    // Primero verificar si el usuario ya está inscrito
    return this.isUserRegistered(inscription.userId, inscription.raceId).pipe(
      switchMap(isRegistered => {
        if (isRegistered) {
          throw new Error('Ya tienes una inscripción activa para esta carrera');
        }

        // Verificar disponibilidad de cupos
        return this.raceService.checkAvailability(inscription.raceId);
      }),
      switchMap(isAvailable => {
        if (!isAvailable) {
          throw new Error('Esta carrera ya no tiene cupos disponibles');
        }

        // Subir certificado médico si existe
        if (certificadoMedicoFile) {
          const inscriptionId = uuidv4();
          return from(this.uploadDocument(
            `inscriptions/${inscriptionId}/certificado-medico.pdf`,
            certificadoMedicoFile
          )).pipe(
            map(url => ({ inscriptionId, certificadoMedicoUrl: url }))
          );
        }

        return of({ inscriptionId: uuidv4(), certificadoMedicoUrl: undefined });
      }),
      switchMap(({ inscriptionId, certificadoMedicoUrl }) => {
        const inscriptionsRef = collection(this.firestore, this.collectionName);

        const newInscription = {
          ...inscription,
          status: 'pending-payment' as const,
          payment: {
            transactionId: '',
            amount: 0,
            currency: 'USD',
            status: 'pending' as const
          },
          certificadoMedicoUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        return from(addDoc(inscriptionsRef, newInscription)).pipe(
          map(docRef => docRef.id)
        );
      }),
      catchError(error => ErrorUtil.handleError(error, 'createInscription'))
    );
  }

  /**
   * Confirmar pago de inscripción
   */
  confirmPayment(
    inscriptionId: string,
    transactionId: string,
    amount: number,
    paymentMethod?: string
  ): Observable<void> {
    return from(this.getInscriptionById(inscriptionId)).pipe(
      switchMap(inscription => {
        if (!inscription) {
          throw new Error(`La inscripción con ID ${inscriptionId} no existe`);
        }

        const docRef = doc(this.firestore, `${this.collectionName}/${inscriptionId}`);

        // Actualizar inscripción
        const updateData = {
          status: 'confirmed' as const,
          payment: {
            transactionId,
            amount,
            currency: 'USD',
            status: 'completed' as const,
            paymentDate: serverTimestamp(),
            paymentMethod: paymentMethod || 'tarjeta'
          },
          confirmedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        return from(updateDoc(docRef, updateData)).pipe(
          // Incrementar contador de inscritos en la carrera
          switchMap(() => this.raceService.incrementInscriptions(inscription.raceId))
        );
      }),
      map(() => undefined),
      catchError(error => ErrorUtil.handleError(error, `confirmPayment(${inscriptionId})`))
    );
  }

  /**
   * Asignar número de dorsal
   */
  assignBibNumber(inscriptionId: string, numeroDorsal: string): Observable<void> {
    const docRef = doc(this.firestore, `${this.collectionName}/${inscriptionId}`);

    return from(updateDoc(docRef, {
      numeroDorsal,
      updatedAt: serverTimestamp()
    })).pipe(
      map(() => undefined),
      catchError(error => ErrorUtil.handleError(error, `assignBibNumber(${inscriptionId})`))
    );
  }

  /**
   * Cancelar inscripción
   */
  cancelInscription(inscriptionId: string, reason?: string): Observable<void> {
    return from(this.getInscriptionById(inscriptionId)).pipe(
      switchMap(inscription => {
        if (!inscription) {
          throw new Error(`La inscripción con ID ${inscriptionId} no existe`);
        }

        if (inscription.status === 'cancelled') {
          throw new Error('Esta inscripción ya está cancelada');
        }

        const docRef = doc(this.firestore, `${this.collectionName}/${inscriptionId}`);

        return from(updateDoc(docRef, {
          status: 'cancelled' as const,
          cancelledAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }));
      }),
      map(() => undefined),
      catchError(error => ErrorUtil.handleError(error, `cancelInscription(${inscriptionId})`))
    );
  }

  /**
   * Actualizar información del participante
   */
  updateParticipantInfo(
    inscriptionId: string,
    data: Partial<RaceInscription['participante']>
  ): Observable<void> {
    return from(this.getInscriptionById(inscriptionId)).pipe(
      switchMap(inscription => {
        if (!inscription) {
          throw new Error(`La inscripción con ID ${inscriptionId} no existe`);
        }

        const docRef = doc(this.firestore, `${this.collectionName}/${inscriptionId}`);

        const updatedParticipante = {
          ...inscription.participante,
          ...data
        };

        return from(updateDoc(docRef, {
          participante: updatedParticipante,
          updatedAt: serverTimestamp()
        }));
      }),
      map(() => undefined),
      catchError(error => ErrorUtil.handleError(error, `updateParticipantInfo(${inscriptionId})`))
    );
  }

  /**
   * Registrar resultado de carrera
   */
  recordRaceResult(
    inscriptionId: string,
    tiempoOficial: string,
    posicionGeneral?: number,
    posicionCategoria?: number
  ): Observable<void> {
    const docRef = doc(this.firestore, `${this.collectionName}/${inscriptionId}`);

    return from(updateDoc(docRef, {
      tiempoOficial,
      posicionGeneral,
      posicionCategoria,
      status: 'attended' as const,
      updatedAt: serverTimestamp()
    })).pipe(
      map(() => undefined),
      catchError(error => ErrorUtil.handleError(error, `recordRaceResult(${inscriptionId})`))
    );
  }

  /**
   * Eliminar inscripción (solo admin)
   */
  deleteInscription(id: string): Observable<void> {
    return from(this.getInscriptionById(id)).pipe(
      switchMap(inscription => {
        if (!inscription) {
          throw new Error(`La inscripción con ID ${id} no existe`);
        }

        // Eliminar documentos asociados
        const deleteFiles$ = [];

        if (inscription.certificadoMedicoUrl) {
          deleteFiles$.push(
            from(this.deleteDocumentIfExists(inscription.certificadoMedicoUrl))
              .pipe(catchError(() => of(undefined)))
          );
        }

        if (inscription.comprobanteUrl) {
          deleteFiles$.push(
            from(this.deleteDocumentIfExists(inscription.comprobanteUrl))
              .pipe(catchError(() => of(undefined)))
          );
        }

        return (deleteFiles$.length > 0 ? forkJoin(deleteFiles$) : of([])).pipe(
          switchMap(() => {
            const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
            return from(deleteDoc(docRef));
          })
        );
      }),
      map(() => undefined),
      catchError(error => ErrorUtil.handleError(error, `deleteInscription(${id})`))
    );
  }

  // ==================== MÉTODOS PRIVADOS ====================

  /**
   * Obtener inscripción por ID desde Firestore
   */
  private async fetchInscriptionById(id: string): Promise<RaceInscription | undefined> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return this.convertTimestamp({ id: docSnap.id, ...docSnap.data() } as any);
    }
    return undefined;
  }

  /**
   * Subir documento (PDF) a Storage
   */
  private async uploadDocument(path: string, file: File): Promise<string> {
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }

  /**
   * Eliminar documento si existe
   */
  private async deleteDocumentIfExists(documentUrl?: string): Promise<void> {
    if (!documentUrl) return;

    try {
      const docRef = ref(this.storage, documentUrl);
      await deleteObject(docRef);
    } catch (e) {
      console.warn('No se pudo eliminar el documento:', e);
    }
  }

  /**
   * Convertir Timestamps de Firestore a Date
   */
  private convertTimestamp(data: any): RaceInscription {
    const converted = { ...data };

    if (data.participante?.fechaNacimiento?.toDate) {
      converted.participante.fechaNacimiento = data.participante.fechaNacimiento.toDate();
    }
    if (data.payment?.paymentDate?.toDate) {
      converted.payment.paymentDate = data.payment.paymentDate.toDate();
    }
    if (data.createdAt?.toDate) {
      converted.createdAt = data.createdAt.toDate();
    }
    if (data.updatedAt?.toDate) {
      converted.updatedAt = data.updatedAt.toDate();
    }
    if (data.confirmedAt?.toDate) {
      converted.confirmedAt = data.confirmedAt.toDate();
    }
    if (data.cancelledAt?.toDate) {
      converted.cancelledAt = data.cancelledAt.toDate();
    }

    return converted as RaceInscription;
  }

  /**
   * Convertir array de Timestamps
   */
  private convertTimestamps(data: any[]): RaceInscription[] {
    return data.map(item => this.convertTimestamp(item));
  }
}