// src/app/services/admin/distributor/distributor.service.ts
import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  writeBatch,
  increment,
  serverTimestamp,
  Timestamp,
  FieldValue, // Importar FieldValue
  orderBy,
  onSnapshot
} from '@angular/fire/firestore';
import { Observable, from, of, forkJoin, throwError } from 'rxjs';
import { map, catchError, switchMap, take, tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

import { UserProfile, UsersService } from '../../users/users.service'; // Importar UserProfile
import { ProductInventoryService } from '../inventario/product-inventory.service';
import { ProductVariant, Order } from '../../../models/models'; // Importar ProductVariant
import { CacheService } from '../cache/cache.service';
import { ErrorUtil } from '../../../utils/error-util'; // Asegúrate de tener esta utilidad

// 🆕 Interfaz para el documento de inventario del distribuidor
export interface DistributorInventoryItem {
  id?: string;
  distributorId: string;
  productId: string;
  variantId: string;
  colorName: string;
  sizeName: string;
  sku: string;
  stock: number;
  // Snapshot del producto al momento de la transferencia — independiente del catálogo
  productName?: string;
  productModel?: string;
  imageUrl?: string;
  lastTransferDate: Timestamp | Date | FieldValue;
  lastSaleDate?: Timestamp | Date | FieldValue;
  createdAt: Timestamp | Date | FieldValue;
  updatedAt: Timestamp | Date | FieldValue;
}

// 🆕 Interfaz para los detalles de la transferencia
export interface TransferDetails {
  distributorId: string;
  variantId: string;
  quantity: number;
  productId: string;
  performedByUid: string; // UID del administrador que realiza la transferencia
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DistributorService {
  private firestore = inject(Firestore);
  private distributorInventoryCollection = 'distributors_inventory';
  private inventoryMovementsCollection = 'inventoryMovements'; // Colección existente
  private distributorInventoryMovementsCollection = 'distributor_inventory_movements'; // Nueva colección de logs para distribuidores

  constructor(
    private usersService: UsersService,
    private productInventoryService: ProductInventoryService,
    private cacheService: CacheService
  ) { }

  /**
   * 👥 Obtiene todos los usuarios con el rol 'distributor'.
   */
  getDistributors(): Observable<UserProfile[]> {
    // Reutiliza el método getUsers del UsersService para filtrar por rol 'distributor'
    return this.usersService.getUsers('distributor').pipe(
      map(users => users.filter(user => user.roles.includes('distributor'))), // Filtro extra por si acaso
      catchError(error => {
        console.error('❌ DistributorService: Error obteniendo distribuidores:', error);
        return ErrorUtil.handleError(error, 'getDistributors');
      })
    );
  }

  /**
 * 📦 Obtiene el inventario de un distribuidor en TIEMPO REAL desde la colección principal.
 * @param distributorId ID del distribuidor.
 */
  getDistributorInventory(distributorId: string): Observable<DistributorInventoryItem[]> {
    if (!distributorId) {
      return of([]);
    }

    // ✅ CORRECCIÓN: Apuntar a la colección principal 'distributors_inventory'.
    const inventoryRef = collection(this.firestore, 'distributors_inventory');

    // ✅ CORRECCIÓN: Aplicar el filtro 'where' para obtener solo el inventario del distribuidor correcto.
    const q = query(inventoryRef, where('distributorId', '==', distributorId));

    return new Observable(subscriber => {
      const unsubscribe = onSnapshot(q,
        (snapshot) => {
          const inventory = snapshot.docs.map(doc => {
            const data = doc.data();
            // Mantenemos tu lógica de conversión de fechas que es importante.
            return this.usersService.convertTimestampsToDates({ id: doc.id, ...data }) as DistributorInventoryItem;
          });

          // El componente recibirá la lista de inventario actualizada aquí.
          subscriber.next(inventory);
        },
        (error) => {
          console.error(`❌ DistributorService: Error en listener de inventario para ${distributorId}:`, error);
          subscriber.error(error);
        }
      );

      // Limpieza al destruir el componente.
      return () => unsubscribe();
    });
  }

  /**
   * 🚚 Transfiere stock desde el almacén principal a un distribuidor.
   * Decrementa el stock principal y actualiza/crea el stock del distribuidor.
   * @param transferDetails Detalles de la transferencia.
   */
  transferStockToDistributor(transferDetails: TransferDetails): Observable<void> {
    const { distributorId, variantId, quantity, productId, performedByUid, notes } = transferDetails;

    if (!distributorId || !variantId || !productId || quantity <= 0 || !performedByUid) {
      return throwError(() => new Error('Datos de transferencia incompletos o inválidos.'));
    }

    return from(this.executeTransfer(transferDetails)).pipe(
      tap(() => {
        // Invalida cachés relevantes después de una transferencia exitosa
        this.invalidateTransferCaches(distributorId, productId, variantId);
      }),
      catchError(error => {
        console.error('❌ DistributorService: Error al ejecutar transferencia:', error);
        return ErrorUtil.handleError(error, 'transferStockToDistributor');
      })
    );
  }

  private async executeTransfer(transferDetails: TransferDetails): Promise<void> {
    const { distributorId, variantId, quantity, productId, performedByUid, notes } = transferDetails;
    const batch = writeBatch(this.firestore);

    // 1. Verificar stock disponible en el almacén principal
    const mainVariantDoc = doc(this.firestore, 'productVariants', variantId);
    const mainVariantSnap = await getDoc(mainVariantDoc);

    if (!mainVariantSnap.exists()) {
      throw new Error(`Variante principal ${variantId} no encontrada.`);
    }

    const currentMainStock = (mainVariantSnap.data()?.['stock'] || 0) as number;
    if (currentMainStock < quantity) {
      throw new Error(`Stock insuficiente en el almacén principal. Disponible: ${currentMainStock}, Solicitado: ${quantity}.`);
    }

    // 2. Decrementar stock en la colección 'productVariants' (almacén principal)
    batch.update(mainVariantDoc, {
      stock: increment(-quantity),
      updatedAt: serverTimestamp()
    });

    // 3. Actualizar/crear stock en la colección 'distributors_inventory'
    const distributorInventoryRef = collection(this.firestore, this.distributorInventoryCollection);
    const qDistributorInventory = query(
      distributorInventoryRef,
      where('distributorId', '==', distributorId),
      where('variantId', '==', variantId)
    );
    const distributorInventorySnap = await getDocs(qDistributorInventory);

    const variantData = mainVariantSnap.data() as ProductVariant;

    // Leer producto para guardar snapshot (independiente del catálogo)
    const productDoc = doc(this.firestore, 'products', productId);
    const productSnap = await getDoc(productDoc);
    const productData = productSnap.data();

    const distributorInventoryItem: DistributorInventoryItem = {
      distributorId,
      productId,
      variantId,
      colorName: variantData.colorName,
      sizeName: variantData.sizeName,
      sku: variantData.sku,
      stock: quantity,
      productName: productData?.['name'] || '',
      productModel: productData?.['model'] || '',
      imageUrl: variantData.imageUrl || productData?.['imageUrl'] || '',
      lastTransferDate: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (!distributorInventorySnap.empty) {
      // Si el distribuidor ya tiene esta variante, actualizar stock
      const existingDocRef = distributorInventorySnap.docs[0].ref;
      batch.update(existingDocRef, {
        stock: increment(quantity),
        lastTransferDate: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log(`📦 Stock de variante ${variantId} incrementado en distribuidor ${distributorId}.`);
    } else {
      // Si el distribuidor no tiene esta variante, crear un nuevo documento
      const newDocRef = doc(distributorInventoryRef, uuidv4()); // Generar un nuevo ID para el documento
      batch.set(newDocRef, distributorInventoryItem);
      console.log(`📦 Nueva variante ${variantId} creada para distribuidor ${distributorId}.`);
    }

    // 4. Registrar movimiento en 'inventoryMovements' (log del almacén principal)
    await this.productInventoryService.logInventoryMovement(
      productId,
      variantId,
      -quantity, // Cantidad negativa porque sale del almacén principal
      'transfer_out',
      performedByUid,
      { distributorId, notes }
    );

    // 5. Registrar movimiento en 'distributor_inventory_movements' (log específico del distribuidor)
    const distributorMovementRef = collection(this.firestore, this.distributorInventoryMovementsCollection);
    const newDistributorMovementDocRef = doc(distributorMovementRef, uuidv4());
    batch.set(newDistributorMovementDocRef, {
      type: 'transfer_out', // Correcto
      distributorId,
      productId,
      variantId,
      quantity,
      timestamp: serverTimestamp(),
      performedBy: performedByUid,
      notes
    });

    // Ejecutar todas las operaciones en lote
    await batch.commit();
    console.log(`✅ Transferencia de ${quantity} unidades de ${variantId} a ${distributorId} completada.`);
  }

  /**
   * ↩️ Recibe stock de vuelta de un distribuidor a un almacén principal. (Opcional)
   * Incrementa el stock principal y decrementa el stock del distribuidor.
   * @param transferDetails Detalles de la transferencia de retorno.
   */
  receiveStockFromDistributor(transferDetails: TransferDetails): Observable<void> {
    const { distributorId, variantId, quantity, productId, performedByUid, notes } = transferDetails;

    if (!distributorId || !variantId || !productId || quantity <= 0 || !performedByUid) {
      return throwError(() => new Error('Datos de retorno de stock incompletos o inválidos.'));
    }

    return from(this.executeReceive(transferDetails)).pipe(
      tap(() => {
        this.invalidateTransferCaches(distributorId, productId, variantId);
      }),
      catchError(error => {
        console.error('❌ DistributorService: Error al recibir stock:', error);
        return ErrorUtil.handleError(error, 'receiveStockFromDistributor');
      })
    );
  }

  private async executeReceive(transferDetails: TransferDetails): Promise<void> {
    const { distributorId, variantId, quantity, productId, performedByUid, notes } = transferDetails;
    const batch = writeBatch(this.firestore);

    // 1. Verificar stock disponible en el distribuidor
    const distributorInventoryRef = collection(this.firestore, this.distributorInventoryCollection);
    const qDistributorInventory = query(
      distributorInventoryRef,
      where('distributorId', '==', distributorId),
      where('variantId', '==', variantId)
    );
    const distributorInventorySnap = await getDocs(qDistributorInventory);

    if (distributorInventorySnap.empty) {
      throw new Error(`El distribuidor ${distributorId} no tiene la variante ${variantId}.`);
    }

    const distributorItemDoc = distributorInventorySnap.docs[0];
    const currentDistributorStock = (distributorItemDoc.data()?.['stock'] || 0) as number;

    if (currentDistributorStock < quantity) {
      throw new Error(`Stock insuficiente en el distribuidor. Disponible: ${currentDistributorStock}, Solicitado: ${quantity}.`);
    }

    // 2. Decrementar stock en la colección 'distributors_inventory'
    batch.update(distributorItemDoc.ref, {
      stock: increment(-quantity),
      updatedAt: serverTimestamp()
    });

    // 3. Incrementar stock en la colección 'productVariants' (almacén principal)
    const mainVariantDoc = doc(this.firestore, 'productVariants', variantId);
    batch.update(mainVariantDoc, {
      stock: increment(quantity),
      updatedAt: serverTimestamp()
    });

    // 4. Registrar movimiento en 'inventoryMovements' (log del almacén principal)
    await this.productInventoryService.logInventoryMovement(
      productId,
      variantId,
      quantity, // Cantidad positiva porque entra al almacén principal
      'transfer_in',
      performedByUid,
      { distributorId, notes }
    );

    // 5. Registrar movimiento en 'distributor_inventory_movements' (log específico del distribuidor)
    const distributorMovementRef = collection(this.firestore, this.distributorInventoryMovementsCollection);
    // ✅ CORRECCIÓN: Usar doc() y set() para añadir a un batch
    const newDistributorMovementDocRef = doc(distributorMovementRef);
    batch.set(newDistributorMovementDocRef, {
      type: 'transfer_in',
      distributorId,
      productId,
      variantId,
      quantity,
      timestamp: serverTimestamp(),
      performedBy: performedByUid,
      notes
    });

    await batch.commit();
    console.log(`✅ Recepción de ${quantity} unidades de ${variantId} desde ${distributorId} completada.`);
  }

  /**
   * 📊 Obtiene el historial de movimientos de inventario para un distribuidor.
   * @param distributorId ID del distribuidor.
   * @param productId Opcional: filtra los movimientos por un producto específico.
   * @param days Opcional: número de días hacia atrás para el historial.
   */
  getDistributorInventoryMovements(distributorId: string, productId?: string, days?: number): Observable<any[]> {
    const cacheKey = `distributor_movements_${distributorId}${productId ? `_${productId}` : ''}${days ? `_${days}` : ''}`;

    return this.cacheService.getCached<any[]>(cacheKey, () => {
      const movementsRef = collection(this.firestore, this.distributorInventoryMovementsCollection);
      let q = query(movementsRef, where('distributorId', '==', distributorId));

      if (productId) {
        q = query(q, where('productId', '==', productId));
      }

      if (days) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        q = query(q, where('timestamp', '>=', Timestamp.fromDate(startDate)), where('timestamp', '<=', Timestamp.fromDate(endDate)));
      }

      return from(getDocs(q)).pipe(
        map(snapshot => snapshot.docs.map(doc => {
          const data = doc.data();
          // ✅ CORRECCIÓN: Usar el nombre correcto del método
          return this.usersService.convertTimestampsToDates({ id: doc.id, ...data });
        })),
        catchError(error => {
          console.error(`❌ DistributorService: Error obteniendo movimientos para ${distributorId}:`, error);
          return ErrorUtil.handleError(error, 'getDistributorInventoryMovements');
        })
      );
    });
  }

  /**
   * 🧹 Invalida los cachés relacionados con el inventario del distribuidor.
   * @param distributorId ID del distribuidor.
   * @param productId Opcional: ID del producto.
   * @param variantId Opcional: ID de la variante.
   */
  private invalidateTransferCaches(distributorId: string, productId?: string, variantId?: string): void {
    this.cacheService.invalidate(`distributor_inventory_${distributorId}`);
    this.cacheService.invalidate(`distributor_movements_${distributorId}`);

    if (productId) {
      this.cacheService.invalidate(`distributor_inventory_${distributorId}_${productId}`);
      this.cacheService.invalidate(`distributor_movements_${distributorId}_${productId}`);
      // También invalidar cachés del almacén principal que puedan verse afectados
      this.cacheService.invalidateProductCache(productId);
      this.cacheService.invalidate(`product_variants_product_${productId}`);
    }
    if (variantId) {
      this.cacheService.invalidate(`product_variants_${variantId}`);
    }
    // Invalidar cachés generales de productos si la transferencia afecta el stock total
    this.cacheService.invalidate('products');
    this.cacheService.invalidate('products_featured');
    this.cacheService.invalidate('products_bestselling');
    this.cacheService.invalidate('products_new');
    this.cacheService.invalidate('products_discounted');
  }

  /**
 * 🆕 Registra una venta realizada por un distribuidor.
 * Decrementa el stock del distribuidor y registra el movimiento.
 * @param saleDetails Detalles de la venta.
 */
  async registerDistributorSale(saleDetails: {
    distributorId: string;
    variantId: string;
    quantity: number;
    notes?: string;
  }): Promise<void> {
    const { distributorId, variantId, quantity, notes } = saleDetails;

    if (!distributorId || !variantId || quantity <= 0) {
      throw new Error('Faltan datos para registrar la venta del distribuidor.');
    }

    const batch = writeBatch(this.firestore);

    // 1. Encontrar el item de inventario del distribuidor
    const inventoryRef = collection(this.firestore, this.distributorInventoryCollection);
    const q = query(
      inventoryRef,
      where('distributorId', '==', distributorId),
      where('variantId', '==', variantId)
    );
    const inventorySnap = await getDocs(q);

    if (inventorySnap.empty) {
      throw new Error('El distribuidor no tiene esta variante en su inventario.');
    }

    const inventoryDocRef = inventorySnap.docs[0].ref;
    const currentStock = inventorySnap.docs[0].data()['stock'] || 0;

    if (currentStock < quantity) {
      throw new Error(`Stock insuficiente. Disponible: ${currentStock}, Venta: ${quantity}.`);
    }

    // 2. Decrementar stock o eliminar el documento si llega a 0
    const remainingStock = currentStock - quantity;
    if (remainingStock <= 0) {
      batch.delete(inventoryDocRef);
    } else {
      batch.update(inventoryDocRef, {
        stock: increment(-quantity),
        lastSaleDate: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    // 3. Registrar el movimiento en el log del distribuidor
    const movementLogRef = doc(collection(this.firestore, this.distributorInventoryMovementsCollection));
    const inventoryItemData = inventorySnap.docs[0].data();

    batch.set(movementLogRef, {
      type: 'distributor_sale',
      distributorId,
      productId: inventoryItemData['productId'],
      variantId,
      quantity,
      timestamp: serverTimestamp(),
      performedBy: distributorId, // La venta la realiza el mismo distribuidor
      notes: notes || 'Venta registrada desde el panel.'
    });

    // 4. Ejecutar la transacción
    await batch.commit();
  }

  /**
   * Obtiene todos los pedidos realizados por un distribuidor específico.
   */
  getDistributorOrders(distributorId: string): Observable<Order[]> {
    const ordersRef = collection(this.firestore, 'orders');
    const q = query(
      ordersRef,
      where('distributorId', '==', distributorId),
      orderBy('createdAt', 'desc')
    );

    return from(getDocs(q)).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      }),
      catchError(error => {
        console.error('Error obteniendo los pedidos del distribuidor:', error);
        return of([]);
      })
    );
  }

}
