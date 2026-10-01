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
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { firstValueFrom } from 'rxjs';
import { UserProfile, UsersService } from '../../../services/users/users.service';

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
    NzEmptyModule
  ],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.css'
})
export class ClientesComponent implements OnInit {
  customers: UserProfile[] = [];
  filteredCustomers: UserProfile[] = [];
  searchTerm = '';
  loading = true;

  constructor(
    private usersService: UsersService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadCustomers();
  }

  async loadCustomers(): Promise<void> {
    this.loading = true;
    try {
      this.customers = await firstValueFrom(this.usersService.getUsers('customer'));
      this.applyFilter();
    } catch (error) {
      console.error('Error cargando clientes:', error);
      this.message.error('No se pudo cargar la lista de clientes');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredCustomers = this.customers;
      return;
    }
    this.filteredCustomers = this.customers.filter(c =>
      c.displayName?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term)
    );
  }

  formatDate(value: any): string {
    if (!value) return '—';
    const d = value.toDate ? value.toDate() : new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  displayName(user: UserProfile): string {
    return user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Sin nombre';
  }
}
