import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzDividerModule } from 'ng-zorro-antd/divider';

import { UsersService } from '../../../services/users/users.service';
import { OrderService, getOrderStatusLabel, getOrderStatusColor } from '../../../services/order/order.service';
import { Order } from '../../../models/models';

@Component({
  selector: 'app-mis-pedidos',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NzTableModule,
    NzTagModule,
    NzSpinModule,
    NzEmptyModule,
    NzButtonModule,
    NzCardModule,
    NzTimelineModule,
    NzIconModule,
    NzDividerModule
  ],
  templateUrl: './mis-pedidos.component.html',
  styleUrl: './mis-pedidos.component.css'
})
export class MisPedidosComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  orders: Order[] = [];
  selectedOrder: Order | null = null;
  loading = true;
  orderId: string | null = null;

  getOrderStatusLabel = getOrderStatusLabel;
  getOrderStatusColor = getOrderStatusColor;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private usersService: UsersService,
    private orderService: OrderService
  ) {}

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('id');

    this.usersService.user$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      if (!user || user.isAnonymous) {
        this.router.navigate(['/welcome'], { queryParams: { returnUrl: this.router.url } });
        return;
      }

      if (this.orderId) {
        this.loadOrderDetail(this.orderId);
      } else {
        this.loadOrders(user.uid);
      }
    });
  }

  private loadOrders(userId: string): void {
    this.loading = true;
    this.orderService.getOrdersByUser(userId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (orders) => {
        this.orders = orders;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private loadOrderDetail(orderId: string): void {
    this.loading = true;
    this.orderService.getOrderById(orderId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (order) => {
        this.selectedOrder = order || null;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  formatDate(date: any): string {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
