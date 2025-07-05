import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { Subject, takeUntil } from 'rxjs';
import { UserProfile, UsersService } from '../../../services/users/users.service';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';

// 🆕 Importar Timestamp y FieldValue desde Firebase Firestore
import { Timestamp, FieldValue } from '@angular/fire/firestore'; 

@Component({
  selector: 'app-user-roles-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzTableModule,
    NzCardModule,
    NzInputModule,
    NzButtonModule,
    NzIconModule,
    NzSpinModule,
    NzTagModule,
    NzSelectModule,
    NzPopconfirmModule,
    NzGridModule,
    NzToolTipModule,
    NzAvatarModule,
    NzModalModule
  ],
  templateUrl: './user-roles-management.component.html',
  styleUrls: ['./user-roles-management.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserRolesManagementComponent implements OnInit, OnDestroy {
  users: UserProfile[] = [];
  loading = false;
  searchTerm = '';
  selectedRoleFilter: string | null = null;
  availableRoles: string[] = ['customer', 'admin', 'distributor']; // Roles que puedes asignar/filtrar

  private destroy$ = new Subject<void>();

  constructor(
    private usersService: UsersService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef,
    private modal: NzModalService
  ) { }

  ngOnInit(): void {
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadUsers(): void {
    this.loading = true;
    this.usersService.getUsers(this.selectedRoleFilter || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) => {
          this.users = users;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error al cargar usuarios:', error);
          this.message.error('Error al cargar usuarios: ' + (error.message || 'Error desconocido'));
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
  }

  applyFilters(): void {
    this.loadUsers();
  }

  toggleDistributorRole(user: UserProfile): void {
    const newRoles = new Set(user.roles);
    if (newRoles.has('distributor')) {
      newRoles.delete('distributor');
    } else {
      newRoles.add('distributor');
    }
    this.updateUserRoles(user.uid, Array.from(newRoles));
  }

  toggleAdminRole(user: UserProfile): void {
    const newRoles = new Set(user.roles);
    if (newRoles.has('admin')) {
      newRoles.delete('admin');
    } else {
      newRoles.add('admin');
    }
    this.updateUserRoles(user.uid, Array.from(newRoles));
  }

  private updateUserRoles(uid: string, newRoles: string[]): void {
    this.loading = true;
    this.usersService.updateUserRoles(uid, newRoles)
      .then(() => {
        this.message.success('Roles actualizados correctamente.');
        this.loadUsers();
      })
      .catch(error => {
        console.error('Error al actualizar roles:', error);
        this.message.error('Error al actualizar roles: ' + (error.message || 'Error desconocido'));
        this.loading = false;
        this.cdr.detectChanges();
      });
  }

  deleteUser(uid: string): void {
    this.modal.confirm({
      nzTitle: '¿Eliminar usuario?',
      nzContent: 'Esta acción no se puede deshacer.',
      nzOkText: 'Eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.loading = true;
        this.usersService.deleteRegister(uid)
          .then(() => {
            this.message.success('Usuario eliminado correctamente.');
            this.loadUsers();
          })
          .catch(error => {
            console.error('Error al eliminar usuario:', error);
            this.message.error('Error al eliminar usuario: ' + (error.message || 'Error desconocido'));
            this.loading = false;
            this.cdr.detectChanges();
          });
      }
    });
  }

  get filteredUsers(): UserProfile[] {
    if (!this.searchTerm.trim()) {
      return this.users;
    }
    const term = this.searchTerm.toLowerCase().trim();
    return this.users.filter(user =>
      (user.displayName?.toLowerCase().includes(term)) ||
      (user.email?.toLowerCase().includes(term)) ||
      (user.firstName?.toLowerCase().includes(term)) ||
      (user.lastName?.toLowerCase().includes(term))
    );
  }

  getRoleColor(role: string): string {
    switch (role) {
      case 'admin': return 'red';
      case 'distributor': return 'blue';
      case 'customer': return 'green';
      default: return 'default';
    }
  }

  // 🆕 UTILIDAD: Formatear fecha (ahora espera Timestamp | Date | FieldValue)
  formatDate(date: Timestamp | Date | FieldValue | undefined | null): string {
    if (!date) return '';

    // Si es un FieldValue, no podemos formatearlo. Retornar una cadena vacía o un placeholder.
    // En teoría, esto no debería suceder al leer de Firestore si serverTimestamp() se resolvió.
    if (typeof date === 'object' && date !== null && 'seconds' in date && 'nanoseconds' in date) {
      // Es un objeto que se parece a Timestamp (podría ser Timestamp o un objeto plano)
      const d = (date instanceof Timestamp) ? date.toDate() : new Date((date as any).seconds * 1000);
      return new Intl.DateTimeFormat('es-ES', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
      }).format(d);
    } else if (date instanceof Date) {
      // Es un objeto Date
      return new Intl.DateTimeFormat('es-ES', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
      }).format(date);
    } else if (typeof date === 'object' && date !== null && (date as any)._methodName) {
      // Es un FieldValue (como deleteField() o serverTimestamp() sin resolver)
      return 'Pendiente...'; // O cualquier string que indique que el valor no está listo
    }
    
    // Fallback para cualquier otro tipo inesperado
    return ''; 
  }
}
