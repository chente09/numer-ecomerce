// src/app/services/admin/promotion/promotion-diagnostic.service.ts
import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, getDocs, query, where, doc, getDoc,
  writeBatch,
  deleteField
} from '@angular/fire/firestore';
import { Observable, from, forkJoin, of, firstValueFrom } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Promotion, Product, ProductVariant, AppliedPromotion } from '../../../../models/models';

// 🔍 Interfaces para el diagnóstico
export interface OrphanedPromotionData {
  // Promociones que no existen pero están referenciadas
  orphanedAppliedPromotions: {
    appliedPromotion: AppliedPromotion;
    missingPromotionId: string;
  }[];

  // Variantes con promociones que no existen
  orphanedVariantPromotions: {
    variant: ProductVariant;
    productName?: string;
    missingPromotionId: string;
  }[];

  // Productos con promociones aplicadas pero sin registro en appliedPromotions
  inconsistentProductPromotions: {
    product: Product;
    hasDiscountButNoAppliedPromotion: boolean;
  }[];

  // Promociones que existen pero no están aplicadas a nada
  unusedPromotions: Promotion[];

  // Estadísticas generales
  stats: {
    totalPromotions: number;
    totalAppliedPromotions: number;
    totalVariantsWithPromotions: number;
    totalProductsWithDiscounts: number;
    totalOrphanedRecords: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class PromotionDiagnosticService {
  private firestore = inject(Firestore);

  /**
   * 🔍 DIAGNÓSTICO COMPLETO de promociones huérfanas
   */
  diagnoseBrokenPromotions(): Observable<OrphanedPromotionData> {
    console.log('🔍 [DIAGNOSTIC] Iniciando diagnóstico completo de promociones...');

    return forkJoin({
      promotions: this.getAllPromotions(),
      appliedPromotions: this.getAllAppliedPromotions(),
      variants: this.getAllVariantsWithPromotions(),
      products: this.getAllProductsWithDiscounts()
    }).pipe(
      map(({ promotions, appliedPromotions, variants, products }) => {
        console.log('📊 [DIAGNOSTIC] Datos obtenidos:', {
          promotions: promotions.length,
          appliedPromotions: appliedPromotions.length,
          variants: variants.length,
          products: products.length
        });

        return this.analyzeBrokenData({
          promotions,
          appliedPromotions,
          variants,
          products
        });
      }),
      catchError(error => {
        console.error('❌ [DIAGNOSTIC] Error en diagnóstico:', error);
        throw error;
      })
    );
  }

  /**
   * 📋 Obtiene todas las promociones existentes
   */
  private getAllPromotions(): Observable<Promotion[]> {
    const promotionsRef = collection(this.firestore, 'promotions');

    return from(getDocs(promotionsRef)).pipe(
      map(snapshot => {
        const promotions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Promotion));

        console.log('📋 [DIAGNOSTIC] Promociones encontradas:', promotions.length);
        return promotions;
      }),
      catchError(error => {
        console.error('❌ [DIAGNOSTIC] Error obteniendo promociones:', error);
        return of([]);
      })
    );
  }

  /**
   * 🔗 Obtiene todos los registros de appliedPromotions
   */
  private getAllAppliedPromotions(): Observable<AppliedPromotion[]> {
    const appliedRef = collection(this.firestore, 'appliedPromotions');

    return from(getDocs(appliedRef)).pipe(
      map(snapshot => {
        const applied = snapshot.docs.map(doc => ({
          ...doc.data()
        } as AppliedPromotion));

        console.log('🔗 [DIAGNOSTIC] Promociones aplicadas encontradas:', applied.length);
        return applied;
      }),
      catchError(error => {
        console.error('❌ [DIAGNOSTIC] Error obteniendo promociones aplicadas:', error);
        return of([]);
      })
    );
  }

  /**
   * 🧬 Obtiene todas las variantes que tienen campos de promoción
   */
  private getAllVariantsWithPromotions(): Observable<ProductVariant[]> {
    const variantsRef = collection(this.firestore, 'productVariants');

    return from(getDocs(variantsRef)).pipe(
      map(snapshot => {
        const variants = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          } as ProductVariant))
          .filter(variant =>
            variant.promotionId ||
            variant.discountType ||
            variant.discountValue ||
            variant.discountedPrice ||
            variant.originalPrice
          );

        console.log('🧬 [DIAGNOSTIC] Variantes con promociones encontradas:', variants.length);
        return variants;
      }),
      catchError(error => {
        console.error('❌ [DIAGNOSTIC] Error obteniendo variantes:', error);
        return of([]);
      })
    );
  }

  /**
   * 📦 Obtiene todos los productos con descuentos
   */
  private getAllProductsWithDiscounts(): Observable<Product[]> {
    const productsRef = collection(this.firestore, 'products');

    return from(getDocs(productsRef)).pipe(
      map(snapshot => {
        const products = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Product))
          .filter(product =>
            (product.discountPercentage && product.discountPercentage > 0) ||
            (product.currentPrice && product.originalPrice && product.currentPrice < product.originalPrice)
          );

        console.log('📦 [DIAGNOSTIC] Productos con descuentos encontrados:', products.length);
        return products;
      }),
      catchError(error => {
        console.error('❌ [DIAGNOSTIC] Error obteniendo productos:', error);
        return of([]);
      })
    );
  }

  /**
   * 🔬 Analiza los datos para encontrar inconsistencias
   */
  private analyzeBrokenData(data: {
    promotions: Promotion[];
    appliedPromotions: AppliedPromotion[];
    variants: ProductVariant[];
    products: Product[];
  }): OrphanedPromotionData {
    console.log('🔬 [DIAGNOSTIC] Analizando inconsistencias...');

    const { promotions, appliedPromotions, variants, products } = data;
    const promotionIds = new Set(promotions.map(p => p.id));

    // 1. 🔍 Encontrar appliedPromotions huérfanas
    const orphanedAppliedPromotions = appliedPromotions
      .filter(ap => !promotionIds.has(ap.promotionId))
      .map(ap => ({
        appliedPromotion: ap,
        missingPromotionId: ap.promotionId
      }));

    console.log('🔍 [DIAGNOSTIC] Promociones aplicadas huérfanas:', orphanedAppliedPromotions.length);

    // 2. 🧬 Encontrar variantes con promociones huérfanas
    const orphanedVariantPromotions: any[] = [];

    for (const variant of variants) {
      if (variant.promotionId && !promotionIds.has(variant.promotionId)) {
        orphanedVariantPromotions.push({
          variant,
          missingPromotionId: variant.promotionId,
          productName: `Producto ID: ${variant.productId}` // Podrías obtener el nombre real
        });
      }
    }

    console.log('🧬 [DIAGNOSTIC] Variantes con promociones huérfanas:', orphanedVariantPromotions.length);

    // 3. 📦 Encontrar productos con descuentos pero sin appliedPromotions
    const appliedProductIds = new Set(
      appliedPromotions
        .filter(ap => ap.target === 'product')
        .map(ap => ap.targetId)
    );

    const inconsistentProductPromotions = products
      .filter(product => !appliedProductIds.has(product.id))
      .map(product => ({
        product,
        hasDiscountButNoAppliedPromotion: true
      }));

    console.log('📦 [DIAGNOSTIC] Productos con descuentos inconsistentes:', inconsistentProductPromotions.length);

    // 4. 📋 Encontrar promociones no utilizadas
    const usedPromotionIds = new Set([
      ...appliedPromotions.map(ap => ap.promotionId),
      ...variants.filter(v => v.promotionId).map(v => v.promotionId!)
    ]);

    const unusedPromotions = promotions.filter(p => !usedPromotionIds.has(p.id));

    console.log('📋 [DIAGNOSTIC] Promociones no utilizadas:', unusedPromotions.length);

    // 5. 📊 Calcular estadísticas
    const totalOrphanedRecords =
      orphanedAppliedPromotions.length +
      orphanedVariantPromotions.length +
      inconsistentProductPromotions.length;

    const stats = {
      totalPromotions: promotions.length,
      totalAppliedPromotions: appliedPromotions.length,
      totalVariantsWithPromotions: variants.length,
      totalProductsWithDiscounts: products.length,
      totalOrphanedRecords
    };

    // 📊 Imprimir resumen en consola
    console.group('📊 [DIAGNOSTIC SUMMARY]');
    console.log('🔍 Promociones aplicadas huérfanas:', orphanedAppliedPromotions.length);
    console.log('🧬 Variantes con promociones huérfanas:', orphanedVariantPromotions.length);
    console.log('📦 Productos con descuentos inconsistentes:', inconsistentProductPromotions.length);
    console.log('📋 Promociones no utilizadas:', unusedPromotions.length);
    console.log('🚨 Total registros problemáticos:', totalOrphanedRecords);
    console.groupEnd();

    return {
      orphanedAppliedPromotions,
      orphanedVariantPromotions,
      inconsistentProductPromotions,
      unusedPromotions,
      stats
    };
  }

  /**
   * 🧹 Preview de limpieza (NO ejecuta, solo muestra qué se haría)
   */
  previewCleanup(diagnosticData: OrphanedPromotionData): {
    actionsToTake: string[];
    estimatedDeletions: number;
    estimatedUpdates: number;
  } {
    const actions: string[] = [];
    let deletions = 0;
    let updates = 0;

    // Acciones para appliedPromotions huérfanas
    if (diagnosticData.orphanedAppliedPromotions.length > 0) {
      actions.push(`🗑️ Eliminar ${diagnosticData.orphanedAppliedPromotions.length} registros de appliedPromotions huérfanos`);
      deletions += diagnosticData.orphanedAppliedPromotions.length;
    }

    // Acciones para variantes huérfanas
    if (diagnosticData.orphanedVariantPromotions.length > 0) {
      actions.push(`🧬 Limpiar campos de promoción en ${diagnosticData.orphanedVariantPromotions.length} variantes huérfanas`);
      updates += diagnosticData.orphanedVariantPromotions.length;
    }

    // Acciones para productos inconsistentes
    if (diagnosticData.inconsistentProductPromotions.length > 0) {
      actions.push(`📦 Revisar ${diagnosticData.inconsistentProductPromotions.length} productos con descuentos inconsistentes`);
    }

    return {
      actionsToTake: actions,
      estimatedDeletions: deletions,
      estimatedUpdates: updates
    };
  }

  /**
 * 🔍 DIAGNÓSTICO ESPECÍFICO para variantes con promociones inexistentes
 */
  async diagnoseOrphanedVariants(): Promise<{
    orphanedVariants: {
      variant: ProductVariant;
      productName?: string;
      missingPromotionId: string;
    }[];
    validPromotionIds: Set<string>;
    totalOrphans: number;
  }> {
    console.log('🔍 [DIAGNOSTIC] Buscando variantes con promociones inexistentes...');

    try {
      // 1. Obtener todas las promociones válidas
      const promotions = await firstValueFrom(this.getAllPromotions());
      const validPromotionIds = new Set(promotions.map(p => p.id));

      console.log('📋 [DIAGNOSTIC] Promociones válidas encontradas:', Array.from(validPromotionIds));

      // 2. Obtener TODAS las variantes (no solo las que tienen promociones)
      const allVariantsRef = collection(this.firestore, 'productVariants');
      const allVariantsSnapshot = await getDocs(allVariantsRef);

      const allVariants = allVariantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductVariant));

      console.log('🧬 [DIAGNOSTIC] Total variantes encontradas:', allVariants.length);

      // 3. Encontrar variantes con promotionId que no existe
      const orphanedVariants: any[] = [];

      for (const variant of allVariants) {
        // Verificar si tiene promotionId y si esa promoción NO existe
        if (variant.promotionId && !validPromotionIds.has(variant.promotionId)) {
          orphanedVariants.push({
            variant,
            missingPromotionId: variant.promotionId,
            productName: `Producto ID: ${variant.productId}` // Podrías obtener el nombre real si necesitas
          });
        }
      }

      console.log('🚨 [DIAGNOSTIC] Variantes huérfanas encontradas:', orphanedVariants.length);

      orphanedVariants.forEach((orphan, index) => {
        console.log(`🧬 Variante huérfana ${index + 1}:`, {
          variantId: orphan.variant.id,
          colorSizeName: `${orphan.variant.colorName}-${orphan.variant.sizeName}`,
          missingPromotionId: orphan.missingPromotionId,
          productId: orphan.variant.productId
        });
      });

      return {
        orphanedVariants,
        validPromotionIds,
        totalOrphans: orphanedVariants.length
      };

    } catch (error) {
      console.error('❌ [DIAGNOSTIC] Error en diagnóstico de variantes huérfanas:', error);
      throw error;
    }
  }

  /**
   * 🧹 LIMPIEZA de variantes huérfanas
   */
  async cleanOrphanedVariants(orphanedVariants: any[]): Promise<{
    cleanedCount: number;
    errors: string[];
  }> {
    console.log('🧹 [CLEANUP] Iniciando limpieza de variantes huérfanas...');

    if (orphanedVariants.length === 0) {
      console.log('✅ [CLEANUP] No hay variantes huérfanas para limpiar');
      return { cleanedCount: 0, errors: [] };
    }

    const batch = writeBatch(this.firestore);
    const errors: string[] = [];
    let cleanedCount = 0;

    try {
      // Para cada variante huérfana, limpiar los campos de promoción
      for (const orphan of orphanedVariants) {
        const variantRef = doc(this.firestore, 'productVariants', orphan.variant.id);

        try {
          // Limpiar TODOS los campos relacionados con promociones
          batch.update(variantRef, {
            promotionId: deleteField(),
            discountType: deleteField(),
            discountValue: deleteField(),
            discountedPrice: deleteField(),
            originalPrice: deleteField()
          });

          console.log(`🧹 [CLEANUP] Limpiando variante: ${orphan.variant.colorName}-${orphan.variant.sizeName}`);
          cleanedCount++;

        } catch (error) {
          const errorMsg = `Error preparando limpieza de variante ${orphan.variant.id}: ${error}`;
          console.error('❌', errorMsg);
          errors.push(errorMsg);
        }
      }

      // Ejecutar todas las limpiezas en una sola transacción
      if (cleanedCount > 0) {
        await batch.commit();
        console.log(`✅ [CLEANUP] Limpieza completada: ${cleanedCount} variantes limpiadas`);
      }

      return {
        cleanedCount,
        errors
      };

    } catch (error) {
      console.error('❌ [CLEANUP] Error en limpieza batch:', error);
      errors.push(`Error en transacción batch: ${error}`);

      return {
        cleanedCount: 0,
        errors
      };
    }
  }
}