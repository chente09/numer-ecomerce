import { Injectable, inject } from '@angular/core';
import { 
  Firestore, collection, doc, setDoc, deleteDoc, 
  query, where, getDocs, Timestamp 
} from '@angular/fire/firestore';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AppliedPromotion } from '../../../models/models';

@Injectable({
  providedIn: 'root'
})
export class AppliedPromotionsService {
  private firestore = inject(Firestore);
  private collectionName = 'appliedPromotions';

  /**
   * Aplica una promoción a un producto o variante
   */
  applyPromotion(
    promotionId: string,
    target: 'product' | 'variant',
    targetId: string,
    expiresAt: Date,
    appliedBy: string
  ): Observable<void> {
    const docId = `${targetId}_${promotionId}`;
    const docRef = doc(this.firestore, this.collectionName, docId);
    
    const appliedPromotion: AppliedPromotion = {
      promotionId,
      appliedAt: new Date(),
      appliedBy,
      target,
      targetId,
      expiresAt
    };

    return from(setDoc(docRef, appliedPromotion));
  }

  /**
   * Remueve una promoción aplicada
   */
  removePromotion(promotionId: string, targetId: string): Observable<void> {
    const docId = `${targetId}_${promotionId}`;
    const docRef = doc(this.firestore, this.collectionName, docId);
    return from(deleteDoc(docRef));
  }

  /**
   * Obtiene todas las promociones aplicadas a un target
   */
  getAppliedPromotions(targetId: string): Observable<AppliedPromotion[]> {
    const q = query(
      collection(this.firestore, this.collectionName),
      where('targetId', '==', targetId)
    );

    return from(getDocs(q)).pipe(
      map(snapshot => 
        snapshot.docs.map(doc => doc.data() as AppliedPromotion)
      ),
      catchError(() => of([]))
    );
  }

  /**
   * Verifica y elimina promociones expiradas
   */
  async cleanExpiredPromotions(): Promise<void> {
    const now = Timestamp.now();
    const q = query(
      collection(this.firestore, this.collectionName),
      where('expiresAt', '<=', now)
    );

    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
  }
}