import { Component, OnInit, ChangeDetectorRef, ViewChild, TemplateRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, of, forkJoin, map, firstValueFrom } from 'rxjs';
import { catchError, finalize, switchMap, take } from 'rxjs/operators';

// --- Servicios y Modelos ---
import { DistributorService, DistributorInventoryItem, TransferDetails } from '../../../services/admin/distributor/distributor.service';
import { UserProfile, UsersService } from '../../../services/users/users.service';
import { ProductService } from '../../../services/admin/product/product.service';
import { Product, LedgerEntry, LedgerSummary, EnhancedLedgerSummary } from '../../../models/models';
import { DistributorLedgerService } from '../../../services/admin/distributorLedger/distributor-ledger.service';

// --- Módulos NG-ZORRO ---
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzModalService, NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzBadgeModule } from 'ng-zorro-antd/badge';

// --- Componentes Hijos ---
import { MovementHistoryComponent } from '../distributors/movement-history-component/movement-history-component.component';
import { DistributorOrdersHistoryComponent } from '../distributors/distributor-orders-history/distributor-orders-history.component';
import { EnhancedPaymentManagementComponent } from '../distributors/enhanced-payment-management/enhanced-payment-management.component';

// Interfaces existentes
export interface EnrichedDistributorInventoryItem extends DistributorInventoryItem {
  productName?: string;
  productModel?: string;
  variantImageUrl?: string;
  basePrice?: number;
}

export interface InventoryStats {
  totalUniqueProducts: number;
  totalVariants: number;
  totalStock: number;
}

export interface GroupedInventoryProduct {
  productId: string;
  productName?: string;
  productModel?: string;
  variantImageUrl?: string;
  totalStockForDistributor: number;
  level: 0;
  expand: boolean;
  children: EnrichedDistributorInventoryItem[];
}

@Component({
  selector: 'app-distributor-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzCardModule,
    NzSelectModule,
    NzTableModule,
    NzSpinModule,
    NzEmptyModule,
    NzButtonModule,
    NzIconModule,
    NzTagModule,
    NzGridModule,
    NzStatisticModule,
    NzAvatarModule,
    NzModalModule,
    NzInputNumberModule,
    NzToolTipModule,
    NzTabsModule,
    NzInputModule,
    NzBadgeModule,
    MovementHistoryComponent,
    DistributorOrdersHistoryComponent,
    EnhancedPaymentManagementComponent // ✅ NUEVO COMPONENTE
  ],
  templateUrl: './distributor-management.component.html',
  styleUrls: ['./distributor-management.component.css']
})
export class DistributorManagementComponent implements OnInit {
  // --- Propiedades existentes ---
  distributors$: Observable<UserProfile[]> = of([]);
  selectedDistributorId: string | null = null;
  inventory: EnrichedDistributorInventoryItem[] = [];
  isLoadingDistributors = false;
  isLoadingInventory = false;
  hasSearched = false;
  groupedInventory: GroupedInventoryProduct[] = [];
  inventoryStats: InventoryStats | null = null;
  inventoryValue = 0;
  quantityToRevert: number = 1;

  // --- ✅ PROPIEDADES MEJORADAS PARA EL LIBRO CONTABLE ---
  isLoadingLedger = false;
  ledgerEntries: LedgerEntry[] = [];
  ledgerSummary: LedgerSummary | null = null;
  enhancedLedgerSummary: EnhancedLedgerSummary | null = null; // ✅ NUEVO

  // Propiedades del modal de pago simple (mantenemos compatibilidad)
  isPaymentModalVisible = false;
  isRegisteringPayment = false;
  paymentAmount: number | null = null;
  paymentDescription = '';

  // --- Constantes y ViewChild ---
  private readonly VAT_RATE = 0.15;
  private readonly DISTRIBUTOR_DISCOUNT_PERCENTAGE = 0.30;
  @ViewChild('revertModalContent') revertModalContent!: TemplateRef<any>;

  constructor(
    private distributorService: DistributorService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef,
    private productService: ProductService,
    private modal: NzModalService,
    private usersService: UsersService,
    private ledgerService: DistributorLedgerService
  ) { }

  ngOnInit(): void {
    this.loadDistributors();
  }

  loadDistributors(): void {
    this.isLoadingDistributors = true;
    this.distributors$ = this.distributorService.getDistributors().pipe(
      catchError(err => {
        this.message.error('No se pudieron cargar los distribuidores.');
        return of([]);
      }),
      finalize(() => this.isLoadingDistributors = false)
    );
  }

  onDistributorChange(distributorId: string | null): void {
    this.selectedDistributorId = distributorId;
    // Resetear todos los estados
    this.inventory = [];
    this.groupedInventory = [];
    this.inventoryStats = null;
    this.inventoryValue = 0;
    this.ledgerEntries = [];
    this.ledgerSummary = null;
    this.enhancedLedgerSummary = null; // ✅ NUEVO
    this.hasSearched = !!distributorId;

    if (!distributorId) return;

    this.loadDistributorData(distributorId);
  }

  /**
   * ✅ MÉTODO MEJORADO: Carga todos los datos para el distribuidor seleccionado
   */

  loadDistributorData(distributorId: string): void {
    this.isLoadingInventory = true;
    this.isLoadingLedger = true;
    this.cdr.markForCheck();

    // Usamos forkJoin para esperar a que tanto el inventario ENRIQUECIDO como el libro contable estén listos.
    forkJoin({
      // ✅ CORRECCIÓN: Llamamos a this.loadInventory() que ya se encarga de obtener
      // y enriquecer los datos del inventario con los detalles del producto (incluida la imagen).
      inventory: this.loadInventory(distributorId),

      // La carga del libro contable se mantiene igual. Usamos take(1) para que se complete
      // y permita que forkJoin emita un valor.
      ledger: this.ledgerService.getLedgerEntries(distributorId).pipe(take(1))

    }).subscribe({
      next: ({ inventory, ledger }) => {
        // Ahora, la variable 'inventory' ya viene con 'productName' y 'variantImageUrl'.
        this.inventory = inventory; // Asignamos el inventario enriquecido.

        if (this.inventory.length > 0) {
          this.inventoryStats = this.calculateStats(this.inventory);
          this.groupedInventory = this.groupInventoryByProduct(this.inventory);
          this.calculateInventoryValue(this.inventory);
        } else {
          // Si no hay inventario, reseteamos las propiedades.
          this.inventoryStats = null;
          this.groupedInventory = [];
          this.inventoryValue = 0;
        }

        // Procesar libro contable (sin cambios)
        this.ledgerEntries = ledger;
        this.ledgerSummary = this.ledgerService.calculateSummary(ledger);
        this.enhancedLedgerSummary = this.ledgerService.calculateEnhancedSummary(ledger);

        // Detener los spinners
        this.isLoadingInventory = false;
        this.isLoadingLedger = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.message.error('Error al cargar los datos del distribuidor.');
        console.error(err);

        // Detener los spinners en caso de error
        this.isLoadingInventory = false;
        this.isLoadingLedger = false;
        this.cdr.markForCheck();
      }
    });
  }
  /**
   * Carga y enriquece el inventario de un distribuidor.
   */
  private loadInventory(distributorId: string): Observable<EnrichedDistributorInventoryItem[]> {
    // Obtenemos el flujo de datos en tiempo real del servicio
    return this.distributorService.getDistributorInventory(distributorId).pipe(

      // ✅ SOLUCIÓN: Usamos take(1) para tomar solo la primera emisión (el estado actual)
      // y luego completar el observable. Esto permite que forkJoin funcione.
      take(1),

      switchMap(inventoryItems => {
        if (inventoryItems.length === 0) return of([]);

        const productIds = [...new Set(inventoryItems.map(item => item.productId))];
        const productObservables = productIds.map(id =>
          this.productService.getProductById(id).pipe(catchError(() => of(null)))
        );

        return forkJoin(productObservables).pipe(
          map(products => {
            const productsMap = new Map<string, Product>();
            products.forEach(p => { if (p) productsMap.set(p.id, p); });
            return inventoryItems.map(item => {
              const product = productsMap.get(item.productId);
              const variant = product?.variants.find(v => v.id === item.variantId);
              return {
                ...item,
                productName: product?.name || 'Producto no encontrado',
                productModel: product?.model || 'N/A',
                variantImageUrl: variant?.imageUrl || product?.imageUrl,
                basePrice: variant?.price || product?.price || 0
              };
            });
          })
        );
      })
    );
  }

  // ===============================================
  // ✅ MÉTODOS MEJORADOS PARA EL MODAL DE PAGO SIMPLE
  // ===============================================

  /**
   * Abre el modal de pago simple (mantenemos compatibilidad)
   */
  openRegisterPaymentModal(): void {
    this.paymentAmount = null;
    this.paymentDescription = '';
    this.isPaymentModalVisible = true;
  }

  /**
   * ✅ MÉTODO MEJORADO: Maneja el registro de pago simple
   */
  handleRegisterPayment(): void {
    if (!this.selectedDistributorId || !this.paymentAmount || !this.paymentDescription.trim()) {
      this.message.warning('Por favor, complete todos los campos.');
      return;
    }

    this.isRegisteringPayment = true;

    // Usar el método extendido del servicio
    this.ledgerService.registerPayment(
      this.selectedDistributorId,
      this.paymentAmount,
      this.paymentDescription.trim(),
      {
        paymentMethod: 'cash', // Valor por defecto para el modal simple
        notes: this.paymentDescription.trim(),
        paidDate: new Date()
      }
    ).then(() => {
      this.message.success('Pago registrado correctamente.');
      this.isPaymentModalVisible = false;
      this.loadDistributorData(this.selectedDistributorId!); // Recargar datos
    }).catch(error => {
      this.message.error(`Error al registrar el pago: ${error.message}`);
    }).finally(() => {
      this.isRegisteringPayment = false;
    });
  }

  handleCancelPaymentModal(): void {
    this.isPaymentModalVisible = false;
  }

  // ===============================================
  // 📊 MÉTODOS DE CÁLCULO Y AGRUPACIÓN
  // ===============================================

  private async calculateInventoryValue(inventory: EnrichedDistributorInventoryItem[]): Promise<void> {
    if (!inventory || inventory.length === 0) {
      this.inventoryValue = 0;
      return;
    }

    let totalValue = 0;

    for (const item of inventory) {
      try {
        const distributorCostBase = await this.calculateDistributorCost(item);
        const costWithIVA = distributorCostBase * (1 + this.VAT_RATE);
        totalValue += costWithIVA * item.stock;
      } catch (error) {
        console.error(`Error calculando costo para item ${item.variantId}:`, error);
        // Fallback al cálculo anterior si falla
        const price = item.basePrice || 0;
        const priceWithoutVAT = price / (1 + this.VAT_RATE);
        const distributorCost = priceWithoutVAT * (1 - this.DISTRIBUTOR_DISCOUNT_PERCENTAGE);
        totalValue += distributorCost * item.stock;
      }
    }

    this.inventoryValue = Math.round(totalValue * 100) / 100;
  }

  private calculateStats = (inventory: EnrichedDistributorInventoryItem[]): InventoryStats => ({
    totalUniqueProducts: new Set(inventory.map(item => item.productId)).size,
    totalVariants: inventory.length,
    totalStock: inventory.reduce((sum, item) => sum + item.stock, 0)
  });

  private groupInventoryByProduct = (inventory: EnrichedDistributorInventoryItem[]): GroupedInventoryProduct[] => {
    const grouped = new Map<string, GroupedInventoryProduct>();
    inventory.forEach(item => {
      if (!grouped.has(item.productId)) {
        grouped.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          productModel: item.productModel,
          variantImageUrl: item.variantImageUrl,
          totalStockForDistributor: 0,
          level: 0,
          expand: false,
          children: []
        });
      }
      const productGroup = grouped.get(item.productId)!;
      productGroup.children.push(item);
    });
    return Array.from(grouped.values()).map(group => {
      group.totalStockForDistributor = group.children.reduce((sum, child) => sum + child.stock, 0);
      return group;
    });
  }

  // ===============================================
  // 🔄 MÉTODOS DE REVERSIÓN Y TRANSFERENCIA
  // ===============================================

  /**
   * ✅ NUEVO: Verifica si se puede revertir una transferencia
   * Solo permite revertir si NO hay pagos realizados para este distribuidor y producto
   */
  private async canRevertTransfer(distributorId: string, item: EnrichedDistributorInventoryItem, quantity: number): Promise<{ canRevert: boolean, reason?: string }> {
    try {
      // 1. Calcular el valor exacto de la devolución
      const distributorCostBase = await this.calculateDistributorCost(item);
      const totalWithoutIVA = distributorCostBase * quantity;
      const returnValue = totalWithoutIVA * (1 + this.VAT_RATE);

      // 2. Obtener todas las entradas del ledger para este distribuidor
      const ledgerEntries = await firstValueFrom(this.ledgerService.getLedgerEntries(distributorId));

      if (!ledgerEntries || ledgerEntries.length === 0) {
        return { canRevert: true };
      }

      // 3. ✅ CORREGIDO: Buscar débitos relacionados con este producto/variante
      const relatedDebits = ledgerEntries.filter(entry => {
        if (entry.type !== 'debit' || entry.paymentStatus === 'paid') return false;

        // Buscar por descripción que contenga el nombre del producto Y la variante
        const descriptionContainsProduct = entry.description.toLowerCase().includes(item.productName?.toLowerCase() || '');
        const descriptionContainsVariant = entry.description.toLowerCase().includes(item.colorName?.toLowerCase() || '') &&
          entry.description.toLowerCase().includes(item.sizeName?.toLowerCase() || '');

        return descriptionContainsProduct && descriptionContainsVariant;
      });

      if (relatedDebits.length === 0) {
        return {
          canRevert: false,
          reason: `No se encontraron deudas pendientes para ${item.productName} (${item.colorName}/${item.sizeName}).`
        };
      }

      // 4. ✅ CORREGIDO: Verificar si la suma de saldos pendientes es suficiente
      const totalPendingAmount = relatedDebits.reduce((sum, debit) => {
        const remainingAmount = debit.remainingAmount || debit.amount;
        return sum + remainingAmount;
      }, 0);

      if (totalPendingAmount < returnValue) {
        return {
          canRevert: false,
          reason: `Saldo pendiente insuficiente. Disponible: ${totalPendingAmount.toFixed(2)}, Requerido: ${returnValue.toFixed(2)}.`
        };
      }

      return { canRevert: true };

    } catch (error) {
      console.error('Error verificando si se puede revertir por saldo:', error);
      return {
        canRevert: false,
        reason: 'Error al verificar el estado de los pagos.'
      };
    }
  }

  // =====================================
  // 🔄 MÉTODO REVERTIR MEJORADO
  // =====================================

  /**
   * ✅ MEJORADO: Revertir transferencia con validación de pagos
   */
  async revertTransfer(item: EnrichedDistributorInventoryItem): Promise<void> {
    if (!this.selectedDistributorId) return;

    // ✅ VALIDAR POR MONTO EXACTO ANTES DE MOSTRAR EL MODAL
    const validation = await this.canRevertTransfer(this.selectedDistributorId, item, 1);

    if (!validation.canRevert) {
      this.message.error(validation.reason || 'No se puede revertir esta transferencia.');
      return;
    }

    // Si la validación pasa, mostrar el modal como antes
    this.quantityToRevert = 1;
    this.modal.create({
      nzTitle: `Revertir stock de "${item.productName}"`,
      nzContent: this.revertModalContent,
      nzData: item,
      nzOnOk: () => this.executeRevert(item, this.quantityToRevert)
    });
  }

  private executeRevert(item: EnrichedDistributorInventoryItem, quantity: number): void {
    if (!this.selectedDistributorId) return;
    const adminUid = this.usersService.getCurrentUser()?.uid;
    if (!adminUid) return;

    const transferDetails: TransferDetails = {
      distributorId: this.selectedDistributorId,
      variantId: item.variantId,
      productId: item.productId,
      quantity: quantity,
      performedByUid: adminUid,
      notes: `Reversión desde distribuidor.`
    };

    this.isLoadingInventory = true;

    // 1. Ejecutar la devolución física del stock
    this.distributorService.receiveStockFromDistributor(transferDetails).subscribe({
      next: async () => {
        try {
          // 2. Calcular el valor de la devolución
          const distributorCostBase = await this.calculateDistributorCost(item);
          const totalWithoutIVA = distributorCostBase * quantity;
          const returnValue = totalWithoutIVA * (1 + this.VAT_RATE);

          // ✅ CAMBIO CLAVE: Redondear el valor a 2 decimales ANTES de guardarlo.
          const roundedReturnValue = Math.round(returnValue * 100) / 100;

          // 3. Registrar el crédito (pago por devolución) en el ledger
          const returnId = `return-${Date.now()}`;
          await this.ledgerService.registerPayment(
            this.selectedDistributorId!,
            roundedReturnValue, // ✅ USAR EL VALOR YA REDONDEADO
            `Devolución de ${quantity} x ${item.productName} (${item.colorName}/${item.sizeName})`,
            {
              paymentMethod: 'other',
              notes: `Devolución automática por reversión de transferencia. Costo base: $${distributorCostBase.toFixed(2)} + IVA (15%)`,
              paidDate: new Date()
            }
          );

          this.message.success(`${quantity} unidad(es) devuelta(s) al almacén principal. Ajuste contable aplicado automáticamente.`);

          setTimeout(() => {
            this.loadDistributorData(this.selectedDistributorId!);
          }, 500);

        } catch (ledgerError: any) {
          console.error('Error en ajuste contable:', ledgerError);
          this.message.warning(`Stock devuelto exitosamente, pero hubo un error en el ajuste contable: ${ledgerError.message}. Registre manualmente el crédito de $${(item.basePrice || 0 * quantity).toFixed(2)}.`);
          this.onDistributorChange(this.selectedDistributorId);
        } finally {
          this.isLoadingInventory = false;
        }
      },
      error: (err) => {
        this.message.error(`Error al revertir la transferencia: ${err.message}`);
        this.isLoadingInventory = false;
      }
    });
  }

  // ===============================================
  // 🧮 MÉTODO DE CÁLCULO DE COSTO DE DISTRIBUIDOR
  // ===============================================

  /**
   * ✅ NUEVO: Calcular costo de distribuidor usando la MISMA lógica que transferencia
   * Replica exactamente la lógica de inventory-transfer-modal.component.ts
   */
  private async calculateDistributorCost(item: EnrichedDistributorInventoryItem): Promise<number> {
    try {
      // 1️⃣ PRIORIDAD: Obtener el producto completo para acceder a distributorCost
      const product = await firstValueFrom(this.productService.getProductById(item.productId));

      if (!product) {
        throw new Error('Producto no encontrado');
      }

      // 2️⃣ Buscar la variante específica dentro del producto
      const variant = product.variants.find(v => v.id === item.variantId);

      // 3️⃣ PRIORIDAD: distributorCost específico de la variante
      if (variant?.distributorCost && variant.distributorCost > 0) {
        return variant.distributorCost;
      }

      // 4️⃣ PRIORIDAD: distributorCost del producto
      if (product.distributorCost && product.distributorCost > 0) {
        return product.distributorCost;
      }

      // 5️⃣ FALLBACK: Cálculo tradicional con descuentos
      const price = variant?.price || product.price;
      const priceWithoutVAT = price / (1 + this.VAT_RATE);
      return priceWithoutVAT * (1 - this.DISTRIBUTOR_DISCOUNT_PERCENTAGE);

    } catch (error) {
      console.error('Error calculando costo de distribuidor:', error);
      // Fallback de emergencia usando basePrice
      const price = item.basePrice || 0;
      const priceWithoutVAT = price / (1 + this.VAT_RATE);
      return priceWithoutVAT * (1 - this.DISTRIBUTOR_DISCOUNT_PERCENTAGE);
    }
  }

  // ===============================================
  // 🎨 MÉTODOS DE PRESENTACIÓN
  // ===============================================

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
  }

  /**
   * ✅ NUEVO: Método para obtener el badge de estado del distribuidor
   */
  getDistributorStatusBadge(): { count: number; color: string; status: string } {
    if (!this.enhancedLedgerSummary) {
      return { count: 0, color: 'default', status: 'Sin datos' };
    }

    const summary = this.enhancedLedgerSummary;

    if (summary.overdueAmount > 0) {
      return { count: Math.round(summary.overdueAmount), color: 'red', status: 'Vencido' };
    } else if (summary.pendingAmount > 0) {
      return { count: Math.round(summary.pendingAmount), color: 'orange', status: 'Pendiente' };
    } else if (summary.balance <= 0) {
      return { count: 0, color: 'green', status: 'Al día' };
    } else {
      return { count: Math.round(summary.balance), color: 'blue', status: 'Saldo' };
    }
  }

  /**
   * ✅ NUEVO: Método para refrescar los datos cuando el componente hijo emite cambios
   */
  onPaymentUpdated(): void {
    if (this.selectedDistributorId) {
      this.loadDistributorData(this.selectedDistributorId);
    }
  }
}