import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { Subject, takeUntil } from 'rxjs';
import { Order } from '../../../models/models';
import { CANCEL_REASONS, CancelOrderResult, OrderService, getOrderStatusColor, getOrderStatusLabel } from '../../../services/order/order.service';
import { ReceiptService } from '../../../services/receipt/receipt.service';

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzTableModule,
    NzCardModule,
    NzInputModule,
    NzButtonModule,
    NzIconModule,
    NzTagModule,
    NzSelectModule,
    NzDrawerModule,
    NzTimelineModule,
    NzDividerModule,
    NzEmptyModule,
    NzGridModule,
    NzModalModule
  ],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin-orders.component.css'
})
export class AdminOrdersComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  orders: Order[] = [];
  loading = true;

  statusFilter: string | null = null;
  searchTerm = '';

  selectedOrderId: string | null = null;
  drawerVisible = false;

  /** Phone only: the order whose row is unfolded (one at a time, to keep the list short). */
  expandedId: string | null = null;

  newStatus: string | null = null;
  statusNote = '';
  savingStatus = false;

  trackingCarrier = 'Servientrega';
  trackingNumber = '';
  trackingUrl = '';
  savingTracking = false;

  /** Filter chips show every status; the selector offers only the ones that move the order forward. */
  readonly statusOptions = ['processing', 'shipped', 'delivered', 'cancelled'];
  readonly changeableStatuses = ['processing', 'shipped', 'delivered'];
  /** Pseudo status for the chip "Reembolsos pendientes". */
  readonly refundFilter = 'refund_pending';

  // Cancel order modal
  readonly cancelReasons = CANCEL_REASONS;
  cancelModalVisible = false;
  cancelReason: string | null = null;
  cancelNote = '';
  cancelRestock = true;
  cancelling = false;

  getOrderStatusLabel = getOrderStatusLabel;
  getOrderStatusColor = getOrderStatusColor;

  constructor(
    private orderService: OrderService,
    private message: NzMessageService,
    private modal: NzModalService,
    private receiptService: ReceiptService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.orderService.getAllOrders().pipe(takeUntil(this.destroy$)).subscribe({
      next: orders => {
        this.orders = orders;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.message.error('No se pudieron cargar los pedidos');
        this.cdr.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get filteredOrders(): Order[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.orders.filter(o => {
      if (this.statusFilter === this.refundFilter) {
        if (!this.isRefundPending(o)) return false;
      } else if (this.statusFilter && o.status !== this.statusFilter) {
        return false;
      }
      if (!term) return true;
      return (
        o.orderId?.toLowerCase().includes(term) ||
        o.customerInfo?.name?.toLowerCase().includes(term) ||
        o.customerInfo?.email?.toLowerCase().includes(term) ||
        o.trackingNumber?.toLowerCase().includes(term)
      );
    });
  }

  get selectedOrder(): Order | undefined {
    return this.orders.find(o => o.id === this.selectedOrderId);
  }

  countByStatus(status: string): number {
    return this.orders.filter(o => o.status === status).length;
  }

  // ── Cancellation and refunds ─────────────────────────────────────────────────
  isRefundPending(order: Order): boolean {
    return order.status === 'cancelled' && order.cancellation?.refund?.status === 'manual_pending';
  }

  countRefundPending(): number {
    return this.orders.filter(o => this.isRefundPending(o)).length;
  }

  /** Only customer orders that were paid and not yet delivered; distributor orders never go through Payphone. */
  canCancel(order: Order): boolean {
    return !!order.userId && (order.status === 'processing' || order.status === 'shipped');
  }

  refundText(order: Order): string {
    switch (order.cancellation?.refund?.status) {
      case 'reversed': return 'Cobro reversado en Payphone';
      case 'manual_pending': return 'Pendiente: devolver desde Payphone';
      case 'manual_done': return 'Devuelto manualmente';
      default: return '—';
    }
  }

  /** Payphone only reverses a charge the same day (Ecuador time); the server decides, this only tells the admin. */
  chargedToday(order: Order): boolean {
    const created: any = order.createdAt;
    const date: Date | null = created?.toDate ? created.toDate() : created ? new Date(created) : null;
    if (!date || isNaN(date.getTime())) return false;
    const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return day(date) === day(new Date());
  }

  openCancelModal(order: Order): void {
    this.cancelReason = null;
    this.cancelNote = '';
    // A shipped order is still on its way: the stock only comes back when the package does
    this.cancelRestock = order.status !== 'shipped';
    this.cancelModalVisible = true;
  }

  async confirmCancel(): Promise<void> {
    const order = this.selectedOrder;
    if (!order || !this.cancelReason) return;
    this.cancelling = true;
    try {
      const result = await this.orderService.cancelOrder(order.id, {
        reason: this.cancelReason,
        note: this.cancelNote.trim() || undefined,
        restock: this.cancelRestock
      });
      this.cancelModalVisible = false;
      this.showCancelResult(order, result);
    } catch (error) {
      console.error('Error cancelando el pedido:', error);
      this.message.error(error instanceof Error ? error.message : 'No se pudo cancelar el pedido');
    } finally {
      this.cancelling = false;
      this.cdr.detectChanges();
    }
  }

  private showCancelResult(order: Order, result: CancelOrderResult): void {
    if (result.alreadyCancelled) {
      this.message.info('Este pedido ya estaba cancelado');
      return;
    }
    const cancellation = result.cancellation;
    const refund = cancellation?.refund;
    const total = `$${Number(order.total || 0).toFixed(2)}`;
    const stock = cancellation?.restocked
      ? `El stock volvió al inventario (${cancellation.restockedUnits ?? 0} u.).`
      : 'El stock no se repuso.';
    const mail = result.emailSent
      ? 'Avisamos al cliente por correo.'
      : 'No se pudo avisar al cliente por correo: escríbele por WhatsApp.';

    if (refund?.status === 'reversed') {
      this.modal.success({
        nzTitle: 'Pedido cancelado',
        nzContent: `El cobro de ${total} se reversó automáticamente en Payphone. ${stock} ${mail}`
      });
    } else {
      this.modal.warning({
        nzTitle: 'Pedido cancelado: falta devolver el dinero',
        nzContent: `Abre el panel de Payphone y reembolsa la transacción ${refund?.transactionId ?? '(sin número)'} por ${total}. ` +
          `Cuando lo hagas, márcalo como realizado en este pedido. ${stock} ${mail}`
      });
    }
  }

  confirmRefundDone(order: Order): void {
    this.modal.confirm({
      nzTitle: '¿Ya devolviste el dinero?',
      nzContent: 'Confirma solo si ya reembolsaste esta transacción desde el panel de Payphone. El pedido dejará de aparecer como reembolso pendiente.',
      nzOkText: 'Sí, ya lo devolví',
      nzCancelText: 'Todavía no',
      nzOnOk: async () => {
        try {
          await this.orderService.markRefundDone(order.id);
          this.message.success('Reembolso marcado como realizado');
        } catch (error) {
          console.error('Error marcando el reembolso:', error);
          this.message.error(error instanceof Error ? error.message : 'No se pudo marcar el reembolso');
        } finally {
          this.cdr.detectChanges();
        }
      }
    });
  }

  /** On a phone a tap on the row unfolds its summary; on larger screens it opens the detail as before. */
  onRowClick(order: Order): void {
    if (window.matchMedia('(max-width: 768px)').matches) {
      this.expandedId = this.expandedId === order.id ? null : order.id;
    } else {
      this.openOrder(order);
    }
  }

  openOrder(order: Order): void {
    this.selectedOrderId = order.id;
    this.newStatus = order.status;
    this.statusNote = '';
    this.trackingCarrier = order.trackingCarrier || 'Servientrega';
    this.trackingNumber = order.trackingNumber || '';
    this.trackingUrl = order.trackingUrl || '';
    this.drawerVisible = true;
  }

  async downloadReceipt(order: Order): Promise<void> {
    try {
      await this.receiptService.download(this.receiptService.fromOrder(order));
    } catch (error) {
      console.error('Error generando el comprobante:', error);
      this.message.error('No se pudo generar el comprobante');
    }
  }

  closeDrawer(): void {
    this.drawerVisible = false;
  }

  requestStatusChange(): void {
    const order = this.selectedOrder;
    if (!order || !this.newStatus || this.newStatus === order.status) return;

    // Cancelling goes through "Cancelar pedido" (server side: refund, stock, coupon), never through this selector
    if (this.newStatus === 'cancelled') return;
    this.applyStatusChange(order);
  }

  private async applyStatusChange(order: Order): Promise<void> {
    this.savingStatus = true;
    try {
      await this.orderService.updateOrderStatus(order.id, this.newStatus!, this.statusNote.trim());
      this.message.success(`Estado actualizado: ${getOrderStatusLabel(this.newStatus!)}`);
      this.statusNote = '';
    } catch (error) {
      console.error('Error actualizando estado del pedido:', error);
      this.message.error('No se pudo actualizar el estado del pedido');
    } finally {
      this.savingStatus = false;
      this.cdr.detectChanges();
    }
  }

  /** The guide is already saved: an email problem must not look like a failure to save it. */
  private async notifyCustomerOfShipping(orderId: string, resend: boolean): Promise<void> {
    try {
      const result = await this.orderService.sendShippingEmail(orderId, resend);
      if (result.sent) {
        this.message.success('Se envió el aviso con la guía al cliente');
      } else if (result.skipped === 'ALREADY_SENT') {
        this.message.info('El cliente ya había recibido el aviso de envío');
      } else if (result.reason === 'NOT_CONFIGURED') {
        this.message.warning('Correo no configurado: el cliente no fue avisado por email');
      } else if (result.reason === 'NO_RECIPIENT') {
        this.message.warning('El pedido no tiene correo del cliente: avísale por WhatsApp');
      } else {
        this.message.warning('No se pudo enviar el correo al cliente; avísale por WhatsApp');
      }
    } catch (error) {
      console.error('Error enviando el aviso de envío:', error);
      this.message.warning('No se pudo enviar el correo al cliente; avísale por WhatsApp');
    }
  }

  async saveTracking(): Promise<void> {
    const order = this.selectedOrder;
    const number = this.trackingNumber.trim();
    const carrier = this.trackingCarrier.trim();
    if (!order) return;
    if (!number || !carrier) {
      this.message.warning('Ingresa la transportadora y el número de guía');
      return;
    }

    this.savingTracking = true;
    try {
      const guideChanged = !!order.trackingNumber && order.trackingNumber !== number;
      await this.orderService.setTracking(order.id, number, carrier, this.trackingUrl.trim() || undefined);
      if (order.status === 'processing') {
        await this.orderService.updateOrderStatus(order.id, 'shipped', `Enviado con ${carrier}. Guía: ${number}`);
        this.newStatus = 'shipped';
        this.message.success('Guía guardada y pedido marcado como enviado');
      } else {
        this.message.success('Guía guardada');
      }
      await this.notifyCustomerOfShipping(order.id, guideChanged);
    } catch (error) {
      console.error('Error guardando la guía:', error);
      this.message.error('No se pudo guardar la guía de envío');
    } finally {
      this.savingTracking = false;
      this.cdr.detectChanges();
    }
  }

  formatDate(date: any): string {
    if (!date) return '—';
    const d = date.toDate ? date.toDate() : new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
