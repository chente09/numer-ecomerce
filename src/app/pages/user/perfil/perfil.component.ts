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
    NzCheckboxModule
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
      phone: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]]
    });

    this.editAddressForm = this.fb.group({
      name: ['', Validators.required],
      address: ['', Validators.required],
      city: ['', Validators.required],
      province: ['', Validators.required],
      postalCode: ['', Validators.required],
      isDefault: [false]
    });
  }
  
  ngOnInit() {
    this.userSubscription = this.usersService.user$.subscribe(user => {
      this.currentUser = user;
      
      if (user) {
        this.loadUserProfile();
        this.loadRecentOrders();
        this.loadAddresses();
      } else {
        // Redirigir al login si no hay usuario
        this.router.navigate(['/welcome']);
      }
    });
  }
  
  async loadUserProfile() {
    try {
      this.loading = true;
      this.userProfile = await this.usersService.getUserProfile();
      
      // Rellenar formulario con datos existentes
      if (this.userProfile) {
        this.profileForm.patchValue({
          firstName: this.userProfile.firstName || '',
          lastName: this.userProfile.lastName || '',
          phone: this.userProfile.phone || ''
        });
      }
    } catch (error) {
      console.error('Error al cargar perfil:', error);
      this.message.error('No se pudo cargar la información del perfil');
    } finally {
      this.loading = false;
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
      // Reemplazar con tu servicio real de direcciones
      setTimeout(() => {
        this.addresses = [
          {
            id: 'addr1',
            name: 'Casa',
            address: 'Calle Principal 123',
            city: 'Quito',
            province: 'Pichincha',
            postalCode: '170150',
            isDefault: true
          },
          {
            id: 'addr2',
            name: 'Trabajo',
            address: 'Av. Amazonas 45',
            city: 'Quito',
            province: 'Pichincha',
            postalCode: '170143',
            isDefault: false
          }
        ];
        this.loadingAddresses = false;
      }, 1000);
    } catch (error) {
      console.error('Error al cargar direcciones:', error);
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
      const userData = {
        ...this.profileForm.value,
        updatedAt: new Date()
      };
      
      // Si es la primera vez que completa el perfil, marcar como completo
      if (!this.userProfile?.profileCompleted) {
        userData.profileCompleted = true;
      }
      
      await this.usersService.saveUserProfile(userData);
      this.editMode = false;
      this.message.success('Perfil actualizado correctamente');
      
      // Recargar perfil para mostrar los cambios
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
        console.log('Actualizar dirección:', { id: this.editingAddress.id, ...addressData });
        
        // Actualiza la lista local para ver cambios inmediatamente
        this.addresses = this.addresses.map(addr => 
          addr.id === this.editingAddress.id 
            ? { ...addr, ...addressData } 
            : addr
        );
        
        // Si esta dirección se marcó como predeterminada, desmarca las demás
        if (addressData.isDefault) {
          this.addresses = this.addresses.map(addr => ({
            ...addr,
            isDefault: addr.id === this.editingAddress.id
          }));
        }
      } else {
        // Creando nueva dirección
        const newId = `addr${Date.now()}`; // Genera un ID único
        const newAddress = {
          id: newId,
          ...addressData
        };
        
        // Si la nueva es predeterminada, desmarca las demás
        if (newAddress.isDefault) {
          this.addresses = this.addresses.map(addr => ({
            ...addr,
            isDefault: false
          }));
        }
        
        // Añade la nueva dirección
        this.addresses = [...this.addresses, newAddress];
      }
      
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
      // Código para eliminar dirección (implementar servicio real)
      console.log('Eliminar dirección:', addressId);
      
      // Actualizar la lista local
      this.addresses = this.addresses.filter(addr => addr.id !== addressId);
      
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
}