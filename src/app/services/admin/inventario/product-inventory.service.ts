import { Injectable } from '@angular/core';
import { Firestore, doc, updateDoc, getDoc, writeBatch, increment } from '@angular/fire/firestore';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';

// Importar según tu estructura de proyecto
import { ProductVariantService } from '../productVariante/product-variant.service';
import { Product, ProductVariant } from '../../../models/models'; // Asegúrate de que tienes estas interfaces definidas

interface StockUpdate {
  productId: string;
  variantId: string;
  quantity: number;
}

interface SaleItem {
  variantId: string;
  quantity: number;
}

interface StockCheckResult {
  available: boolean;
  unavailableItems: {
    variantId: string;
    requested: number;
    available: number;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class ProductInventoryService {
  private productsCollection = 'products';

  constructor(
    private firestore: Firestore,
    private variantService: ProductVariantService
  ) { }

  /**
   * Verifica la disponibilidad de stock para un conjunto de variantes
   */
  checkVariantsAvailability(items: SaleItem[]): Observable<StockCheckResult> {
    if (!items || items.length === 0) {
      return from(Promise.resolve({ available: true, unavailableItems: [] }));
    }

    const checks = items.map(item =>
      this.variantService.getVariantById(item.variantId).then(variant => {
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
    );

    return from(Promise.all(checks)).pipe(
      map(results => {
        const unavailableItems = results.filter(item =>
          item.available < item.requested
        );

        return {
          available: unavailableItems.length === 0,
          unavailableItems
        };
      }),
      catchError(error => {
        console.error('Error al verificar disponibilidad:', error);
        return throwError(() => new Error(`Error al verificar disponibilidad: ${error.message}`));
      })
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

        return from(this.processSale(productId, items));
      }),
      catchError(error => {
        console.error('Error al registrar venta:', error);
        return throwError(() => new Error(`Error al registrar venta: ${error.message}`));
      })
    );
  }

  /**
   * Procesa una venta actualizando inventario
   */
  private async processSale(productId: string, items: SaleItem[]): Promise<void> {
    await this.variantService.registerSale(productId, items);
  }

  /**
   * Actualiza el stock de una variante
   */
  updateStock(update: StockUpdate): Observable<void> {
    return from(
      Promise.all([
        // Actualizar stock de la variante
        this.variantService.updateStockQuantity(update.variantId, update.quantity),

        // Actualizar stock total y fecha de reabastecimiento del producto
        this.updateProductStock(update.productId, update.quantity)
      ])
    ).pipe(
      map(() => undefined),
      catchError(error => {
        console.error('Error al actualizar stock:', error);
        return throwError(() => new Error(`Error al actualizar stock: ${error.message}`));
      })
    );
  }

  /**
   * Actualiza el stock total de un producto
   */
  private async updateProductStock(productId: string, quantity: number): Promise<void> {
    const productRef = doc(this.firestore, this.productsCollection, productId);
    await updateDoc(productRef, {
      totalStock: increment(quantity),
      lastRestockDate: new Date()
    });
  }

  /**
   * Obtiene productos con bajo stock
   */
  getLowStockProducts(threshold: number = 5): Observable<{
    productId: string;
    productName: string;
    sku: string;
    variants: {
      variantId: string;
      colorName: string;
      sizeName: string;
      currentStock: number;
    }[]
  }[]> {
    return new Observable(observer => {
      // Obtener todas las variantes con stock bajo
      (async () => {
        try {
          const productsMap = new Map<string, {
            productId: string;
            productName: string;
            sku: string;
            variants: {
              variantId: string;
              colorName: string;
              sizeName: string;
              currentStock: number;
            }[]
          }>();

          // Obtenemos todas las variantes con stock bajo
          const variants = await this.variantService.getLowStockVariants(threshold);

          if (!variants || variants.length === 0) {
            observer.next([]);
            observer.complete();
            return;
          }

          // Agrupamos las variantes por productId
          for (const variant of variants) {
            // Verificar que variant y productId existen
            if (!variant || !variant.productId) continue;

            const productId = variant.productId;

            if (!productsMap.has(productId)) {
              // Si es la primera variante de este producto, obtenemos detalles del producto
              const productRef = doc(this.firestore, this.productsCollection, productId);
              const productSnap = await getDoc(productRef);

              if (productSnap.exists()) {
                const productData = productSnap.data();
                productsMap.set(productId, {
                  productId,
                  productName: productData && typeof productData === 'object' && 'name' in productData ?
                    String(productData['name']) : 'Producto sin nombre',
                  sku: productData && typeof productData === 'object' && 'sku' in productData ?
                    String(productData['sku']) : '',
                  variants: []
                });
              }
            }

            // Agregamos la variante a su producto correspondiente
            const productEntry = productsMap.get(productId);
            if (productEntry) {
              // Verificar que los campos de la variante existen
              productEntry.variants.push({
                variantId: variant.id || '',
                colorName: variant.colorName || '',
                sizeName: variant.sizeName || '',
                currentStock: typeof variant.stock === 'number' ? variant.stock : 0
              });
            }
          }

          // Convertimos el mapa a array para devolver el resultado
          const result = Array.from(productsMap.values());
          observer.next(result);
          observer.complete();
        } catch (error: unknown) {
          // Manejo seguro del error desconocido
          let errorMessage = 'Error desconocido';

          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === 'string') {
            errorMessage = error;
          } else if (error !== null && error !== undefined) {
            try {
              errorMessage = JSON.stringify(error);
            } catch {
              errorMessage = String(error);
            }
          }

          console.error('Error al obtener productos con bajo stock:', errorMessage);
          observer.error(new Error(`Error al obtener productos con bajo stock: ${errorMessage}`));
        }
      })();
    });
  }

  /**
   * Obtiene un informe de inventario (resumen del stock)
   */
  getInventoryReport(): Observable<{
    totalProducts: number;
    totalVariants: number;
    totalStock: number;
    lowStockCount: number;
    outOfStockCount: number;
    categories: { [category: string]: number };
  }> {
    return new Observable(observer => {
      (async () => {
        try {
          // Obtener todas las variantes
          const variants = await this.variantService.getAllVariants();

          // Mapear variantes por productId
          const productVariantsMap = new Map<string, ProductVariant[]>();
          const productIdSet = new Set<string>();

          for (const variant of variants) {
            if (variant && variant.productId) {
              productIdSet.add(variant.productId);

              if (!productVariantsMap.has(variant.productId)) {
                productVariantsMap.set(variant.productId, []);
              }

              const variantArray = productVariantsMap.get(variant.productId);
              if (variantArray) {
                variantArray.push(variant);
              }
            }
          }

          // Obtener detalles de productos
          const productsPromises = Array.from(productIdSet).map(async (productId: string) => {
            const productRef = doc(this.firestore, this.productsCollection, productId);
            const productSnap = await getDoc(productRef);

            if (productSnap.exists()) {
              const productData = productSnap.data() as Partial<Product>;
              return {
                id: productId,
                category: productData.category || 'Sin categoría',
                variants: productVariantsMap.get(productId) || []
              };
            }
            return null;
          });

          const products = (await Promise.all(productsPromises)).filter(Boolean);

          // Calcular estadísticas
          const categories: { [category: string]: number } = {};
          let totalStock = 0;
          let lowStockCount = 0;
          let outOfStockCount = 0;

          for (const product of products) {
            // Asegurarse de que product no es null (TypeScript safety)
            if (!product) continue;

            // Contar por categoría con comprobación segura
            const category = product.category || 'Sin categoría';
            categories[category] = (categories[category] || 0) + 1;

            // Verificar que product.variants existe y es un array
            const variants = Array.isArray(product.variants) ? product.variants : [];

            // Calcular stock por variante
            for (const variant of variants) {
              const stock = typeof variant.stock === 'number' ? variant.stock : 0;
              totalStock += stock;

              if (stock === 0) {
                outOfStockCount++;
              } else if (stock <= 5) {
                lowStockCount++;
              }
            }
          }

          observer.next({
            totalProducts: products.length,
            totalVariants: variants.length,
            totalStock,
            lowStockCount,
            outOfStockCount,
            categories
          });
          observer.complete();
        } catch (error: unknown) {
          // Manejo seguro del error desconocido
          let errorMessage = 'Error desconocido';

          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === 'string') {
            errorMessage = error;
          } else if (error !== null && error !== undefined) {
            try {
              errorMessage = JSON.stringify(error);
            } catch {
              errorMessage = String(error);
            }
          }

          console.error('Error al generar informe de inventario:', errorMessage);
          observer.error(new Error(`Error al generar informe de inventario: ${errorMessage}`));
        }
      })();
    });
  }

  /**
   * Actualiza el stock de múltiples variantes en una sola operación
   */
  updateStockBatch(updates: { variantId: string; quantity: number }[]): Observable<void> {
    if (!updates || updates.length === 0) {
      return from(Promise.resolve());
    }

    return from(
      (async () => {
        const batch = writeBatch(this.firestore);
        const variantUpdates = new Map<string, number>();

        // Agrupar actualizaciones por variante
        for (const update of updates) {
          variantUpdates.set(update.variantId, update.quantity);
        }

        // Obtener información de las variantes para actualizar también los productos
        const variantDocs = await Promise.all(
          Array.from(variantUpdates.keys()).map(variantId =>
            this.variantService.getVariantById(variantId)
          )
        );

        // Agrupar por producto para actualizar stock total
        const productStockUpdates = new Map<string, number>();

        for (const variant of variantDocs) {
          if (!variant || !variant.productId) continue;

          const quantity = variantUpdates.get(variant.id) || 0;

          // Actualizar cada variante
          const variantRef = doc(this.firestore, 'productVariants', variant.id);
          batch.update(variantRef, { stock: increment(quantity) });

          // Sumar al total del producto
          if (!productStockUpdates.has(variant.productId)) {
            productStockUpdates.set(variant.productId, 0);
          }

          const currentValue = productStockUpdates.get(variant.productId) || 0;
          productStockUpdates.set(variant.productId, currentValue + quantity);
        }

        // Actualizar stock total de cada producto
        for (const [productId, stockChange] of productStockUpdates.entries()) {
          const productRef = doc(this.firestore, this.productsCollection, productId);
          batch.update(productRef, {
            totalStock: increment(stockChange),
            lastRestockDate: new Date()
          });
        }

        await batch.commit();
      })()
    ).pipe(
      map(() => undefined),
      catchError(error => {
        console.error('Error al actualizar stock en lote:', error);
        return throwError(() => new Error(`Error al actualizar stock: ${error.message}`));
      })
    );
  }

  /**
   * Transfiere stock entre variantes (útil para corregir errores)
   */
  transferStock(
    sourceVariantId: string,
    targetVariantId: string,
    quantity: number
  ): Observable<void> {
    if (quantity <= 0) {
      return throwError(() => new Error('La cantidad a transferir debe ser mayor a cero'));
    }

    return from(
      (async () => {
        // Obtener variantes de origen y destino
        const [sourceVariant, targetVariant] = await Promise.all([
          this.variantService.getVariantById(sourceVariantId),
          this.variantService.getVariantById(targetVariantId)
        ]);

        if (!sourceVariant) {
          throw new Error(`La variante de origen ${sourceVariantId} no existe`);
        }

        if (!targetVariant) {
          throw new Error(`La variante de destino ${targetVariantId} no existe`);
        }

        // Verificar stock suficiente
        if ((sourceVariant.stock || 0) < quantity) {
          throw new Error(`Stock insuficiente en la variante de origen (disponible: ${sourceVariant.stock})`);
        }

        // Si las variantes pertenecen al mismo producto, no hay cambio en el stock total
        const isSameProduct = sourceVariant.productId === targetVariant.productId;

        const batch = writeBatch(this.firestore);

        // Actualizar variante de origen (decrementar)
        const sourceRef = doc(this.firestore, 'productVariants', sourceVariantId);
        batch.update(sourceRef, { stock: increment(-quantity) });

        // Actualizar variante de destino (incrementar)
        const targetRef = doc(this.firestore, 'productVariants', targetVariantId);
        batch.update(targetRef, { stock: increment(quantity) });

        // Actualizar productos si son diferentes
        if (!isSameProduct) {
          const sourceProductRef = doc(this.firestore, this.productsCollection, sourceVariant.productId);
          batch.update(sourceProductRef, { totalStock: increment(-quantity) });

          const targetProductRef = doc(this.firestore, this.productsCollection, targetVariant.productId);
          batch.update(targetProductRef, { totalStock: increment(quantity) });
        }

        await batch.commit();
      })()
    ).pipe(
      map(() => undefined),
      catchError(error => {
        console.error('Error al transferir stock:', error);
        return throwError(() => new Error(`Error al transferir stock: ${error.message}`));
      })
    );
  }
}