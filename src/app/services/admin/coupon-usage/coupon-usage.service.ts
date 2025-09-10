import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  serverTimestamp,
  runTransaction,
  increment,
  deleteDoc
} from '@angular/fire/firestore';
import { Observable, from, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { CouponUsage } from '../../../models/models';

@Injectable({
  providedIn: 'root'
})
export class CouponUsageService {
  private firestore = inject(Firestore);
  private collectionName = 'couponUsage';

  constructor() {}

  /**
   * Verifica si un usuario puede usar un cupón específico
   * @param userId ID del usuario
   * @param promotionId ID de la promoción/cupón
   * @param promotion Datos completos del cupón para validar límites
   */
  async canUserUseCoupon(
    userId: string, 
    promotionId: string, 
    promotion: any
  ): Promise<{
    canUse: boolean;
    reason?: string;
    currentUsage?: {
      globalUsage: number;
      userUsage: number;
    }
  }> {
    try {
      // 1. Obtener uso global del cupón
      const globalUsage = await this.getGlobalCouponUsage(promotionId);
      
      // 2. Validar límite global
      if (promotion.usageLimits?.global && globalUsage >= promotion.usageLimits.global) {
        return {
          canUse: false,
          reason: `Este cupón ha alcanzado su límite máximo de ${promotion.usageLimits.global} usos.`,
          currentUsage: { globalUsage, userUsage: 0 }
        };
      }

      // 3. Obtener uso del usuario específico
      const userUsage = await this.getUserCouponUsage(userId, promotionId);
      
      // 4. Validar límite por usuario
      if (promotion.usageLimits?.perUser && userUsage >= promotion.usageLimits.perUser) {
        return {
          canUse: false,
          reason: `Ya has usado este cupón el máximo de ${promotion.usageLimits.perUser} ${promotion.usageLimits.perUser === 1 ? 'vez' : 'veces'} permitidas.`,
          currentUsage: { globalUsage, userUsage }
        };
      }

      // 5. El usuario puede usar el cupón
      return {
        canUse: true,
        currentUsage: { globalUsage, userUsage }
      };

    } catch (error) {
      console.error('❌ Error verificando uso de cupón:', error);
      return {
        canUse: false,
        reason: 'Error al verificar la disponibilidad del cupón. Intenta nuevamente.'
      };
    }
  }

  /**
   * Registra el uso de un cupón por un usuario
   * @param userId ID del usuario
   * @param promotionId ID de la promoción
   * @param couponCode Código del cupón
   * @param orderId ID del pedido donde se usó
   */
  async recordCouponUsage(
    userId: string,
    promotionId: string,
    couponCode: string,
    orderId: string
  ): Promise<void> {
    const docId = `${userId}_${promotionId}`;
    const usageRef = doc(this.firestore, this.collectionName, docId);

    try {
      // Usar transacción para evitar condiciones de carrera
      await runTransaction(this.firestore, async (transaction) => {
        const usageDoc = await transaction.get(usageRef);

        if (usageDoc.exists()) {
          // Actualizar registro existente
          const currentData = usageDoc.data() as CouponUsage;
          const updatedOrderIds = [...(currentData.orderIds || []), orderId];
          
          transaction.update(usageRef, {
            usageCount: increment(1),
            lastUsedAt: serverTimestamp(),
            orderIds: updatedOrderIds,
            updatedAt: serverTimestamp()
          });
        } else {
          // Crear nuevo registro
          const newUsage: Omit<CouponUsage, 'id'> = {
            userId,
            couponCode,
            promotionId,
            usageCount: 1,
            lastUsedAt: new Date(),
            orderIds: [orderId],
            createdAt: new Date(),
            updatedAt: new Date()
          };

          transaction.set(usageRef, {
            ...newUsage,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastUsedAt: serverTimestamp()
          });
        }
      });

      console.log(`✅ Uso de cupón registrado: ${couponCode} por usuario ${userId}`);
      
    } catch (error) {
      console.error('❌ Error registrando uso de cupón:', error);
      throw new Error('No se pudo registrar el uso del cupón');
    }
  }

  /**
   * Obtiene el número total de veces que un cupón ha sido usado globalmente
   */
  private async getGlobalCouponUsage(promotionId: string): Promise<number> {
    try {
      const q = query(
        collection(this.firestore, this.collectionName),
        where('promotionId', '==', promotionId)
      );
      
      const snapshot = await getDocs(q);
      let totalUsage = 0;
      
      snapshot.docs.forEach(doc => {
        const data = doc.data() as CouponUsage;
        totalUsage += data.usageCount || 0;
      });
      
      return totalUsage;
    } catch (error) {
      console.error('❌ Error obteniendo uso global del cupón:', error);
      return 0;
    }
  }

  /**
   * Obtiene cuántas veces un usuario específico ha usado un cupón
   */
  private async getUserCouponUsage(userId: string, promotionId: string): Promise<number> {
    try {
      const docId = `${userId}_${promotionId}`;
      const usageRef = doc(this.firestore, this.collectionName, docId);
      const usageDoc = await getDoc(usageRef);
      
      if (usageDoc.exists()) {
        const data = usageDoc.data() as CouponUsage;
        return data.usageCount || 0;
      }
      
      return 0;
    } catch (error) {
      console.error('❌ Error obteniendo uso del cupón por usuario:', error);
      return 0;
    }
  }

  /**
   * Obtiene el historial de uso de cupones de un usuario
   */
  getUserCouponHistory(userId: string): Observable<CouponUsage[]> {
    const q = query(
      collection(this.firestore, this.collectionName),
      where('userId', '==', userId),
      orderBy('lastUsedAt', 'desc')
    );

    return from(getDocs(q)).pipe(
      map(snapshot => 
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as CouponUsage))
      ),
      catchError(error => {
        console.error('❌ Error obteniendo historial de cupones:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtiene estadísticas de uso de un cupón específico
   */
  getCouponStatistics(promotionId: string): Observable<{
    totalUses: number;
    uniqueUsers: number;
    recentUses: CouponUsage[];
    topUsers: { userId: string; usageCount: number }[];
  }> {
    const q = query(
      collection(this.firestore, this.collectionName),
      where('promotionId', '==', promotionId),
      orderBy('lastUsedAt', 'desc'),
      limit(50)
    );

    return from(getDocs(q)).pipe(
      map(snapshot => {
        const usages = snapshot.docs.map(doc => doc.data() as CouponUsage);
        
        let totalUses = 0;
        const userUsageMap = new Map<string, number>();
        
        usages.forEach(usage => {
          totalUses += usage.usageCount || 0;
          userUsageMap.set(usage.userId, (userUsageMap.get(usage.userId) || 0) + usage.usageCount);
        });

        const topUsers = Array.from(userUsageMap.entries())
          .map(([userId, count]) => ({ userId, usageCount: count }))
          .sort((a, b) => b.usageCount - a.usageCount)
          .slice(0, 10);

        return {
          totalUses,
          uniqueUsers: userUsageMap.size,
          recentUses: usages.slice(0, 20),
          topUsers
        };
      }),
      catchError(error => {
        console.error('❌ Error obteniendo estadísticas del cupón:', error);
        return of({
          totalUses: 0,
          uniqueUsers: 0,
          recentUses: [],
          topUsers: []
        });
      })
    );
  }

  /**
   * Elimina todos los registros de uso de un cupón (cuando se elimina la promoción)
   */
  async cleanupCouponUsage(promotionId: string): Promise<void> {
    try {
      const q = query(
        collection(this.firestore, this.collectionName),
        where('promotionId', '==', promotionId)
      );
      
      const snapshot = await getDocs(q);
      // Eliminar en lotes para evitar problemas de rendimiento
      const batch = [];
      for (const docSnap of snapshot.docs) {
        batch.push(deleteDoc(docSnap.ref));
      }
      
      await Promise.all(batch);
      console.log(`✅ Limpieza completada: ${batch.length} registros de uso eliminados para promoción ${promotionId}`);
      console.log(`✅ Limpieza completada: ${batch.length} registros de uso eliminados para promoción ${promotionId}`);
      
    } catch (error) {
      console.error('❌ Error limpiando registros de uso del cupón:', error);
      throw error;
    }
  }

  /**
   * Valida si un cupón puede ser usado en el contexto actual
   * (método de conveniencia que combina varias validaciones)
   */
  async validateCouponForCheckout(
    userId: string,
    promotion: any,
    cartTotal: number
  ): Promise<{
    isValid: boolean;
    errorMessage?: string;
    usageInfo?: any;
  }> {
    try {
      // 1. Validar que el cupón esté activo y en fechas válidas
      if (!promotion.isActive) {
        return {
          isValid: false,
          errorMessage: 'Este cupón no está activo.'
        };
      }

      const now = new Date();
      const startDate = new Date(promotion.startDate);
      const endDate = new Date(promotion.endDate);

      if (now < startDate) {
        return {
          isValid: false,
          errorMessage: 'Este cupón aún no está disponible.'
        };
      }

      if (now > endDate) {
        return {
          isValid: false,
          errorMessage: 'Este cupón ha expirado.'
        };
      }

      // 2. Validar monto mínimo de compra
      if (promotion.minPurchaseAmount && cartTotal < promotion.minPurchaseAmount) {
        return {
          isValid: false,
          errorMessage: `Este cupón requiere una compra mínima de $${promotion.minPurchaseAmount.toFixed(2)}.`
        };
      }

      // 3. Validar límites de uso
      const usageValidation = await this.canUserUseCoupon(userId, promotion.id, promotion);
      
      if (!usageValidation.canUse) {
        return {
          isValid: false,
          errorMessage: usageValidation.reason,
          usageInfo: usageValidation.currentUsage
        };
      }

      // 4. Todo válido
      return {
        isValid: true,
        usageInfo: usageValidation.currentUsage
      };

    } catch (error) {
      console.error('❌ Error validando cupón para checkout:', error);
      return {
        isValid: false,
        errorMessage: 'Error al validar el cupón. Intenta nuevamente.'
      };
    }
  }
}