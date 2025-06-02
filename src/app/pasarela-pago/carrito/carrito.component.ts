import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService, CartItem, Cart } from '../services/cart/cart.service';
import { Subscription } from 'rxjs';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { UsersService } from '../../services/users/users.service';
import { User } from '@angular/fire/auth';
import { NzAlertModule } from 'ng-zorro-antd/alert';

@Component({
  selector: 'app-carrito',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzButtonModule,
    NzInputModule,
    NzInputNumberModule,
    NzSpinModule,
    NzTableModule,
    NzToolTipModule,
    NzIconModule,
    NzModalModule,
    NzAlertModule

  ],
  templateUrl: './carrito.component.html',
  styleUrl: './carrito.component.css'
})
export class CarritoComponent implements OnInit, OnDestroy {
  cart: Cart | null = null;
  loading = true;
  updating = false;
  discountCode = '';

  currentUser: User | null = null;
  canCheckout = false;
  checkoutMessage = '';

  // Para seguir la suscripción y poder limpiarla después
  private cartSubscription: Subscription | null = null;

  constructor(
    private cartService: CartService,
    private router: Router,
    private modal: NzModalService,
    private message: NzMessageService,
    private usersService: UsersService
  ) { }

  ngOnInit(): void {
    this.usersService.user$.subscribe(user => {
      this.currentUser = user;
      this.updateCheckoutStatus();
    });

    // Suscribirse al observable del carrito
    this.cartSubscription = this.cartService.cart$.subscribe(
      (cart) => {
        this.cart = cart;
        this.loading = false;
      },
      (error) => {
        console.error('Error al cargar el carrito:', error);
        this.message.error('No se pudo cargar el carrito. Por favor, intenta de nuevo.');
        this.loading = false;
      }
    );
  }

  // Limpiar suscripciones al destruir el componente
  ngOnDestroy(): void {
    if (this.cartSubscription) {
      this.cartSubscription.unsubscribe();
    }
  }

  private updateCheckoutStatus(): void {
    if (!this.currentUser) {
      this.canCheckout = false;
      this.checkoutMessage = 'Inicia sesión para continuar con tu compra';
    } else if (this.currentUser.isAnonymous) {
      this.canCheckout = false;
      this.checkoutMessage = 'Completa tu registro para finalizar la compra';
    } else {
      this.canCheckout = true;
      this.checkoutMessage = '';
    }
  }


  // Actualizar la cantidad de un producto
  async updateQuantity(item: CartItem, quantity: number): Promise<void> {
    if (quantity <= 0) {
      this.removeItem(item);
      return;
    }

    this.updating = true;
    try {
      const success = await this.cartService.updateItemQuantity(item.variantId, quantity);
      if (!success) {
        this.message.warning('No hay suficiente stock disponible para la cantidad solicitada.');
      }
    } catch (error) {
      console.error('Error al actualizar cantidad:', error);
      this.message.error('Error al actualizar la cantidad del producto.');
    } finally {
      this.updating = false;
    }
  }

  // Eliminar un producto
  removeItem(item: CartItem): void {
    this.modal.confirm({
      nzTitle: '¿Eliminar producto?',
      nzContent: `¿Estás seguro de que deseas eliminar ${item.product?.name || 'este producto'} del carrito?`,
      nzOkText: 'Sí, eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.cartService.removeItem(item.variantId);
        this.message.success('Producto eliminado del carrito.');
      },
      nzCancelText: 'Cancelar'
    });
  }

  // Aplicar código de descuento (ejemplo simple)
  applyDiscount(): void {
    if (!this.discountCode.trim()) {
      this.message.warning('Ingresa un código de descuento válido.');
      return;
    }

    // En un caso real, consultarías a un servicio para validar el código
    // Aquí solo simulamos un código fijo "DISCOUNT20" que da 20% de descuento
    if (this.discountCode.toUpperCase() === 'DISCOUNT20') {
      const discountAmount = this.cart ? this.cart.subtotal * 0.2 : 0;
      const success = this.cartService.applyDiscount(this.discountCode, discountAmount);

      if (success) {
        this.message.success(`Código de descuento aplicado: $${discountAmount.toFixed(2)}`);
      } else {
        this.message.error('No se pudo aplicar el descuento.');
      }
    } else {
      this.message.error('Código de descuento inválido.');
    }
  }

  // Vaciar carrito
  clearCart(): void {
    this.modal.confirm({
      nzTitle: 'Vaciar carrito',
      nzContent: '¿Estás seguro de que deseas vaciar tu carrito de compras?',
      nzOkText: 'Sí, vaciar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.cartService.clearCart();
        this.message.info('Tu carrito ha sido vaciado.');
      },
      nzCancelText: 'Cancelar'
    });
  }

  // Proceder al checkout
  async proceedToCheckout(): Promise<void> {
    if (!this.cart || this.cart.items.length === 0) {
      this.message.warning('Tu carrito está vacío.');
      return;
    }

    // Si no puede hacer checkout, redirigir según el caso
    if (!this.canCheckout) {
      if (!this.currentUser) {
        // Redirigir a login con returnUrl
        this.router.navigate(['/welcome'], {
          queryParams: { returnUrl: '/carrito' }
        });
      } else if (this.currentUser.isAnonymous) {
        // Redirigir a completar perfil
        this.router.navigate(['/completar-perfil'], {
          queryParams: { returnUrl: '/carrito' }
        });
      }
      return;
    }

    // Proceder normalmente al pago
    this.router.navigate(['/pago'], {
      queryParams: {
        transId: `order-${Date.now()}`,
        referencia: 'Compra desde carrito'
      }
    });
  }

  // Métodos auxiliares para el template
  redirectToLogin(): void {
    this.router.navigate(['/welcome'], {
      queryParams: { returnUrl: '/carrito' }
    });
  }

  redirectToCompleteProfile(): void {
    this.router.navigate(['/completar-perfil'], {
      queryParams: { returnUrl: '/carrito' }
    });
  }

  // Continuar comprando
  continueShopping(): void {
    this.router.navigate(['/shop']);
  }
}