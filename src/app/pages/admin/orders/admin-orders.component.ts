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
import { OrderService, getOrderStatusColor, getOrderStatusLabel } from '../../../services/order/order.service';

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

  newStatus: string | null = null;
  statusNote = '';
  savingStatus = false;

  trackingCarrier = 'Servientrega';
  trackingNumber = '';
  trackingUrl = '';
  savingTracking = false;

  readonly statusOptions = ['processing', 'shipped', 'delivered', 'cancelled'];

  getOrderStatusLabel = getOrderStatusLabel;
  getOrderStatusColor = getOrderStatusColor;

  constructor(
    private orderService: OrderService,
    private message: NzMessageService,
    private modal: NzModalService,
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
      if (this.statusFilter && o.status !== this.statusFilter) return false;
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

  openOrder(order: Order): void {
    this.selectedOrderId = order.id;
    this.newStatus = order.status;
    this.statusNote = '';
    this.trackingCarrier = order.trackingCarrier || 'Servientrega';
    this.trackingNumber = order.trackingNumber || '';
    this.trackingUrl = order.trackingUrl || '';
    this.drawerVisible = true;
  }

  closeDrawer(): void {
    this.drawerVisible = false;
  }

  requestStatusChange(): void {
    const order = this.selectedOrder;
    if (!order || !this.newStatus || this.newStatus === order.status) return;

    if (this.newStatus === 'cancelled') {
      this.modal.confirm({
        nzTitle: '¿Cancelar este pedido?',
        nzContent:
          'Cancelar NO devuelve el stock ni reembolsa el pago en Payphone: ambos pasos son manuales. El cliente verá el pedido como cancelado.',
        nzOkText: 'Sí, cancelar',
        nzOkDanger: true,
        nzCancelText: 'Volver',
        nzOnOk: () => this.applyStatusChange(order)
      });
      return;
    }
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
      await this.orderService.setTracking(order.id, number, carrier, this.trackingUrl.trim() || undefined);
      if (order.status === 'processing') {
        await this.orderService.updateOrderStatus(order.id, 'shipped', `Enviado con ${carrier}. Guía: ${number}`);
        this.newStatus = 'shipped';
        this.message.success('Guía guardada y pedido marcado como enviado');
      } else {
        this.message.success('Guía guardada');
      }
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
