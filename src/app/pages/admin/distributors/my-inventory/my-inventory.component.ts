import { Component, OnInit, ChangeDetectorRef, inject, ViewChild, TemplateRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, of, forkJoin, map, Subject } from 'rxjs';
import { catchError, finalize, switchMap, takeUntil } from 'rxjs/operators';

// Servicios y Modelos
import { DistributorService, DistributorInventoryItem } from '../../../../services/admin/distributor/distributor.service';
import { UsersService } from '../../../../services/users/users.service';
import { ProductService } from '../../../../services/admin/product/product.service';
import { Product, LedgerEntry, EnhancedLedgerSummary } from '../../../../models/models';
import { DistributorLedgerService } from '../../../../services/admin/distributorLedger/distributor-ledger.service';


// Módulos NG-ZORRO
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { FormsModule } from '@angular/forms';
import { NzInputModule } from 'ng-zorro-antd/input';
import { MovementHistoryComponent } from "../movement-history-component/movement-history-component.component";
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { DistributorOrdersHistoryComponent } from "../distributor-orders-history/distributor-orders-history.component";
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzBadgeModule } from 'ng-zorro-antd/badge';

// Reutilizamos las mismas interfaces
export interface EnrichedDistributorInventoryItem extends DistributorInventoryItem {
  productName?: string;
  productModel?: string;
  variantImageUrl?: string;
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
  selector: 'app-my-inventory',
  standalone: true,
  imports: [
    CommonModule,
    NzCardModule,
    NzTableModule,
    NzSpinModule,
    NzEmptyModule,
    NzAvatarModule,
    NzTagModule,
    NzStatisticModule,
    NzGridModule,
    NzButtonModule,
    NzIconModule,
    NzToolTipModule,
    NzInputNumberModule,
    FormsModule,
    NzModalModule,
    NzInputModule,
    NzTabsModule,
    MovementHistoryComponent,
    DistributorOrdersHistoryComponent,
    NzAlertModule,
    NzDividerModule,
    NzBadgeModule
  ],
  templateUrl: './my-inventory.component.html',
  styleUrl: './my-inventory.component.css'
})

export class MyInventoryComponent implements OnInit, OnDestroy {
  groupedInventory: GroupedInventoryProduct[] = [];
  inventoryStats: InventoryStats | null = null;
  isLoading = false;
  currentUserId: string | null = null;
  @ViewChild('saleModalContent', { static: false }) saleModalContent!: TemplateRef<any>;
  quantityToSell: number = 1;
  ledgerEntries: LedgerEntry[] = [];
  enhancedSummary: EnhancedLedgerSummary | null = null;
  isLoadingFinancial = false;
  recentTransfers: LedgerEntry[] = [];
  showCompleteStatement: boolean = false;
  statementFilter: 'all' | 'debit' | 'credit' | 'pending' = 'all';
  allTransactions: LedgerEntry[] = [];

  // Almacena la lista original sin filtrar
  private originalGroupedInventory: GroupedInventoryProduct[] = [];
  // La lista que se mostrará en la tabla (ya filtrada)
  filteredGroupedInventory: GroupedInventoryProduct[] = [];
  // El término de búsqueda del input
  searchTerm: string = '';

  private destroy$ = new Subject<void>();

  constructor(
    private distributorService: DistributorService,
    private usersService: UsersService,
    private productService: ProductService,
    private message: NzMessageService,
    private modal: NzModalService,
    private cdr: ChangeDetectorRef,
    private ledgerService: DistributorLedgerService
  ) { }

  ngOnInit(): void {
    const currentUser = this.usersService.getCurrentUser();
    if (currentUser) {
      this.currentUserId = currentUser.uid;
      this.loadInventory(this.currentUserId);
      this.loadFinancialData();
    } else {
      this.message.error("No se pudo identificar al usuario. Por favor, inicie sesión de nuevo.");
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadInventory(distributorId: string): void {
    this.isLoading = true;
    this.distributorService.getDistributorInventory(distributorId).pipe(
      takeUntil(this.destroy$),
      switchMap(inventoryItems => {
        if (inventoryItems.length === 0) {
          return of({ grouped: [], stats: null });
        }
        const productIds = [...new Set(inventoryItems.map(item => item.productId))];
        const productObservables = productIds.map(id => this.productService.getProductById(id).pipe(catchError(() => of(null))));
        return forkJoin(productObservables).pipe(
          map(products => {
            const productsMap = new Map<string, Product>();
            products.forEach(p => { if (p) productsMap.set(p.id, p); });
            const enriched = inventoryItems.map(item => {
              const product = productsMap.get(item.productId);
              const variant = product?.variants.find(v => v.id === item.variantId);
              return {
                ...item,
                productName: product?.name || 'Producto no encontrado',
                productModel: product?.model || 'N/A',
                variantImageUrl: variant?.imageUrl || product?.imageUrl
              };
            });
            const stats = this.calculateStats(enriched);
            const grouped = this.groupInventoryByProduct(enriched);
            return { grouped, stats };
          })
        );
      })
    ).subscribe({
      next: (result) => {
        this.inventoryStats = result.stats;
        this.originalGroupedInventory = result.grouped;
        this.applyFilters();

        this.isLoading = false; // ✅ Se detiene el spinner
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.message.error(`Error al cargar tu inventario.`);
        console.error(err);

        this.isLoading = false; // ✅ Se detiene el spinner
        this.cdr.markForCheck();
      }
    });
  }

  loadFinancialData(): void {
    if (!this.currentUserId) return;

    this.isLoadingFinancial = true;

    this.ledgerService.getLedgerEntries(this.currentUserId).pipe(
      // ✅ CANCELA LA SUSCRIPCIÓN CUANDO EL COMPONENTE SE DESTRUYA
      takeUntil(this.destroy$)
    ).subscribe({
      next: (entries) => {
        this.ledgerEntries = entries;
        this.enhancedSummary = this.ledgerService.calculateEnhancedSummary(entries);

        const debits = entries.filter(entry => entry.type === 'debit');
        const credits = entries.filter(entry => entry.type === 'credit');

        this.allTransactions = [...entries].sort((a, b) => {
          const dateA = a.createdAt.toDate().getTime();
          const dateB = b.createdAt.toDate().getTime();
          return dateB - dateA;
        });

        this.recentTransfers = debits.slice(0, 5);

        this.isLoadingFinancial = false;
      },
      error: (err) => {
        this.message.error('Error al cargar información financiera.');
        this.isLoadingFinancial = false;
        console.error(err);
      }
    });
  }


  /**
 * Toggle para mostrar/ocultar el estado de cuenta completo
 */
  toggleCompleteStatement(): void {
    this.showCompleteStatement = !this.showCompleteStatement;
  }

  /**
   * Establece el filtro para el estado de cuenta
   */
  setStatementFilter(filter: 'all' | 'debit' | 'credit' | 'pending'): void {
    this.statementFilter = filter;
  }

  /**
   * Obtiene las transacciones filtradas según el filtro actual
   */
  getFilteredTransactions(): LedgerEntry[] {
    if (!this.allTransactions) return [];

    switch (this.statementFilter) {
      case 'debit':
        return this.allTransactions.filter(t => t.type === 'debit');

      case 'credit':
        return this.allTransactions.filter(t => t.type === 'credit');

      case 'pending':
        return this.allTransactions.filter(t =>
          t.type === 'debit' &&
          (t.paymentStatus === 'pending' || t.paymentStatus === 'partial') &&
          (t.remainingAmount || t.amount) > 0
        );

      case 'all':
      default:
        return this.allTransactions;
    }
  }

  /**
   * Cuenta total de transacciones
   */
  getAllTransactionsCount(): number {
    return this.allTransactions ? this.allTransactions.length : 0;
  }

  /**
   * Suma de débitos filtrados
   */
  getFilteredDebitSum(): number {
    return this.getFilteredTransactions()
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);
  }

  /**
   * Suma de créditos filtrados
   */
  getFilteredCreditSum(): number {
    return this.getFilteredTransactions()
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);
  }

  /**
   * Formatea fecha con hora para el estado de cuenta
   */
  formatDateWithTime(date: any): string {
    if (!date) return 'N/A';
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return d.toLocaleDateString('es-EC', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * TrackBy function para optimizar el renderizado de la tabla
   */
  trackByTransactionId(index: number, transaction: LedgerEntry): string {
    return transaction.id || `${transaction.sourceId}-${index}`;
  }

  // ✅ 5. AÑADE EL MÉTODO PARA APLICAR LOS FILTROS
  applyFilters(): void {
    const term = this.searchTerm.toLowerCase().trim();

    // Si no hay término de búsqueda, mostramos todo
    if (!term) {
      this.filteredGroupedInventory = [...this.originalGroupedInventory];
      return;
    }

    // Filtramos la lista original
    this.filteredGroupedInventory = this.originalGroupedInventory
      .map(product => {
        // Creamos una copia del producto para no modificar el original
        const newProduct = { ...product };

        // Filtramos las variantes (hijos) que coincidan con la búsqueda
        newProduct.children = product.children.filter(variant =>
          variant.productName?.toLowerCase().includes(term) ||
          variant.productModel?.toLowerCase().includes(term) ||
          variant.colorName.toLowerCase().includes(term) ||
          variant.sizeName.toLowerCase().includes(term) ||
          variant.sku.toLowerCase().includes(term)
        );

        return newProduct;
      })
      // Mantenemos en la lista final solo los productos cuyo nombre coincida
      // O que tengan al menos una variante que coincida.
      .filter(product =>
        product.productName?.toLowerCase().includes(term) ||
        product.productModel?.toLowerCase().includes(term) ||
        product.children.length > 0
      );
  }


  registerSale(item: EnrichedDistributorInventoryItem): void {
    // Reseteamos la cantidad a 1 cada vez que se abre el modal
    this.quantityToSell = 1;

    this.modal.create({
      nzTitle: `Registrar venta de "${item.productName}"`,
      nzContent: this.saleModalContent,
      nzData: item,
      nzOnOk: () => {
        if (!this.currentUserId) return;

        const saleDetails = {
          distributorId: this.currentUserId,
          variantId: item.variantId,
          quantity: this.quantityToSell,
          notes: `Venta registrada desde el panel.` // ✅ CORRECCIÓN
        };

        this.isLoading = true;
        this.distributorService.registerDistributorSale(saleDetails)
          .then(() => {
            this.message.success('Venta registrada correctamente.');
            this.loadInventory(this.currentUserId!);
          })
          .catch(err => {
            this.message.error(`Error al registrar la venta: ${err.message}`);
            this.isLoading = false;
          });
      }
    });
  }

  // Los métodos de cálculo y formato son iguales
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

  formatDate = (date: any): string => {
    if (!date) return 'N/A';
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  getFinancialStatusBadge(): { color: string; text: string; icon: string } {
    if (!this.enhancedSummary) return { color: 'default', text: 'Sin datos', icon: 'question' };

    if (this.enhancedSummary.overdueAmount > 0) {
      return { color: 'red', text: 'Pagos Vencidos', icon: 'exclamation-circle' };
    } else if (this.enhancedSummary.pendingAmount > 0) {
      return { color: 'orange', text: 'Pagos Pendientes', icon: 'clock-circle' };
    } else {
      return { color: 'green', text: 'Al Día', icon: 'check-circle' };
    }
  }

  getDistributorPendingAmount(): number {
    if (!this.enhancedSummary) return 0;
    const balance = this.enhancedSummary.totalDebit - this.enhancedSummary.totalCredit;
    return Math.round(balance * 100) / 100;
  }

  getDistributorTotalDebit(): number {
    if (!this.enhancedSummary) return 0;
    return Math.round(this.enhancedSummary.totalDebit * 100) / 100;
  }

  getDistributorTotalPaid(): number {
    if (!this.enhancedSummary) return 0;
    return Math.round(this.enhancedSummary.totalCredit * 100) / 100;
  }

  /**
 * Muestra los detalles de una transacción en modal
 */
  viewTransactionDetails(transaction: LedgerEntry): void {
    const isDebit = transaction.type === 'debit';
    const remainingAmount = transaction.remainingAmount || transaction.amount;
    const title = isDebit ? '💳 Detalles de Débito' : '💰 Detalles de Pago';

    // Preparar la información para mostrar
    const transactionInfo = [
      `<strong>Tipo:</strong> ${isDebit ? 'Débito (Deuda)' : 'Crédito (Pago)'}`,
      `<strong>Fecha:</strong> ${this.formatDateWithTime(transaction.createdAt)}`,
      `<strong>Monto:</strong> ${this.formatCurrency(transaction.amount)}`,
      `<strong>Estado:</strong> ${this.getPaymentStatusText(transaction.paymentStatus || 'pending')}`,
      `<strong>Descripción:</strong> ${transaction.description}`
    ];

    // Agregar información específica para débitos
    if (isDebit) {
      transactionInfo.push(
        `<strong>Monto Pagado:</strong> ${this.formatCurrency(transaction.paidAmount || 0)}`,
        `<strong>Saldo Pendiente:</strong> ${this.formatCurrency(remainingAmount)}`
      );
    }

    // Agregar notas si existen
    if (transaction.paymentNotes) {
      transactionInfo.push(`<strong>Notas:</strong> ${transaction.paymentNotes}`);
    }

    // Información técnica
    transactionInfo.push(
      '<hr>',
      '<small>',
      `<strong>ID:</strong> ${transaction.id || 'N/A'}`,
      `<strong>Fuente:</strong> ${this.getSourceTypeText(transaction.sourceType)}`,
      `<strong>Creado por:</strong> ${transaction.createdBy === 'system' ? 'Sistema Automático' : 'Administrador'}`,
      '</small>'
    );

    this.modal.info({
      nzTitle: title,
      nzContent: transactionInfo.join('<br>'),
      nzWidth: 500
    });
  }

  /**
   * Obtiene el título del modal según el tipo de transacción
   */
  private getTransactionModalTitle(transaction: LedgerEntry): string {
    return transaction.type === 'debit' ? '💳 Detalles de Débito' : '💰 Detalles de Pago';
  }

  /**
   * Prepara los datos para el modal de detalles de transacción
   */
  private prepareTransactionModalData(transaction: LedgerEntry) {
    const isDebit = transaction.type === 'debit';
    const remainingAmount = transaction.remainingAmount || transaction.amount;

    return {
      title: isDebit ? '💳 Detalles de Débito' : '💰 Detalles de Pago',
      transaction,
      isDebit,
      remainingAmount,
      formattedDate: this.formatDateWithTime(transaction.createdAt),
      formattedAmount: this.formatCurrency(transaction.amount),
      formattedPaidAmount: this.formatCurrency(transaction.paidAmount || 0),
      formattedRemainingAmount: this.formatCurrency(remainingAmount),
      paymentStatusText: this.getPaymentStatusText(transaction.paymentStatus || 'pending'),
      sourceTypeText: this.getSourceTypeText(transaction.sourceType)
    };
  }

  /**
   * Obtiene el texto del estado de pago
   */
  private getPaymentStatusText(status: string): string {
    switch (status) {
      case 'paid': return '✅ Pagado';
      case 'pending': return '⏳ Pendiente';
      case 'partial': return '🔵 Parcial';
      case 'overdue': return '❌ Vencido';
      default: return '❓ Desconocido';
    }
  }

  /**
   * Obtiene el texto del tipo de fuente
   */
  private getSourceTypeText(sourceType: string): string {
    switch (sourceType) {
      case 'manual_payment': return 'Pago Manual';
      case 'transfer': return 'Transferencia de Stock';
      case 'distributor_order': return 'Pedido de Distribuidor';
      default: return sourceType;
    }
  }

}
