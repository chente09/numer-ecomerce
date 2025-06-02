// 🆕 CREAR: birthday-promotion.service.ts
import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc, query, where, getDocs } from '@angular/fire/firestore';
import { UsersService } from '../../users/users.service';

@Injectable({
  providedIn: 'root'
})
export class BirthdayPromotionService {
  private firestore = inject(Firestore);

  constructor(private usersService: UsersService) {}

  async checkBirthdayPromotion(): Promise<{
    hasBirthdayPromotion: boolean;
    daysUntilBirthday: number;
    discountPercentage: number;
    validUntil?: Date;
  }> {
    try {
      const userProfile = await this.usersService.getUserProfile();
      if (!userProfile?.birthDate) {
        return { hasBirthdayPromotion: false, daysUntilBirthday: 0, discountPercentage: 0 };
      }

      const birthDate = new Date(userProfile.birthDate);
      const today = new Date();
      
      const nextBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
      if (nextBirthday < today) {
        nextBirthday.setFullYear(today.getFullYear() + 1);
      }

      const daysUntilBirthday = Math.ceil((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      const promotionWindow = 7;
      const hasBirthdayPromotion = daysUntilBirthday <= promotionWindow || 
        (daysUntilBirthday > 360 - promotionWindow);

      if (hasBirthdayPromotion) {
        const hasUsedDiscount = await this.hasUsedBirthdayDiscountThisYear(userProfile.uid);
        
        if (!hasUsedDiscount) {
          const validUntil = new Date(nextBirthday);
          validUntil.setDate(validUntil.getDate() + promotionWindow);

          return {
            hasBirthdayPromotion: true,
            daysUntilBirthday,
            discountPercentage: 15,
            validUntil
          };
        }
      }

      return { hasBirthdayPromotion: false, daysUntilBirthday, discountPercentage: 0 };
    } catch (error) {
      console.error('Error verificando promoción de cumpleaños:', error);
      return { hasBirthdayPromotion: false, daysUntilBirthday: 0, discountPercentage: 0 };
    }
  }

  private async hasUsedBirthdayDiscountThisYear(userId: string): Promise<boolean> {
    try {
      const currentYear = new Date().getFullYear();
      const discountsRef = collection(this.firestore, 'birthday_discounts_used');
      const q = query(
        discountsRef, 
        where('userId', '==', userId),
        where('year', '==', currentYear)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.size > 0;
    } catch (error) {
      console.error('Error verificando uso de descuento:', error);
      return false;
    }
  }
}