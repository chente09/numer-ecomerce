import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService, CartItem, Cart } from '../services/cart/cart.service';
import { Subject, takeUntil, firstValueFrom, take } from 'rxjs';
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
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';

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
    NzAlertModule,
    NzTagModule,
    NzDividerModule
  ],
  templateUrl: './carrito.component.html',
  styleUrl: './carrito.component.css'
})
export class CarritoComponent implements OnInit, OnDestroy {
  cart: Cart | null = null;
  loading = true;
  updating = false;
  discountCode = '';
  processingCheckout = false;

  currentUser: User | null = null;
  canCheckout = false;
  checkoutMessage = '';

  // ✅ CORRECCIÓN: Usar Subject para limpiar suscripciones
  private destroy$ = new Subject<void>();

  constructor(
    private cartService: CartService,
    private router: Router,
    private modal: NzModalService,
    private message: NzMessageService,
    private usersService: UsersService
  ) { }

  ngOnInit(): void {
    // ✅ CORRECCIÓN: Usar takeUntil para evitar memory leaks
    this.usersService.user$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(user => {
      this.currentUser = user;
      this.updateCheckoutStatus();
    });

    // ✅ CORRECCIÓN: Usar takeUntil para la suscripción del carrito
    this.cartService.cart$.pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (cart) => {
        this.cart = cart;
        this.loading = false;
        console.log('🛒 Carrito actualizado:', cart);
      },
      error: (error) => {
        console.error('❌ Error al cargar el carrito:', error);
        this.message.error('No se pudo cargar el carrito. Por favor, intenta de nuevo.');
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    // ✅ CORRECCIÓN: Limpiar todas las suscripciones
    this.destroy$.next();
    this.destroy$.complete();
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

  // ✅ CORRECCIÓN: Usar firstValueFrom para convertir Observable a Promise
  async updateQuantity(item: CartItem, quantity: number): Promise<void> {
    if (quantity <= 0) {
      this.removeItem(item);
      return;
    }

    this.updating = true;
    try {
      console.log(`🔄 Actualizando cantidad: ${item.product?.name} a ${quantity}`);

      // ✅ CORRECCIÓN: Convertir Observable a Promise correctamente
      const success = await firstValueFrom(
        this.cartService.updateItemQuantity(item.variantId, quantity)
      );

      if (!success) {
        this.message.warning('No hay suficiente stock disponible para la cantidad solicitada.');
        // Revertir cantidad en la UI
        item.quantity = item.quantity; // Mantener cantidad anterior
      } else {
        this.message.success('Cantidad actualizada correctamente');
      }
    } catch (error) {
      console.error('❌ Error al actualizar cantidad:', error);
      this.message.error('Error al actualizar la cantidad del producto.');
    } finally {
      this.updating = false;
    }
  }

  // ✅ CORRECCIÓN: Usar firstValueFrom para removeItem
  removeItem(item: CartItem): void {
    this.modal.confirm({
      nzTitle: '¿Eliminar producto?',
      nzContent: `¿Estás seguro de que deseas eliminar "${item.product?.name || 'este producto'}" del carrito?`,
      nzOkText: 'Sí, eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: async () => {
        try {
          console.log(`🗑️ Eliminando producto: ${item.product?.name}`);

          const success = await firstValueFrom(
            this.cartService.removeItem(item.variantId)
          );

          if (success) {
            this.message.success('Producto eliminado del carrito.');
          } else {
            this.message.error('No se pudo eliminar el producto.');
          }
        } catch (error) {
          console.error('❌ Error al eliminar producto:', error);
          this.message.error('Error al eliminar el producto.');
        }
      },
      nzCancelText: 'Cancelar'
    });
  }

  // ✅ MEJORADO: Lógica de descuento más robusta
  applyDiscount(): void {
    if (!this.discountCode.trim()) {
      this.message.warning('Ingresa un código de descuento válido.');
      return;
    }

    if (!this.cart) {
      this.message.error('No hay productos en el carrito.');
      return;
    }

    console.log(`💰 Aplicando código de descuento: ${this.discountCode}`);

    // ✅ MEJORADO: Múltiples códigos de descuento
    const validCodes = {
      'DISCOUNT20': { percentage: 20, minAmount: 50 },
      'WELCOME10': { percentage: 10, minAmount: 0 },
      'SAVE15': { percentage: 15, minAmount: 100 }
    };

    const code = this.discountCode.toUpperCase();
    const discountInfo = validCodes[code as keyof typeof validCodes];

    if (discountInfo) {
      if (this.cart.subtotal < discountInfo.minAmount) {
        this.message.warning(`Este código requiere una compra mínima de $${discountInfo.minAmount}.`);
        return;
      }

      const discountAmount = this.cart.subtotal * (discountInfo.percentage / 100);
      const success = this.cartService.applyDiscount(this.discountCode, discountAmount);

      if (success) {
        this.message.success(`✅ Código aplicado: ${discountInfo.percentage}% de descuento ($${discountAmount.toFixed(2)})`);
        this.discountCode = ''; // Limpiar campo
      } else {
        this.message.error('No se pudo aplicar el descuento.');
      }
    } else {
      this.message.error('Código de descuento inválido.');
    }
  }

  clearCart(): void {
    this.modal.confirm({
      nzTitle: 'Vaciar carrito',
      nzContent: '¿Estás seguro de que deseas vaciar tu carrito de compras? Esta acción no se puede deshacer.',
      nzOkText: 'Sí, vaciar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        console.log('🧹 Vaciando carrito...');
        this.cartService.clearCart();
        this.message.info('Tu carrito ha sido vaciado.');
      },
      nzCancelText: 'Cancelar'
    });
  }

  // ✅ NUEVA IMPLEMENTACIÓN: Checkout completo con descuento de inventario
  async proceedToCheckout(): Promise<void> {
    if (!this.cart || this.cart.items.length === 0) {
      this.message.warning('Tu carrito está vacío.');
      return;
    }

    if (!this.canCheckout) {
      if (!this.currentUser) {
        this.router.navigate(['/welcome'], {
          queryParams: { returnUrl: '/carrito' }
        });
      } else if (this.currentUser.isAnonymous) {
        this.router.navigate(['/completar-perfil'], {
          queryParams: { returnUrl: '/carrito' }
        });
      }
      return;
    }

    this.processingCheckout = true;

    try {
      console.log('🛒 Validando stock disponible para checkout...');

      // ✅ SOLO VALIDAR disponibilidad (sin descontar)
      for (const item of this.cart.items) {
        // Verificar stock en tiempo real
        const currentVariant = await firstValueFrom(
          this.cartService['productService'].getVariantById(item.variantId).pipe(take(1))
        );

        if (!currentVariant || currentVariant.stock < item.quantity) {
          throw new Error(`❌ Stock insuficiente para ${item.product?.name}. Disponible: ${currentVariant?.stock || 0}, Solicitado: ${item.quantity}`);
        }
      }

      // ✅ VALIDACIÓN EXITOSA: Redirigir al proceso de pago
      console.log('✅ Stock validado, redirigiendo al pago...');

      this.router.navigate(['/pago'], {
        queryParams: {
          transId: `order-${Date.now()}`,
          referencia: 'Compra desde carrito'
        }
      });

    } catch (error: any) {
      console.error('❌ Error en validación:', error);

      this.modal.error({
        nzTitle: 'Problema con el stock',
        nzContent: error.message || 'Algunos productos no tienen suficiente stock disponible.',
        nzOkText: 'Revisar carrito'
      });
    } finally {
      this.processingCheckout = false;
    }
  }

  // ✅ NUEVO: Verificar si un item tiene stock suficiente
  hasValidStock(item: CartItem): boolean {
    return !!(item.variant && item.variant.stock >= item.quantity);
  }

  // ✅ NUEVO: Obtener mensaje de stock
  getStockMessage(item: CartItem): string {
    if (!item.variant) return 'Sin información de stock';

    if (item.variant.stock === 0) {
      return 'Sin stock';
    } else if (item.variant.stock < item.quantity) {
      return `Solo ${item.variant.stock} disponible${item.variant.stock === 1 ? '' : 's'}`;
    } else if (item.variant.stock <= 5) {
      return 'Últimas unidades';
    }
    return 'En stock';
  }

  // Métodos auxiliares existentes
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

  continueShopping(): void {
    this.router.navigate(['/shop']);
  }

  // ✅ NUEVO: Método para calcular ahorros
  getTotalSavings(): number {
    if (!this.cart) return 0;
    return this.cart.discount;
  }

  // ✅ NUEVO: Verificar si el carrito tiene descuentos
  hasDiscounts(): boolean {
    return this.getTotalSavings() > 0;
  }

  // ✅ NUEVO: TrackBy function para optimizar rendimiento
  trackByVariantId(index: number, item: CartItem): string {
    return item.variantId;
  }

  // ✅ NUEVO: Manejar errores de imagen
  handleImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOGY4Ii8+PGcgZmlsbD0iIzk5OSI+PGNpcmNsZSBjeD0iNTAiIGN5PSI0MCIgcj0iMTAiLz48cGF0aCBkPSJtMzAgNzBoNDB2MTBIMzB6Ii8+PC9nPjwvc3ZnPg==';
    }
  }
}