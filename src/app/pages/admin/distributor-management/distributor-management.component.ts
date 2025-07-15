import { Component, OnInit, ChangeDetectorRef, ViewChild, TemplateRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, of, forkJoin, map } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';

// --- Servicios y Modelos ---
import { DistributorService, DistributorInventoryItem, TransferDetails } from '../../../services/admin/distributor/distributor.service';
import { UserProfile, UsersService } from '../../../services/users/users.service';
import { ProductService } from '../../../services/admin/product/product.service';
import { Product, LedgerEntry, LedgerSummary } from '../../../models/models';
// ✅ NUEVO: Importar el servicio y los modelos del libro contable
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
import { NzInputModule } from 'ng-zorro-antd/input'; // Para el modal de pago

// --- Componentes Hijos ---
import { MovementHistoryComponent } from '../distributors/movement-history-component/movement-history-component.component';
import { DistributorOrdersHistoryComponent } from '../distributors/distributor-orders-history/distributor-orders-history.component';

// Interfaces (sin cambios)
export interface EnrichedDistributorInventoryItem extends DistributorInventoryItem {
  productName?: string; productModel?: string; variantImageUrl?: string; basePrice?: number;
}
export interface InventoryStats {
  totalUniqueProducts: number; totalVariants: number; totalStock: number;
}
export interface GroupedInventoryProduct {
  productId: string; productName?: string; productModel?: string; variantImageUrl?: string;
  totalStockForDistributor: number; level: 0; expand: boolean; children: EnrichedDistributorInventoryItem[];
}

@Component({
  selector: 'app-distributor-management',
  standalone: true,
  imports: [
    CommonModule, FormsModule, NzCardModule, NzSelectModule, NzTableModule,
    NzSpinModule, NzEmptyModule, NzButtonModule, NzIconModule, NzTagModule,
    NzGridModule, NzStatisticModule, NzAvatarModule, NzModalModule,
    NzInputNumberModule, NzToolTipModule, NzTabsModule, NzInputModule,
    MovementHistoryComponent, DistributorOrdersHistoryComponent
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

  // --- ✅ NUEVO: Propiedades para el libro contable ---
  isLoadingLedger = false;
  ledgerEntries: LedgerEntry[] = [];
  ledgerSummary: LedgerSummary | null = null;
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
    private ledgerService: DistributorLedgerService // ✅ Inyectar el nuevo servicio
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
    this.hasSearched = !!distributorId;

    if (!distributorId) return;

    this.loadDistributorData(distributorId);
  }

  /**
   * Carga todos los datos para el distribuidor seleccionado (inventario y libro contable).
   */
  loadDistributorData(distributorId: string): void {
    this.isLoadingInventory = true;
    this.isLoadingLedger = true;
    this.cdr.markForCheck();

    // Cargar inventario y libro contable en paralelo
    forkJoin({
      inventory: this.loadInventory(distributorId),
      ledger: this.ledgerService.getLedgerEntries(distributorId)
    }).pipe(
      finalize(() => {
        this.isLoadingInventory = false;
        this.isLoadingLedger = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: ({ inventory, ledger }) => {
        // Procesar inventario
        this.inventory = inventory;
        if (inventory.length > 0) {
          this.inventoryStats = this.calculateStats(inventory);
          this.groupedInventory = this.groupInventoryByProduct(inventory);
          this.calculateInventoryValue(inventory);
        }
        // Procesar libro contable
        this.ledgerEntries = ledger;
        this.ledgerSummary = this.ledgerService.calculateSummary(ledger);
      },
      error: (err) => {
        this.message.error('Error al cargar los datos del distribuidor.');
        console.error(err);
      }
    });
  }

  /**
   * Carga y enriquece el inventario de un distribuidor.
   */
  private loadInventory(distributorId: string): Observable<EnrichedDistributorInventoryItem[]> {
    return this.distributorService.getDistributorInventory(distributorId).pipe(
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

  // --- ✅ NUEVO: Métodos para el modal de pago ---

  openRegisterPaymentModal(): void {
    this.paymentAmount = null;
    this.paymentDescription = '';
    this.isPaymentModalVisible = true;
  }

  handleRegisterPayment(): void {
    if (!this.selectedDistributorId || !this.paymentAmount || !this.paymentDescription.trim()) {
      this.message.warning('Por favor, complete todos los campos.');
      return;
    }

    this.isRegisteringPayment = true;
    this.ledgerService.registerPayment(this.selectedDistributorId, this.paymentAmount, this.paymentDescription.trim())
      .then(() => {
        this.message.success('Pago registrado correctamente.');
        this.isPaymentModalVisible = false;
        this.loadDistributorData(this.selectedDistributorId!); // Recargar datos
      })
      .catch(error => {
        this.message.error(`Error al registrar el pago: ${error.message}`);
      })
      .finally(() => {
        this.isRegisteringPayment = false;
      });
  }

  handleCancelPaymentModal(): void {
    this.isPaymentModalVisible = false;
  }

  // --- Métodos existentes (con la corrección del redondeo) ---

  calculateInventoryValue(inventory: EnrichedDistributorInventoryItem[]): void {
    if (!inventory || inventory.length === 0) {
      this.inventoryValue = 0;
      return;
    }
    const totalValue = inventory.reduce((total, item) => {
      const price = item.basePrice || 0;
      const stock = item.stock || 0;
      const priceWithoutVAT = price / (1 + this.VAT_RATE);
      const distributorCost = priceWithoutVAT * (1 - this.DISTRIBUTOR_DISCOUNT_PERCENTAGE);
      return total + (distributorCost * stock);
    }, 0);
    this.inventoryValue = parseFloat(totalValue.toFixed(2));
  }
  
  // ... (calculateStats, groupInventoryByProduct, revertTransfer, formatDate, etc. sin cambios)
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

  revertTransfer(item: EnrichedDistributorInventoryItem): void {
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
    this.distributorService.receiveStockFromDistributor(transferDetails).subscribe({
      next: () => {
        this.message.success(`${quantity} unidad(es) devuelta(s) al almacén principal.`);
        this.onDistributorChange(this.selectedDistributorId);
      },
      error: (err) => {
        this.message.error(`Error al revertir la transferencia: ${err.message}`);
        this.isLoadingInventory = false;
      }
    });
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
  }
}
