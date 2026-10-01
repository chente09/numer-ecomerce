import { Component, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { Observable, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

// Servicios y Modelos
import { DistributorService } from '../../../../services/admin/distributor/distributor.service';
import { Order } from '../../../../models/models'; // Importa tu modelo Order

// Módulos NG-ZORRO
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-distributor-orders-history',
  standalone: true,
  imports: [
    CommonModule,
    NzTableModule,
    NzSpinModule,
    NzTagModule,
    NzEmptyModule,
    NzIconModule
  ],
  templateUrl: './distributor-orders-history.component.html',
  styleUrl: './distributor-orders-history.component.css'
})
export class DistributorOrdersHistoryComponent implements OnInit, OnChanges {
  @Input() distributorId: string | null = null;

  private distributorService = inject(DistributorService);
  private message = inject(NzMessageService);

  orders$: Observable<Order[]> = of([]);
  isLoading = false;
  expandedOrderIds = new Set<string>();

  toggleExpand(orderId: string): void {
    if (this.expandedOrderIds.has(orderId)) {
      this.expandedOrderIds.delete(orderId);
    } else {
      this.expandedOrderIds.add(orderId);
    }
  }

  ngOnInit(): void {
    this.loadOrders();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Si el distributorId cambia (aunque en este panel no cambiará), recargamos
    if (changes['distributorId'] && !changes['distributorId'].isFirstChange()) {
      this.loadOrders();
    }
  }

  loadOrders(): void {
    if (!this.distributorId) return;
    this.isLoading = true;
    this.orders$ = this.distributorService.getDistributorOrders(this.distributorId).pipe(
      catchError(error => {
        console.error('Error cargando historial de pedidos del distribuidor:', error);
        this.message.error('No se pudo cargar el historial de pedidos');
        return of([]);
      }),
      finalize(() => this.isLoading = false)
    );
  }
  
  getStatusTag(status: string): string {
    if (status.includes('pending')) return 'blue';
    if (status.includes('shipped') || status.includes('processing')) return 'processing';
    if (status.includes('delivered') || status.includes('completed')) return 'success';
    if (status.includes('cancelled') || status.includes('error')) return 'error';
    return 'default';
  }
}
