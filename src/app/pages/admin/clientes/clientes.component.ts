import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { firstValueFrom } from 'rxjs';
import { Order } from '../../../models/models';
import { OrderService } from '../../../services/order/order.service';
import { UserProfile, UsersService } from '../../../services/users/users.service';

const BIRTHDAY_SOON_DAYS = 30;

interface CustomerRow {
  user: UserProfile;
  name: string;
  email: string;
  phone: string;
  birthday: Date | null;
  daysToBirthday: number | null;
  subscribed: boolean;
  profileCompleted: boolean;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
}

type QuickFilter = 'all' | 'birthday' | 'subscribed' | 'buyers' | 'noPurchase';

@Component({
  selector: 'app-clientes',
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
    NzAvatarModule,
    NzGridModule,
    NzEmptyModule,
    NzSelectModule,
    NzStatisticModule,
    NzToolTipModule
  ],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.css'
})
export class ClientesComponent implements OnInit {
  rows: CustomerRow[] = [];
  searchTerm = '';
  quickFilter: QuickFilter = 'all';
  loading = true;

  readonly birthdayWindow = BIRTHDAY_SOON_DAYS;

  constructor(
    private usersService: UsersService,
    private orderService: OrderService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadCustomers();
  }

  async loadCustomers(): Promise<void> {
    this.loading = true;
    try {
      const [users, orders, subscribedEmails] = await Promise.all([
        firstValueFrom(this.usersService.getUsers('customer')),
        firstValueFrom(this.orderService.getAllOrders()),
        this.usersService.getActiveNewsletterEmails().catch(() => new Set<string>())
      ]);
      this.rows = this.buildRows(users, orders, subscribedEmails);
    } catch (error) {
      console.error('Error cargando clientes:', error);
      this.message.error('No se pudo cargar la lista de clientes');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private buildRows(users: UserProfile[], orders: Order[], subscribedEmails: Set<string>): CustomerRow[] {
    const byUser = new Map<string, { count: number; spent: number; last: Date | null }>();
    for (const order of orders) {
      if (!order.userId || order.status === 'cancelled') continue;
      const entry = byUser.get(order.userId) || { count: 0, spent: 0, last: null };
      entry.count++;
      entry.spent += order.total || 0;
      const created = this.toDate(order.createdAt);
      if (created && (!entry.last || created > entry.last)) entry.last = created;
      byUser.set(order.userId, entry);
    }

    return users.map(user => {
      const stats = byUser.get(user.uid);
      const birthday = this.toDate(user.birthDate);
      const email = (user.email || '').toLowerCase().trim();
      return {
        user,
        name: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Sin nombre',
        email: user.email || '',
        phone: user.phone || '',
        birthday,
        daysToBirthday: birthday ? this.daysUntilNextBirthday(birthday) : null,
        subscribed: !!email && subscribedEmails.has(email),
        profileCompleted: !!user.profileCompleted,
        ordersCount: stats?.count || 0,
        totalSpent: Math.round((stats?.spent || 0) * 100) / 100,
        lastOrderAt: stats?.last || null
      };
    });
  }

  get filteredRows(): CustomerRow[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.rows.filter(r => {
      switch (this.quickFilter) {
        case 'birthday':
          if (r.daysToBirthday === null || r.daysToBirthday > BIRTHDAY_SOON_DAYS) return false;
          break;
        case 'subscribed':
          if (!r.subscribed) return false;
          break;
        case 'buyers':
          if (r.ordersCount === 0) return false;
          break;
        case 'noPurchase':
          if (r.ordersCount > 0) return false;
          break;
      }
      if (!term) return true;
      return (
        r.name.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term) ||
        r.phone.toLowerCase().includes(term)
      );
    });
  }

  get totalCustomers(): number { return this.rows.length; }
  get buyersCount(): number { return this.rows.filter(r => r.ordersCount > 0).length; }
  get subscribedCount(): number { return this.rows.filter(r => r.subscribed).length; }
  get upcomingBirthdays(): number {
    return this.rows.filter(r => r.daysToBirthday !== null && r.daysToBirthday <= BIRTHDAY_SOON_DAYS).length;
  }

  sortByBirthday = (a: CustomerRow, b: CustomerRow) =>
    (a.daysToBirthday ?? 9999) - (b.daysToBirthday ?? 9999);
  sortByOrders = (a: CustomerRow, b: CustomerRow) => a.ordersCount - b.ordersCount;
  sortBySpent = (a: CustomerRow, b: CustomerRow) => a.totalSpent - b.totalSpent;

  birthdayLabel(row: CustomerRow): string {
    if (!row.birthday) return '—';
    return row.birthday.toLocaleDateString('es-EC', { day: 'numeric', month: 'long' });
  }

  birthdayCountdown(row: CustomerRow): string {
    const days = row.daysToBirthday;
    if (days === null || days > BIRTHDAY_SOON_DAYS) return '';
    if (days === 0) return '¡Hoy!';
    if (days === 1) return 'Mañana';
    return `En ${days} días`;
  }

  formatDate(value: Date | null): string {
    if (!value) return '—';
    return value.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    const d = value.toDate ? value.toDate() : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  private daysUntilNextBirthday(birthday: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let next = new Date(today.getFullYear(), birthday.getMonth(), birthday.getDate());
    if (next < today) next = new Date(today.getFullYear() + 1, birthday.getMonth(), birthday.getDate());
    return Math.round((next.getTime() - today.getTime()) / 86400000);
  }
}
