import { Component, OnInit, Input, OnChanges, SimpleChanges, ViewChild, TemplateRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';

// Servicios y Modelos
import { DistributorLedgerService } from '../../../../services/admin/distributorLedger/distributor-ledger.service';
import { LedgerEntry, EnhancedLedgerSummary, PaymentDetails } from '../../../../models/models';

// Módulos NG-ZORRO
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzEmptyModule } from 'ng-zorro-antd/empty';


@Component({
  selector: 'app-enhanced-payment-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NzCardModule,
    NzTableModule,
    NzSpinModule,
    NzTagModule,
    NzButtonModule,
    NzIconModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzInputNumberModule,
    NzSelectModule,
    NzDatePickerModule,
    NzUploadModule,
    NzStatisticModule,
    NzGridModule,
    NzDividerModule,
    NzToolTipModule,
    NzBadgeModule,
    NzDescriptionsModule,
    NzEmptyModule,

  ],
  templateUrl: './enhanced-payment-management.component.html',
  styleUrl: './enhanced-payment-management.component.css'
})
export class EnhancedPaymentManagementComponent implements OnInit, OnChanges {

  @Input() distributorId: string | null = null;

  private ledgerService = inject(DistributorLedgerService);
  private message = inject(NzMessageService);
  private modal = inject(NzModalService);
  private fb = inject(FormBuilder);

  // Datos principales
  ledgerEntries: LedgerEntry[] = [];
  enhancedSummary: EnhancedLedgerSummary | null = null;
  isLoading = false;

  // Control de modales y formularios
  isMarkPaidModalVisible = false;
  isDetailsModalVisible = false;
  isRegisteringPayment = false;
  markPaidForm: FormGroup;
  selectedEntry: LedgerEntry | null = null;
  selectedPaymentDetails: PaymentDetails | null = null;

  // Filtros para la tabla
  filteredEntries: LedgerEntry[] = [];
  statusFilter: 'all' | 'pending' | 'paid' | 'partial' | 'overdue' = 'all';

  @ViewChild('paymentModalContent') paymentModalContent!: TemplateRef<any>;
  @ViewChild('markPaidModalContent') markPaidModalContent!: TemplateRef<any>;
  @ViewChild('detailsModalContent') detailsModalContent!: TemplateRef<any>;

  constructor() {

    this.markPaidForm = this.fb.group({
      paidAmount: [null, [Validators.required, Validators.min(0.01)]],
      paymentMethod: ['cash', [Validators.required]],
      bankReference: [''],
      notes: [''],
      paidDate: [new Date(), [Validators.required]]
    });
  }

  ngOnInit(): void {
    if (this.distributorId) {
      this.loadLedgerData();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['distributorId'] && !changes['distributorId'].isFirstChange()) {
      this.loadLedgerData();
    }
  }

  loadLedgerData(): void {
    if (!this.distributorId) return;

    this.isLoading = true;
    this.ledgerService.getLedgerEntries(this.distributorId)
    .subscribe({
      next: (entries) => {
        this.ledgerEntries = entries;
        this.enhancedSummary = this.ledgerService.calculateEnhancedSummary(entries);
        this.applyStatusFilter();
        this.isLoading = false;
      },
      error: (err) => {
        this.message.error('Error al cargar los datos del libro contable.');
        console.error(err);
        this.isLoading = false;
      }
    });
  }

  // =====================================
  // 🔄 GESTIÓN DE FILTROS
  // =====================================

  applyStatusFilter(): void {
    if (this.statusFilter === 'all') {
      this.filteredEntries = [...this.ledgerEntries];
    } else if (this.statusFilter === 'overdue') {
      // Filtrar entradas vencidas
      const now = new Date();
      this.filteredEntries = this.ledgerEntries.filter(entry =>
        entry.type === 'debit' &&
        entry.paymentStatus !== 'paid' &&
        entry.dueDate &&
        entry.dueDate.toDate() < now
      );
    } else {
      this.filteredEntries = this.ledgerEntries.filter(entry =>
        entry.paymentStatus === this.statusFilter
      );
    }
  }

  onStatusFilterChange(status: typeof this.statusFilter): void {
    this.statusFilter = status;
    this.applyStatusFilter();
  }

  // =====================================
  // 💰 GESTIÓN DE PAGOS
  // =====================================

  openMarkAsPaidModal(entry: LedgerEntry): void {
    this.selectedEntry = entry;

    // ✅ CORREGIDO: Usar remainingAmount que considera devoluciones automáticas
    const correctedRemainingAmount = this.getCorrectedRemainingAmount(entry);

    this.markPaidForm.reset({
      paidAmount: correctedRemainingAmount,
      paymentMethod: 'cash',
      paidDate: new Date()
    });

    // ✅ CORREGIDO: Configurar validador máximo basado en el monto pendiente correcto
    this.markPaidForm.get('paidAmount')?.setValidators([
      Validators.required,
      Validators.min(0.01),
      Validators.max(correctedRemainingAmount)
    ]);

    this.isMarkPaidModalVisible = true;
  }

  handleMarkAsPaid(): void {
    if (!this.selectedEntry || this.markPaidForm.invalid) {
      this.message.warning('Por favor, complete todos los campos requeridos.');
      return;
    }

    this.isRegisteringPayment = true;
    const formData = this.markPaidForm.value;

    const paymentDetails: Partial<PaymentDetails> = {
      paymentMethod: formData.paymentMethod,
      bankReference: formData.bankReference,
      notes: formData.notes,
      paidDate: formData.paidDate
    };

    this.ledgerService.markDebitAsPaid(
      this.selectedEntry.id!,
      formData.paidAmount,
      paymentDetails
    ).then(() => {
      this.message.success('Pago aplicado correctamente.');
      this.isMarkPaidModalVisible = false;
      this.loadLedgerData();
    }).catch(error => {
      this.message.error(`Error al aplicar el pago: ${error.message}`);
    }).finally(() => {
      this.isRegisteringPayment = false;
    });
  }

  // =====================================
  // 📋 VISUALIZACIÓN DE DETALLES
  // =====================================

  showEntryDetails(entry: LedgerEntry): void {
    this.selectedEntry = entry;

    // Si es un crédito o débito pagado, cargar detalles adicionales
    if (entry.type === 'credit' || entry.paymentStatus === 'paid' || entry.paymentStatus === 'partial') {
      this.ledgerService.getPaymentDetails(entry.id!).subscribe(details => {
        this.selectedPaymentDetails = details;
        this.isDetailsModalVisible = true;
      });
    } else {
      this.selectedPaymentDetails = null;
      this.isDetailsModalVisible = true;
    }
  }

  // =====================================
  // 🎨 MÉTODOS DE PRESENTACIÓN
  // =====================================

  getStatusTag(status: string): { color: string; text: string; icon: string } {
    switch (status) {
      case 'pending':
        return { color: 'orange', text: 'Pendiente', icon: 'clock-circle' };
      case 'paid':
        return { color: 'green', text: 'Pagado', icon: 'check-circle' };
      case 'partial':
        return { color: 'blue', text: 'Parcial', icon: 'pie-chart' };
      case 'overdue':
        return { color: 'red', text: 'Vencido', icon: 'exclamation-circle' };
      default:
        return { color: 'default', text: status, icon: 'question-circle' };
    }
  }

  getPaymentMethodTag(method: string): { color: string; text: string } {
    switch (method) {
      case 'cash':
        return { color: 'green', text: 'Efectivo' };
      case 'bank_transfer':
        return { color: 'blue', text: 'Transferencia' };
      case 'check':
        return { color: 'purple', text: 'Cheque' };
      case 'online':
        return { color: 'cyan', text: 'Online' };
      default:
        return { color: 'default', text: 'Otro' };
    }
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  getEntryTypeIcon(type: string): string {
    return type === 'debit' ? 'arrow-up' : 'arrow-down';
  }

  getEntryTypeColor(type: string): string {
    return type === 'debit' ? '#cf1322' : '#3f8600';
  }

  isOverdue(entry: LedgerEntry): boolean {
    if (!entry.dueDate || entry.paymentStatus === 'paid') return false;
    return entry.dueDate.toDate() < new Date();
  }

  getDaysOverdue(entry: LedgerEntry): number {
    if (!this.isOverdue(entry)) return 0;
    const now = new Date();
    const dueDate = entry.dueDate!.toDate();
    return Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  handleCancel(): void {
    this.isMarkPaidModalVisible = false;
    this.isDetailsModalVisible = false;
  }

  // =====================================
  // 🔄 MÉTODOS PARA RECARGA DE DATOS
  // =====================================

  /**
   * ✅ NUEVO: Recargar datos del ledger
   */
  reloadLedgerData(): void {
    if (!this.distributorId) return;

    this.isLoading = true;
    this.loadLedgerData();
  }

  /**
   * ✅ NUEVO: Método para detectar si hay cambios pendientes de visualizar
   */
  hasRecentChanges(): boolean {
    if (!this.ledgerEntries || this.ledgerEntries.length === 0) return false;

    // Verificar si hay entradas recientes (últimos 5 minutos)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.ledgerEntries.some(entry => {
      const entryDate = entry.createdAt.toDate();
      return entryDate > fiveMinutesAgo;
    });
  }

  // ===============================================
  // 🔄 NUEVOS MÉTODOS OPTIMIZADOS PARA DETECCIÓN DE DEVOLUCIONES
  // ===============================================

  /**
   * ✅ MÉTODO PRINCIPAL: Análisis directo sin caché
   * Siempre usa datos frescos del ledgerEntries actual
   */
  getReturnStatus(debitEntry: LedgerEntry): {
    hasReturns: boolean;
    isCompleteReturn: boolean;
    isPartialReturn: boolean;
    shouldShowPayButton: boolean;
    statusTag: { text: string; color: string; icon: string };
  } {
    if (debitEntry.type !== 'debit') {
      return {
        hasReturns: false,
        isCompleteReturn: false,
        isPartialReturn: false,
        shouldShowPayButton: true,
        statusTag: this.getStatusTag(debitEntry.paymentStatus || 'pending')
      };
    }

    // ✅ ANÁLISIS DIRECTO SIN CACHÉ - Siempre datos frescos
    const analysis = this.analyzeTransferReturns(debitEntry);

    const hasReturns = analysis.hasReturns;
    const isCompleteReturn = analysis.isComplete;
    const isPartialReturn = hasReturns && !isCompleteReturn;

    // ✅ NUEVO: Calcular remainingAmount para decidir si mostrar botón de pago
    const correctedRemainingAmount = this.getCorrectedRemainingAmount(debitEntry);

    return {
      hasReturns,
      isCompleteReturn,
      isPartialReturn,
      // ✅ CORREGIDO: Solo mostrar botón si hay monto pendiente > 0 y no está completamente devuelto o pagado
      shouldShowPayButton: correctedRemainingAmount > 0 &&
        !isCompleteReturn &&
        debitEntry.paymentStatus !== 'paid',
      statusTag: this.determineStatusTag(isCompleteReturn, isPartialReturn, debitEntry, correctedRemainingAmount)
    };
  }

  /**
   * ✅ MÉTODO CORE: Análisis optimizado pero sin caché
   * Procesa solo los datos necesarios para mantener performance
   */
  private analyzeTransferReturns(debitEntry: LedgerEntry): {
    hasReturns: boolean;
    totalTransferred: number;
    totalReturned: number;
    isComplete: boolean;
  } {
    // 1️⃣ Extraer información del producto/variante del débito
    const debitProductInfo = this.extractProductInfoOptimized(debitEntry.description);

    // 2️⃣ Extraer cantidad transferida del débito
    const transferredQuantity = this.extractQuantityFromDescription(debitEntry.description);

    if (transferredQuantity === 0) {
      return { hasReturns: false, totalTransferred: 0, totalReturned: 0, isComplete: false };
    }

    // 3️⃣ FILTRADO OPTIMIZADO: Solo procesar créditos de devolución relevantes
    const relevantReturns = this.findMatchingReturns(debitProductInfo, debitEntry.id);

    if (relevantReturns.length === 0) {
      return { hasReturns: false, totalTransferred: transferredQuantity, totalReturned: 0, isComplete: false };
    }

    // 4️⃣ SUMAR cantidades devueltas de forma eficiente
    const totalReturned = relevantReturns.reduce((sum, returnEntry) => {
      return sum + this.extractQuantityFromDescription(returnEntry.description);
    }, 0);

    // 5️⃣ DETERMINAR estado final
    const isComplete = totalReturned >= transferredQuantity;

    return {
      hasReturns: true,
      totalTransferred: transferredQuantity,
      totalReturned: totalReturned,
      isComplete: isComplete
    };
  }

  /**
   * ✅ OPTIMIZACIÓN: Búsqueda eficiente de devoluciones relacionadas
   * Solo procesa entradas relevantes para mantener performance
   */
  private findMatchingReturns(debitProductInfo: { product: string; variant: string }, debitId?: string): LedgerEntry[] {
    // ✅ FILTRADO EN DOS PASOS para mejor performance:

    // Paso 1: Filtrar solo créditos que sean devoluciones
    const returnCandidates = this.ledgerEntries.filter(entry =>
      entry.type === 'credit' &&
      entry.description.toLowerCase().includes('devolución')
    );

    // Paso 2: De los candidatos, buscar coincidencias exactas de producto/variante
    return returnCandidates.filter(returnEntry => {
      const returnProductInfo = this.extractProductInfoOptimized(returnEntry.description);

      // ✅ COMPARACIÓN EXACTA de producto Y variante
      return debitProductInfo.product === returnProductInfo.product &&
        debitProductInfo.variant === returnProductInfo.variant;
    });
  }

  /**
   * ✅ MÉTODO AUXILIAR OPTIMIZADO: Extracción de producto/variante
   * Procesamiento más eficiente con regex compilados
   */
  private extractProductInfoOptimized(description: string): { product: string; variant: string } {
    // ✅ REGEX optimizado
    const PRODUCT_VARIANT_REGEX = /(.+?)\s*\(([^)]+)\)/;
    const CLEAN_PATTERNS = [
      /^.*?\d+\s*x\s*/i,           // "transferencia de 2 x"
      /^transferencia\s+de\s*/i,   // "transferencia de"
      /^devolución\s+de\s*/i       // "devolución de"
    ];

    const match = description.match(PRODUCT_VARIANT_REGEX);

    if (match) {
      let productPart = match[1].toLowerCase().trim();
      const variantPart = match[2].toLowerCase().trim();

      // ✅ LIMPIEZA EFICIENTE con patrones predefinidos
      for (const pattern of CLEAN_PATTERNS) {
        productPart = productPart.replace(pattern, '').trim();
      }

      return {
        product: productPart,
        variant: variantPart
      };
    }

    return { product: description.toLowerCase(), variant: '' };
  }

  /**
   * ✅ MÉTODO AUXILIAR: Extracción de cantidad
   */
  private extractQuantityFromDescription(description: string): number {
    const quantityMatch = description.match(/(\d+)\s*x\s*/i);
    return quantityMatch ? parseInt(quantityMatch[1], 10) || 0 : 1;
  }

  /**
   * ✅ MÉTODO AUXILIAR: Determinación de tag apropiado
   */
  private determineStatusTag(
    isCompleteReturn: boolean,
    isPartialReturn: boolean,
    debitEntry: LedgerEntry,
    correctedRemainingAmount?: number
  ) {
    // Si remainingAmount es 0, determinar si es por devolución completa o pago completo
    if (correctedRemainingAmount !== undefined && correctedRemainingAmount <= 0) {
      if (isCompleteReturn) {
        return { text: 'Devuelto', color: 'green', icon: 'undo' };
      } else {
        // Si no es devolución completa pero remainingAmount es 0, entonces fue pagado
        return { text: 'Pagado', color: 'green', icon: 'check-circle' };
      }
    }

    if (isCompleteReturn) {
      return { text: 'Devuelto', color: 'green', icon: 'undo' };
    } else if (isPartialReturn) {
      return { text: 'Parcial (con devolución)', color: 'orange', icon: 'pie-chart' };
    } else {
      return this.getStatusTag(debitEntry.paymentStatus || 'pending');
    }
  }

  /**
  * ✅ NUEVO: Calcula el remainingAmount correcto considerando devoluciones automáticas
  * Para usar en la columna "Pendiente" de la tabla
  */
  getCorrectedRemainingAmount(entry: LedgerEntry): number {
    // Solo procesar débitos
    if (entry.type !== 'debit') {
      return 0;
    }

    // Buscar devoluciones automáticas relacionadas
    const relatedReturns = this.ledgerEntries.filter(creditEntry => {
      if (creditEntry.type !== 'credit') return false;

      // Solo devoluciones automáticas
      if (!creditEntry.description.toLowerCase().includes('devolución')) {
        return false;
      }

      // Comparar producto/variante
      const debitInfo = this.extractProductInfoOptimized(entry.description);
      const returnInfo = this.extractProductInfoOptimized(creditEntry.description);

      return debitInfo.product === returnInfo.product &&
        debitInfo.variant === returnInfo.variant;
    });

    // Calcular total de devoluciones automáticas
    const totalAutomaticReturns = relatedReturns.reduce((sum, returnEntry) => {
      return sum + returnEntry.amount;
    }, 0);

    // Calcular remainingAmount correcto
    const manualPayments = entry.paidAmount || 0;
    const totalReductions = manualPayments + totalAutomaticReturns;
    const correctedRemaining = Math.max(0, entry.amount - totalReductions);

    return Math.round(correctedRemaining * 100) / 100; // Redondear a 2 decimales
  }

  getTotalReturnsAmount(): number {
    if (!this.ledgerEntries) return 0;

    const total = this.ledgerEntries
      .filter(entry => entry.type === 'credit' &&
        entry.description.toLowerCase().includes('devolución'))
      .reduce((sum, entry) => sum + entry.amount, 0);

    return Math.round(total * 100) / 100; // ✅ Redondear a 2 decimales
  }

  getTotalReturnsCount(): number {
    if (!this.ledgerEntries) return 0;

    return this.ledgerEntries
      .filter(entry => entry.type === 'credit' &&
        entry.description.toLowerCase().includes('devolución'))
      .length;
  }

}