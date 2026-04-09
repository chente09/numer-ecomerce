import { Component, OnDestroy, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { User } from '@angular/fire/auth';
import { Subscription } from 'rxjs';

// Ng-Zorro
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';

import { UsersService } from '../../../services/users/users.service';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    NzAvatarModule,
    NzTabsModule,
    NzCardModule,
    NzButtonModule,
    NzFormModule,
    NzInputModule,
    NzGridModule,
    NzSpinModule,
    NzSkeletonModule,
    NzEmptyModule,
    NzTagModule,
    NzModalModule,
    NzDividerModule,
    NzIconModule,
    NzTableModule,
    NzCheckboxModule,
    NzSelectModule,
    NzInputNumberModule
  ],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css'
})
export class PerfilComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  userProfile: any = null;
  loading = true;
  editMode = false;
  profileForm: FormGroup;
  savingProfile = false;

  // Para mostrar pedidos recientes
  recentOrders: any[] = [];
  loadingOrders = true;

  // Para direcciones
  addresses: any[] = [];
  loadingAddresses = true;
  editingAddress: any = null;
  editAddressForm: FormGroup;
  savingAddress = false;

  private userSubscription: Subscription | null = null;

  // Referencia al template del modal
  @ViewChild('addressModalTemplate') addressModalTemplate!: TemplateRef<any>;

  constructor(
    private usersService: UsersService,
    private fb: FormBuilder,
    private router: Router,
    private message: NzMessageService,
    private modal: NzModalService
  ) {
    // Inicializa formularios vacíos
    this.profileForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      phone: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
      birthDate: [''], // 🆕 NUEVO
      documentType: [''], // 🆕 NUEVO
      documentNumber: [''], // 🆕 NUEVO
      alternativePhone: [''], // 🆕 NUEVO
      emergencyContact: [''], // 🆕 NUEVO
      emergencyPhone: [''] // 🆕 NUEVO
    });

    this.editAddressForm = this.fb.group({
      name: ['', Validators.required],
      address: ['', Validators.required],
      city: ['', Validators.required],
      province: ['', Validators.required],
      canton: [''], // 🆕 NUEVO
      neighborhood: [''], // 🆕 NUEVO
      postalCode: ['', Validators.required],
      reference: [''], // 🆕 NUEVO
      isDefault: [false]
    });
  }

  ngOnInit() {
    this.userSubscription = this.usersService.user$.subscribe(user => {
      this.currentUser = user;

      if (!user) {
        // No hay usuario autenticado → redirigir a welcome
        this.message.warning('Debes iniciar sesión para acceder a tu perfil');
        this.router.navigate(['/welcome']);
        return;
      }

      if (user.isAnonymous) {
        // Usuario anónimo → mostrar mensaje para registrarse
        this.loading = false;
        return; // No cargar datos del perfil para usuarios anónimos
      }

      // Usuario registrado → cargar perfil normalmente
      this.loadUserProfile();
      this.loadRecentOrders();
      this.loadAddresses();
    });
  }

  goToWelcome() {
    this.router.navigate(['/welcome']);
  }

  async signUpWithGoogle() {
    try {
      const result = await this.usersService.loginWithGoogle();
      if (result.user) {
        this.message.success('¡Bienvenido! Ahora puedes completar tu perfil.');
        // Después del registro exitoso, los datos se cargarán automáticamente
        // por la suscripción en ngOnInit
      }
    } catch (error) {
      console.error('Error al registrarse con Google:', error);
      this.message.error('No se pudo completar el registro. Intenta nuevamente.');
    }
  }

  async loadUserProfile() {
    try {
      this.loading = true;
      this.userProfile = await this.usersService.getUserProfile();

      if (this.userProfile) {
        // 1. Convertimos de Firebase (Timestamp) a JS Date
        const birthDateObj = this.convertFirebaseDate(this.userProfile.birthDate);

        // 2. Convertimos de JS Date a String "YYYY-MM-DD" para el input HTML
        const birthDateString = this.formatDateToISO(birthDateObj);

        this.profileForm.patchValue({
          firstName: this.userProfile.firstName || '',
          lastName: this.userProfile.lastName || '',
          phone: this.userProfile.phone || '',

          // AQUI ESTA EL CAMBIO CLAVE: Usamos el string formateado
          birthDate: birthDateString,

          documentType: this.userProfile.documentType || '',
          documentNumber: this.userProfile.documentNumber || '',
          alternativePhone: this.userProfile.alternativePhone || '',
          emergencyContact: this.userProfile.emergencyContact || '',
          emergencyPhone: this.userProfile.emergencyPhone || ''
        });
      }
    } catch (error) {
      console.error('Error al cargar perfil:', error);
      this.message.error('No se pudo cargar la información del perfil');
    } finally {
      this.loading = false;
    }
  }

  onInputKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  // Método para el formulario de Perfil
  onProfileInputChange(event: Event, fieldName: string): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (target) {
      this.profileForm.patchValue({
        [fieldName]: target.value
      }, { emitEvent: false });
    }
  }

  // Método para el formulario de Direcciones (Modal)
  onAddressInputChange(event: Event, fieldName: string): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (target) {
      this.editAddressForm.patchValue({
        [fieldName]: target.value
      }, { emitEvent: false });
    }
  }

  // Cargar pedidos recientes (los últimos 5)
  async loadRecentOrders() {
    try {
      this.loadingOrders = true;
      // Reemplazar esto con tu servicio real de órdenes
      setTimeout(() => {
        this.recentOrders = [
          {
            id: 'ORD001',
            date: new Date('2025-05-10'),
            total: 128.99,
            status: 'completed',
            items: 3
          },
          {
            id: 'ORD002',
            date: new Date('2025-05-15'),
            total: 76.50,
            status: 'processing',
            items: 2
          }
        ];
        this.loadingOrders = false;
      }, 1000);
    } catch (error) {
      console.error('Error al cargar pedidos:', error);
      this.loadingOrders = false;
    }
  }

  // Cargar direcciones guardadas
  async loadAddresses() {
    try {
      this.loadingAddresses = true;
      // ✅ CORRECCIÓN: Usar el servicio real
      this.addresses = await this.usersService.getUserAddresses();
    } catch (error) {
      console.error('Error al cargar direcciones:', error);
      this.message.error('No se pudieron cargar las direcciones');
      this.addresses = []; // Array vacío si hay error
    } finally {
      this.loadingAddresses = false;
    }
  }

  // Métodos para información personal
  toggleEditMode() {
    this.editMode = !this.editMode;

    if (!this.editMode) {
      // Restaurar valores originales si se cancela edición
      this.profileForm.patchValue({
        firstName: this.userProfile?.firstName || '',
        lastName: this.userProfile?.lastName || '',
        phone: this.userProfile?.phone || ''
      });
    }
  }

  async saveProfile() {
    if (this.profileForm.invalid) return;

    this.savingProfile = true;

    try {
      // Obtenemos los valores del formulario
      const formValues = this.profileForm.value;

      // Convertimos el string de fecha (YYYY-MM-DD) de vuelta a Objeto Date
      // Solo si el campo tiene valor
      let birthDateToSave = null;
      if (formValues.birthDate) {
        // Al agregar 'T12:00:00' evitamos problemas de zona horaria que a veces restan un día
        birthDateToSave = new Date(formValues.birthDate + 'T12:00:00');
      }

      const userData = {
        ...formValues,
        birthDate: birthDateToSave, // Usamos la fecha convertida
        updatedAt: new Date()
      };

      // Si es la primera vez que completa el perfil, marcar como completo
      if (!this.userProfile?.profileCompleted) {
        userData.profileCompleted = true;
      }

      await this.usersService.saveUserProfile(userData);
      this.editMode = false;
      this.message.success('Perfil actualizado correctamente');

      await this.loadUserProfile();
    } catch (error) {
      console.error('Error al guardar perfil:', error);
      this.message.error('No se pudo guardar la información. Intente nuevamente.');
    } finally {
      this.savingProfile = false;
    }
  }

  // Métodos para direcciones
  openAddAddress() {
    this.editingAddress = null;
    this.editAddressForm.reset({
      name: '',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      isDefault: this.addresses.length === 0 // Primera dirección es predeterminada
    });

    this.modal.create({
      nzTitle: 'Agregar Nueva Dirección',
      nzContent: this.addressModalTemplate,
      nzFooter: [
        {
          label: 'Cancelar',
          onClick: () => this.modal.closeAll()
        },
        {
          label: 'Guardar',
          type: 'primary',
          loading: this.savingAddress,
          disabled: () => this.editAddressForm.invalid,
          onClick: () => this.saveAddress()
        }
      ],
      nzWidth: 600,
      nzMaskClosable: false
    });
  }

  editAddress(address: any) {
    this.editingAddress = address;
    this.editAddressForm.patchValue({
      name: address.name,
      address: address.address,
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      isDefault: address.isDefault
    });

    this.modal.create({
      nzTitle: 'Editar Dirección',
      nzContent: this.addressModalTemplate,
      nzFooter: [
        {
          label: 'Cancelar',
          onClick: () => this.modal.closeAll()
        },
        {
          label: 'Guardar',
          type: 'primary',
          loading: this.savingAddress,
          disabled: () => this.editAddressForm.invalid,
          onClick: () => this.saveAddress()
        }
      ],
      nzWidth: 600,
      nzMaskClosable: false
    });
  }

  async saveAddress() {
    if (this.editAddressForm.invalid) return;

    this.savingAddress = true;

    try {
      const addressData = {
        ...this.editAddressForm.value
      };

      if (this.editingAddress) {
        // Actualizando dirección existente
        await this.usersService.updateUserAddress(this.editingAddress.id, addressData);
      } else {
        // Creando nueva dirección
        await this.usersService.saveUserAddress(addressData);
      }

      // ✅ CORRECCIÓN: Recargar direcciones desde Firebase
      await this.loadAddresses();

      this.modal.closeAll();
      this.message.success('Dirección guardada correctamente');
    } catch (error) {
      console.error('Error al guardar dirección:', error);
      this.message.error('No se pudo guardar la dirección. Intente nuevamente.');
    } finally {
      this.savingAddress = false;
    }
  }

  confirmDeleteAddress(addressId: string) {
    this.modal.confirm({
      nzTitle: '¿Estás seguro de eliminar esta dirección?',
      nzContent: 'Esta acción no se puede deshacer.',
      nzOkText: 'Sí, eliminar',
      nzOkType: 'default',
      nzOnOk: () => this.deleteAddress(addressId),
      nzCancelText: 'Cancelar'
    });
  }

  async deleteAddress(addressId: string) {
    try {
      // ✅ CORRECCIÓN: Usar el servicio real
      await this.usersService.deleteUserAddress(addressId);

      // Recargar direcciones desde Firebase
      await this.loadAddresses();

      this.message.success('Dirección eliminada correctamente');
    } catch (error) {
      console.error('Error al eliminar dirección:', error);
      this.message.error('No se pudo eliminar la dirección. Intente nuevamente.');
    }
  }

  setDefaultAddress(addressId: string) {
    // Actualizar direcciones para establecer una como predeterminada
    console.log('Establecer dirección predeterminada:', addressId);
    this.addresses = this.addresses.map(addr => ({
      ...addr,
      isDefault: addr.id === addressId
    }));
  }

  viewOrderDetails(orderId: string) {
    // Navegar a la página de detalles del pedido
    this.router.navigate(['/mis-pedidos', orderId]);
  }

  ngOnDestroy() {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  convertFirebaseDate(timestamp: any): Date | null {
    if (!timestamp) return null;

    try {
      if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
      }
      if (timestamp instanceof Date) {
        return timestamp;
      }
      if (typeof timestamp === 'string') {
        return new Date(timestamp);
      }
      if (timestamp.seconds !== undefined) {
        return new Date(timestamp.seconds * 1000);
      }
    } catch (error) {
      console.warn('Error convirtiendo timestamp:', error);
    }

    return null;
  }

  // Convierte una fecha JS a formato "YYYY-MM-DD" para input type="date"
  formatDateToISO(date: Date | null): string {
    if (!date) return '';
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2); // Agrega cero inicial
    const day = ('0' + date.getDate()).slice(-2); // Agrega cero inicial
    return `${year}-${month}-${day}`;
  }
}