import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { firstValueFrom, take } from 'rxjs';
import { OrderService } from '../../../services/order/order.service';
import { Order } from '../../../models/models';
import {
  SalesSummary, buildRange, changePercent, previousRange, summarize, DateRange
} from './sales-stats';

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';

@Component({
  selector: 'app-admin-sales',
  standalone: true,
  imports: [CommonModule, FormsModule, NzSpinModule],
  templateUrl: './admin-sales.component.html',
  styleUrl: './admin-sales.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminSalesComponent implements OnInit {
  private orderService = inject(OrderService);
  private cdr = inject(ChangeDetectorRef);

  readonly presets: { id: Preset; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: '7d', label: '7 días' },
    { id: '30d', label: '30 días' },
    { id: 'month', label: 'Este mes' },
    { id: 'custom', label: 'Personalizado' }
  ];

  loading = true;
  preset: Preset = '30d';
  customFrom = '';
  customTo = '';

  summary: SalesSummary | null = null;
  previous: SalesSummary | null = null;
  maxDayRevenue = 0;
  range: DateRange = buildRange('30d', Date.now());

  private orders: Order[] = [];

  async ngOnInit(): Promise<void> {
    try {
      this.orders = await firstValueFrom(this.orderService.getAllOrders().pipe(take(1)));
    } finally {
      this.loading = false;
      this.recalculate();
    }
  }

  selectPreset(preset: Preset): void {
    this.preset = preset;
    this.recalculate();
  }

  recalculate(): void {
    this.range = buildRange(this.preset, Date.now(), this.customFrom, this.customTo);
    this.summary = summarize(this.orders, this.range);
    this.previous = summarize(this.orders, previousRange(this.range));
    this.maxDayRevenue = Math.max(0, ...this.summary.byDay.map(d => d.revenue));
    this.cdr.markForCheck();
  }

  barHeight(revenue: number): number {
    return this.maxDayRevenue ? Math.max(2, Math.round((revenue / this.maxDayRevenue) * 100)) : 0;
  }

  /** Show every Nth label so a 30-day chart stays readable */
  showLabel(index: number, total: number): boolean {
    return total <= 10 || index % Math.ceil(total / 10) === 0;
  }

  change(current: number, previous: number | undefined): number | null {
    return changePercent(current, previous ?? 0);
  }
}
