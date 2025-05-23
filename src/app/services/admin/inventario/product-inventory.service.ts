import { Injectable } from '@angular/core';
import { Firestore, doc, updateDoc, getDoc, writeBatch, increment, DocumentReference, collection, query, where, getDocs, DocumentData } from '@angular/fire/firestore';
import { Observable, from, throwError, of, forkJoin } from 'rxjs';
import { map, catchError, switchMap, tap } from 'rxjs/operators';

// Importar utilidades
import { ErrorUtil } from '../../../utils/error-util';
import { TimestampUtil } from '../../../utils/timestamp-util';
import { CacheService } from '../cache/cache.service';

// Importar modelos
import { Product, ProductVariant } from '../../../models/models';

// Interfaces para el servicio de inventario
export interface StockUpdate {
  productId: string;
  variantId: string;
  quantity: number; // Positivo para incrementar, negativo para decrementar
}

export interface SaleItem {
  variantId: string;
  quantity: number;
}

export interface StockCheckResult {
  available: boolean;
  unavailableItems: {
    variantId: string;
    requested: number;
    available: number;
  }[];
}

export interface StockTransfer {
  sourceVariantId: string;
  targetVariantId: string;
  quantity: number;
}

export interface InventorySummary {
  totalProducts: number;
  totalVariants: number;
  totalStock: number;
  lowStockCount: number;
  outOfStockCount: number;
  categories: { [category: string]: number };
}

export interface LowStockProduct {
  productId: string;
  productName: string;
  sku: string;
  variants: {
    variantId: string;
    colorName: string;
    sizeName: string;
    currentStock: number;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class ProductInventoryService {
  private productsCollection = 'products';
  private variantsCollection = 'productVariants';
  private readonly lowStockThreshold = 5;

  // Claves de caché
  private readonly variantCacheKey = 'product_variants';
  private readonly inventorySummaryCacheKey = 'inventory_summary';
  private readonly lowStockCacheKey = 'low_stock_products';

  constructor(
    private firestore: Firestore,
    private cacheService: CacheService
  ) { }

  /**
   * Verifica la disponibilidad de stock para un conjunto de variantes
   */
  checkVariantsAvailability(items: SaleItem[]): Observable<StockCheckResult> {
    if (!items || items.length === 0) {
      return of({ available: true, unavailableItems: [] });
    }

    // Obtener cada variante para verificar stock
    const variantChecks = items.map(item =>
      this.getVariantById(item.variantId).pipe(
        map(variant => {
          if (!variant) {
            return {
              variantId: item.variantId,
              requested: item.quantity,
              available: 0
            };
          }

          return {
            variantId: item.variantId,
            requested: item.quantity,
            available: variant.stock || 0
          };
        })
      )
    );

    // Combinar todos los resultados para dar una respuesta única
    return forkJoin(variantChecks).pipe(
      map(results => {
        const unavailableItems = results.filter(item =>
          item.available < item.requested
        );

        return {
          available: unavailableItems.length === 0,
          unavailableItems
        };
      }),
      catchError(error => ErrorUtil.handleError(error, 'checkVariantsAvailability'))
    );
  }

  /**
   * Registra una venta actualizando el stock y estadísticas
   */
  registerSale(productId: string, items: SaleItem[]): Observable<void> {
    // Primero verificamos la disponibilidad
    return this.checkVariantsAvailability(items).pipe(
      switchMap(result => {
        if (!result.available) {
          return throwError(() => new Error('No hay suficiente stock para completar la venta'));
        }

        return this.processSale(productId, items);
      }),
      catchError(error => ErrorUtil.handleError(error, 'registerSale'))
    );
  }

  /**
   * Procesa una venta actualizando inventario
   */
  private processSale(productId: string, items: SaleItem[]): Observable<void> {
    return from((async () => {
      const batch = writeBatch(this.firestore);
      let totalQuantity = 0;

      // Actualizar stock de cada variante
      for (const item of items) {
        const variantRef = doc(this.firestore, this.variantsCollection, item.variantId);
        batch.update(variantRef, {
          stock: increment(-item.quantity),
          lastSaleDate: new Date()
        });
        totalQuantity += item.quantity;
      }

      // Actualizar el producto
      const productRef = doc(this.firestore, this.productsCollection, productId);
      batch.update(productRef, {
        totalStock: increment(-totalQuantity),
        sales: increment(totalQuantity),
        lastSaleDate: new Date()
      });

      // Actualizar puntuación de popularidad
      const productDoc = await getDoc(productRef);
      if (productDoc.exists()) {
        const productData = productDoc.data();
        // Usar acceso seguro a propiedades con corchetes
        const views = productData && 'views' in productData ? productData['views'] || 0 : 0;
        const previousSales = productData && 'sales' in productData ? productData['sales'] || 0 : 0;
        const newSales = previousSales + totalQuantity;

        const popularityScore = (newSales * 5) + (views * 0.1);
        batch.update(productRef, { popularityScore });
      }

      await batch.commit();

      // Invalidar caché relacionado al inventario
      this.invalidateInventoryCache(undefined, productId);
    })()).pipe(
      catchError(error => ErrorUtil.handleError(error, 'processSale'))
    );
  }

  /**
   * Actualiza el stock de una variante
   */
  updateStock(update: StockUpdate): Observable<void> {
    if (!update || !update.productId || !update.variantId) {
      return throwError(() => new Error('Datos de actualización de stock incorrectos'));
    }

    return from((async () => {
      const batch = writeBatch(this.firestore);

      // Actualizar stock de la variante
      const variantRef = doc(this.firestore, this.variantsCollection, update.variantId);
      batch.update(variantRef, {
        stock: increment(update.quantity),
        lastUpdateDate: new Date()
      });

      // Actualizar stock total del producto
      const productRef = doc(this.firestore, this.productsCollection, update.productId);
      batch.update(productRef, {
        totalStock: increment(update.quantity),
        lastRestockDate: update.quantity > 0 ? new Date() : null
      });

      await batch.commit();

      // Invalidar caché relacionado al inventario
      this.invalidateInventoryCache(update.variantId, update.productId);
    })()).pipe(
      catchError(error => ErrorUtil.handleError(error, 'updateStock'))
    );
  }

  /**
   * Actualiza el stock de múltiples variantes en una sola operación
   */
  updateStockBatch(updates: StockUpdate[]): Observable<void> {
    if (!updates || updates.length === 0) {
      return of(undefined);
    }

    return from((async () => {
      const batch = writeBatch(this.firestore);

      // Agrupar las actualizaciones por producto para calcular el stock total
      const productStockChanges = new Map<string, number>();

      // Aplicar cada actualización a nivel de variante
      for (const update of updates) {
        if (!update.productId || !update.variantId) continue;

        // Actualizar variante
        const variantRef = doc(this.firestore, this.variantsCollection, update.variantId);
        batch.update(variantRef, {
          stock: increment(update.quantity),
          lastUpdateDate: new Date()
        });

        // Acumular cambio para el producto
        const currentChange = productStockChanges.get(update.productId) || 0;
        productStockChanges.set(update.productId, currentChange + update.quantity);
      }

      // Actualizar los productos con el cambio acumulado
      for (const [productId, stockChange] of productStockChanges.entries()) {
        const productRef = doc(this.firestore, this.productsCollection, productId);
        const updates: any = { totalStock: increment(stockChange) };

        // Si es un reabastecimiento (stockChange > 0), actualizar la fecha
        if (stockChange > 0) {
          updates.lastRestockDate = new Date();
        }

        batch.update(productRef, updates);
      }

      await batch.commit();

      // Invalidar el caché
      updates.forEach(update => {
        this.invalidateInventoryCache(update.variantId, update.productId);
      });
    })()).pipe(
      catchError(error => ErrorUtil.handleError(error, 'updateStockBatch'))
    );
  }

  /**
   * Transfiere stock entre variantes 
   * (útil para corregir errores o mover inventario)
   */
  transferStock(transfer: StockTransfer): Observable<void> {
    if (!transfer || !transfer.sourceVariantId || !transfer.targetVariantId || transfer.quantity <= 0) {
      return throwError(() => new Error('Datos de transferencia incorrectos'));
    }

    // Obtener información de ambas variantes
    return forkJoin({
      source: this.getVariantById(transfer.sourceVariantId),
      target: this.getVariantById(transfer.targetVariantId)
    }).pipe(
      switchMap(({ source, target }) => {
        // Verificar que ambas variantes existen
        if (!source) {
          return throwError(() => new Error(`La variante de origen ${transfer.sourceVariantId} no existe`));
        }
        if (!target) {
          return throwError(() => new Error(`La variante de destino ${transfer.targetVariantId} no existe`));
        }

        // Verificar stock suficiente
        if ((source.stock || 0) < transfer.quantity) {
          return throwError(() => new Error(`Stock insuficiente en la variante de origen (disponible: ${source.stock})`));
        }

        return from((async () => {
          const batch = writeBatch(this.firestore);

          // Decrementar stock en variante origen
          const sourceRef = doc(this.firestore, this.variantsCollection, transfer.sourceVariantId);
          batch.update(sourceRef, {
            stock: increment(-transfer.quantity),
            lastUpdateDate: new Date()
          });

          // Incrementar stock en variante destino
          const targetRef = doc(this.firestore, this.variantsCollection, transfer.targetVariantId);
          batch.update(targetRef, {
            stock: increment(transfer.quantity),
            lastUpdateDate: new Date()
          });

          // Si las variantes pertenecen a diferentes productos, actualizar totales
          if (source.productId !== target.productId) {
            // Decrementar en producto origen
            const sourceProductRef = doc(this.firestore, this.productsCollection, source.productId);
            batch.update(sourceProductRef, { totalStock: increment(-transfer.quantity) });

            // Incrementar en producto destino
            const targetProductRef = doc(this.firestore, this.productsCollection, target.productId);
            batch.update(targetProductRef, { totalStock: increment(transfer.quantity) });
          }

          await batch.commit();

          // Invalidar caché
          this.invalidateInventoryCache(transfer.sourceVariantId, source?.productId);
          this.invalidateInventoryCache(transfer.targetVariantId, target?.productId);
        })());
      }),
      catchError(error => ErrorUtil.handleError(error, 'transferStock'))
    );
  }

  /**
   * Obtiene una variante por su ID
   */
  getVariantById(variantId: string): Observable<ProductVariant | undefined> {
    if (!variantId) {
      return of(undefined);
    }

    const cacheKey = `${this.variantCacheKey}_${variantId}`;
    return this.cacheService.getCached<ProductVariant | undefined>(cacheKey, () => {
      return from((async () => {
        const variantRef = doc(this.firestore, this.variantsCollection, variantId);
        const variantSnap = await getDoc(variantRef);

        if (variantSnap.exists()) {
          const data = variantSnap.data();
          return {
            id: variantSnap.id,
            ...data
          } as ProductVariant;
        }

        return undefined;
      })()).pipe(
        catchError(error => ErrorUtil.handleError(error, `getVariantById(${variantId})`))
      );
    });
  }

  /**
   * Elimina una variante específica
   */
  deleteVariant(variantId: string): Observable<void> {
    return this.getVariantById(variantId).pipe(
      switchMap(variant => {
        if (!variant) {
          return throwError(() => new Error('Variante no encontrada'));
        }

        return from((async () => {
          const batch = writeBatch(this.firestore);

          // Eliminar variante
          const variantRef = doc(this.firestore, this.variantsCollection, variantId);
          batch.delete(variantRef);

          // Actualizar stock del producto si es necesario
          if (variant.productId && (variant.stock || 0) > 0) {
            const productRef = doc(this.firestore, this.productsCollection, variant.productId);
            batch.update(productRef, {
              totalStock: increment(-(variant.stock || 0)),
              updatedAt: new Date()
            });
          }

          await batch.commit();

          // Invalidar caché
          this.invalidateInventoryCache(variantId, variant.productId);
        })());
      }),
      catchError(error => ErrorUtil.handleError(error, 'deleteVariant'))
    );
  }

  /**
   * Obtiene productos con bajo stock
   */
  getLowStockProducts(threshold: number = this.lowStockThreshold): Observable<LowStockProduct[]> {
    const cacheKey = `${this.lowStockCacheKey}_${threshold}`;

    return this.cacheService.getCached<LowStockProduct[]>(cacheKey, () => {
      return from((async () => {
        try {
          const productsMap = new Map<string, LowStockProduct>();

          // Obtener todas las variantes con stock bajo
          const variantsRef = collection(this.firestore, this.variantsCollection);
          const q = query(
            variantsRef,
            where('stock', '<=', threshold),
            where('stock', '>', 0)
          );

          const variantsSnap = await getDocs(q);
          const variants = variantsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as ProductVariant));

          if (variants.length === 0) {
            return [];
          }

          // Agrupar las variantes por producto
          for (const variant of variants) {
            if (!variant.productId) continue;

            const productId = variant.productId;

            if (!productsMap.has(productId)) {
              // Obtener datos básicos del producto
              const productRef = doc(this.firestore, this.productsCollection, productId);
              const productSnap = await getDoc(productRef);

              if (productSnap.exists()) {
                const productData = productSnap.data();

                // Corregir acceso a propiedades usando notación de corchetes
                const productName = productData && 'name' in productData ? String(productData['name']) : 'Producto sin nombre';
                const productSku = productData && 'sku' in productData ? String(productData['sku']) : '';

                productsMap.set(productId, {
                  productId,
                  productName,
                  sku: productSku,
                  variants: []
                });
              } else {
                // Si no existe el producto, omitir esta variante
                continue;
              }
            }

            // Agregar la variante a su producto
            const productEntry = productsMap.get(productId);
            if (productEntry) {
              productEntry.variants.push({
                variantId: variant.id,
                colorName: variant.colorName || '',
                sizeName: variant.sizeName || '',
                currentStock: variant.stock || 0
              });
            }
          }

          // Convertir el mapa a un array
          return Array.from(productsMap.values());
        } catch (error) {
          throw error;
        }
      })()).pipe(
        catchError(error => ErrorUtil.handleError(error, 'getLowStockProducts'))
      );
    });
  }

  /**
   * Obtiene un informe general del inventario
   */
  getInventorySummary(): Observable<InventorySummary> {
    return this.cacheService.getCached<InventorySummary>(this.inventorySummaryCacheKey, () => {
      return from((async () => {
        try {
          // 1. Obtener todas las variantes
          const variantsRef = collection(this.firestore, this.variantsCollection);
          const variantsSnap = await getDocs(variantsRef);
          const variants = variantsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as ProductVariant));

          // 2. Obtener datos de todos los productos relacionados
          const productIds = new Set<string>();
          variants.forEach(variant => {
            if (variant.productId) {
              productIds.add(variant.productId);
            }
          });

          const productsData: DocumentData[] = [];
          for (const productId of productIds) {
            const productRef = doc(this.firestore, this.productsCollection, productId);
            const productSnap = await getDoc(productRef);
            if (productSnap.exists()) {
              productsData.push({
                id: productSnap.id,
                ...productSnap.data()
              });
            }
          }

          // 3. Calcular métricas
          let totalStock = 0;
          let lowStockCount = 0;
          let outOfStockCount = 0;
          const categories: { [category: string]: number } = {};

          // Procesar variantes
          variants.forEach(variant => {
            const stock = variant.stock || 0;
            totalStock += stock;

            if (stock === 0) {
              outOfStockCount++;
            } else if (stock <= this.lowStockThreshold) {
              lowStockCount++;
            }
          });

          // Contar por categoría - Usar TimestampUtil para fechas
          productsData.forEach(product => {
            // Usar corchetes para acceder a propiedades
            const category = product && 'category' in product ? String(product['category']) : 'Sin categoría';

            // Usar TimestampUtil en caso de tener fechas
            if (product && 'createdAt' in product) {
              // Ejemplo de uso de TimestampUtil
              const createdDate = TimestampUtil.toDate(product['createdAt']);
              // Podríamos hacer algo con esta fecha si fuera necesario
            }

            categories[category] = (categories[category] || 0) + 1;
          });

          // 4. Retornar resumen
          return {
            totalProducts: productsData.length,
            totalVariants: variants.length,
            totalStock,
            lowStockCount,
            outOfStockCount,
            categories
          };
        } catch (error) {
          throw error;
        }
      })()).pipe(
        catchError(error => ErrorUtil.handleError(error, 'getInventorySummary'))
      );
    });
  }

  /**
   * Obtiene variantes sin stock
   */
  getOutOfStockVariants(): Observable<ProductVariant[]> {
    const cacheKey = `${this.variantCacheKey}_out_of_stock`;

    return this.cacheService.getCached<ProductVariant[]>(cacheKey, () => {
      return from((async () => {
        const variantsRef = collection(this.firestore, this.variantsCollection);
        const q = query(variantsRef, where('stock', '==', 0));

        const variantsSnap = await getDocs(q);
        return variantsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ProductVariant));
      })()).pipe(
        catchError(error => ErrorUtil.handleError(error, 'getOutOfStockVariants'))
      );
    });
  }

  /**
   * Obtiene variantes con stock bajo
   */
  getLowStockVariants(threshold: number = this.lowStockThreshold): Observable<ProductVariant[]> {
    const cacheKey = `${this.variantCacheKey}_low_stock_${threshold}`;

    return this.cacheService.getCached<ProductVariant[]>(cacheKey, () => {
      return from((async () => {
        const variantsRef = collection(this.firestore, this.variantsCollection);
        const q = query(
          variantsRef,
          where('stock', '<=', threshold),
          where('stock', '>', 0)
        );

        const variantsSnap = await getDocs(q);
        return variantsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ProductVariant));
      })()).pipe(
        catchError(error => ErrorUtil.handleError(error, 'getLowStockVariants'))
      );
    });
  }

  /**
   * Obtiene todas las variantes de un producto
   */
  getVariantsByProductId(productId: string): Observable<ProductVariant[]> {
    if (!productId) {
      return of([]);
    }

    const cacheKey = `${this.variantCacheKey}_product_${productId}`;

    return this.cacheService.getCached<ProductVariant[]>(cacheKey, () => {
      return from((async () => {
        const variantsRef = collection(this.firestore, this.variantsCollection);
        const q = query(variantsRef, where('productId', '==', productId));

        const variantsSnap = await getDocs(q);
        return variantsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ProductVariant));
      })()).pipe(
        catchError(error => ErrorUtil.handleError(error, `getVariantsByProductId(${productId})`))
      );
    });
  }

  /**
   * Incrementa el contador de vistas de un producto
   */
  incrementProductViews(productId: string): Observable<void> {
    if (!productId) {
      return throwError(() => new Error('ID de producto no válido'));
    }

    return from((async () => {
      const productRef = doc(this.firestore, this.productsCollection, productId);
      await updateDoc(productRef, {
        views: increment(1),
        lastViewDate: new Date()
      });
    })()).pipe(
      catchError(error => ErrorUtil.handleError(error, `incrementProductViews(${productId})`))
    );
  }

  /**
 * Invalida los cachés relacionados con el inventario de forma específica
 * @param variantId ID de la variante para invalidación específica (opcional)
 * @param productId ID del producto para invalidación específica (opcional)
 */
  private invalidateInventoryCache(variantId?: string, productId?: string): void {
    // Siempre invalidar cachés principales
    this.cacheService.invalidate(this.inventorySummaryCacheKey);
    this.cacheService.invalidate(this.lowStockCacheKey);

    // Si tenemos información específica, invalidar esas claves
    if (variantId) {
      this.cacheService.invalidate(`${this.variantCacheKey}_${variantId}`);
    }

    if (productId) {
      this.cacheService.invalidate(`${this.variantCacheKey}_product_${productId}`);

      // También podríamos invalidar listas relacionadas
      this.cacheService.invalidate(`${this.variantCacheKey}_out_of_stock`);
      this.cacheService.invalidate(`${this.variantCacheKey}_low_stock_${this.lowStockThreshold}`);
    }
  }
}