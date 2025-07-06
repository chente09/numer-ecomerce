import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService, CartItem, Cart } from '../services/cart/cart.service';
import { Subject, takeUntil, firstValueFrom, take, catchError, of, debounceTime, switchMap } from 'rxjs';
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
import { CategoryService } from '../../services/admin/category/category.service';
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
  errorMessage: string | null = null;
  categoryLoadError = false;
  isLoggingIn = false;
  isDistributor = false;

  currentUser: User | null = null;
  canCheckout = false;
  checkoutMessage = '';

  // ✅ CORRECCIÓN: Usar Subject para limpiar suscripciones
  private destroy$ = new Subject<void>();
  private categoryNames: Map<string, string> = new Map();
  private categoriesLoaded = false;
  private updateQuantityDebounced = debounceTime(300);

  constructor(
    private cartService: CartService,
    private router: Router,
    private modal: NzModalService,
    private message: NzMessageService,
    private usersService: UsersService,
    private categoryService: CategoryService
  ) { }

  ngOnInit(): void {

    this.loadCategories();

    // ✅ CORRECCIÓN: Usar takeUntil para evitar memory leaks
    this.usersService.user$.pipe(
      takeUntil(this.destroy$),
      switchMap(user => {
        this.currentUser = user;
        this.updateCheckoutStatus();
        // Si hay usuario, obtenemos sus roles
        // 🛠️ CORRECCIÓN AQUÍ: Especificamos el tipo del array vacío
        return user ? this.usersService.getUserRoles() : of<string[]>([]);
      })
    ).subscribe(roles => {
      // Ahora 'roles' será de tipo string[] y el error desaparecerá
      this.isDistributor = roles.includes('distributor');
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

  private loadCategories(): void {
    this.categoryService.getCategories().pipe(
      take(1),
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('❌ Error cargando categorías:', error);
        this.categoryLoadError = true;
        return of([]); // Continuar con array vacío
      })
    ).subscribe({
      next: (categories) => {
        this.categoryNames.clear();
        categories.forEach(category => {
          this.categoryNames.set(category.id, category.name);
        });
        this.categoriesLoaded = true;
        console.log(`✅ ${categories.length} categorías cargadas`);
      },
      complete: () => {
        this.categoriesLoaded = true;
      }
    });
  }

  // ✅ NUEVO MÉTODO para obtener nombre de categoría
  getCategoryName(item: CartItem): string {
    if (!item?.product?.category) {
      return 'Sin categoría';
    }

    if (!this.categoriesLoaded) {
      return 'Cargando...';
    }

    if (this.categoryLoadError) {
      return item.product.category; // Fallback al ID
    }

    return this.categoryNames.get(item.product.category) || item.product.category;
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

    // ✅ GUARDAR cantidad anterior para reversión
    const previousQuantity = item.quantity;

    // ✅ Validación mejorada de stock
    if (item.variant) {
      const availableStock = item.variant.stock || 0;
      if (quantity > availableStock) {
        this.message.warning(`Solo hay ${availableStock} unidades disponibles`);
        return; // No continuar si excede stock
      }
    }

    this.updating = true;

    try {
      console.log(`🔄 Actualizando cantidad: ${item.product?.name} de ${previousQuantity} a ${quantity}`);

      // ✅ Actualizar optimistamente la UI
      item.quantity = quantity;

      const success = await firstValueFrom(
        this.cartService.updateItemQuantity(item.variantId, quantity)
      );

      if (!success) {
        // ✅ REVERTIR correctamente a la cantidad anterior
        item.quantity = previousQuantity;
        this.message.warning('No hay suficiente stock disponible para la cantidad solicitada.');
      } else {
        this.message.success('Cantidad actualizada correctamente');
      }
    } catch (error) {
      // ✅ REVERTIR en caso de error
      item.quantity = previousQuantity;
      console.error('❌ Error al actualizar cantidad:', error);
      this.message.error('Error al actualizar la cantidad del producto.');
    } finally {
      this.updating = false;
    }
  }

  // Agregar este método al componente
  getVariantImage(item: CartItem): string {
    // 1. Prioridad: Imagen específica de la variante
    if (item.variant?.imageUrl && item.variant.imageUrl.trim()) {
      return item.variant.imageUrl;
    }

    // 2. Fallback: Buscar imagen del color en el producto
    if (item.product?.colors && item.variant?.colorName) {
      const colorMatch = item.product.colors.find(
        color => color.name === item.variant?.colorName
      );
      if (colorMatch?.imageUrl) {
        return colorMatch.imageUrl;
      }
    }

    // 3. Fallback final: Imagen principal del producto
    if (item.product?.imageUrl) {
      return item.product.imageUrl;
    }

    // 4. Imagen por defecto si no hay ninguna
    return this.getDefaultImage();
  }

  private getDefaultImage(): string {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOGY4Ii8+PGcgZmlsbD0iIzk5OSI+PGNpcmNsZSBjeD0iNTAiIGN5PSI0MCIgcj0iMTAiLz48cGF0aCBkPSJtMzAgNzBoNDB2MTBIMzB6Ii8+PC9nPjwvc3ZnPg==';
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
    // 1. Validación inicial unificada
    if (!this.cart || this.cart.items.length === 0) {
      this.message.warning('Tu carrito está vacío.');
      return;
    }
    if (!this.canCheckout) {
      this.message.warning(this.checkoutMessage || 'No cumples los requisitos para proceder.');
      // Redirigir si es necesario
      if (!this.currentUser) this.router.navigate(['/welcome'], { queryParams: { returnUrl: '/carrito' } });
      else if (this.currentUser.isAnonymous) this.router.navigate(['/completar-perfil'], { queryParams: { returnUrl: '/carrito' } });
      return;
    }

    this.processingCheckout = true;

    try {
      // 2. Lógica condicional basada en el rol
      if (this.isDistributor) {
        // --- FLUJO PARA DISTRIBUIDOR ---
        this.message.info('Registrando pedido de distribuidor...');
        const result = await this.cartService.createDistributorOrder();

        if (result.success) {
          this.cartService.clearCart(); // Limpiamos el carrito primero

          // ✅ USAMOS UN MODAL DE ÉXITO EN LUGAR DE REDIRIGIR
          this.modal.success({
            nzTitle: '¡Pedido Registrado Exitosamente!',
            nzContent: `Tu pedido #${result.orderId} ha sido creado. Nos pondremos en contacto para coordinar la entrega.`,
            nzOkText: 'Entendido',
            nzOnOk: () => this.router.navigate(['/shop']) // Opcional: redirigir a la tienda al cerrar
          });
        }

      } else {
        // --- FLUJO PARA CLIENTE NORMAL ---
        for (const item of this.cart.items) {
          const currentVariant = await firstValueFrom(this.cartService.getVariantById(item.variantId));
          if (!currentVariant || currentVariant.stock < item.quantity) {
            throw new Error(`Stock insuficiente para ${item.product?.name}.`);
          }
        }
        this.router.navigate(['/pago']);
      }
    } catch (error: any) {
      console.error('❌ Error en el checkout:', error);
      this.message.error(error.message || 'Ocurrió un error al procesar el pedido.');
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
    if (!item.variant) return 'Sin información';

    const stock = item.variant.stock || 0;

    if (stock === 0) return 'Sin stock';
    if (stock < item.quantity) return `Solo ${stock} disponible`;
    if (stock <= 5) return 'Últimas unidades';
    if (stock <= 10) return 'Stock limitado';

    return 'En stock';
  }

  // ✅ AGREGAR MÉTODO NUEVO para validaciones
  hasValidVariant(item: CartItem): boolean {
    return !!(item.variant && item.variant.stock !== undefined);
  }

  isStockLow(item: CartItem): boolean {
    return !!(item.variant && item.variant.stock > 0 && item.variant.stock <= 5);
  }

  isOutOfStock(item: CartItem): boolean {
    return !item.variant || item.variant.stock === 0;
  }

  // Métodos auxiliares existentes
  async redirectToLogin(): Promise<void> {
    if (this.isLoggingIn) return;

    this.isLoggingIn = true;
    try {
      // Usar persistencia local para mantener la sesión activa entre visitas
      await this.usersService.setLocalPersistence();
      await this.usersService.loginWithGoogle();
      this.message.success('Inicio de sesión exitoso');

      // Registrar la actividad de inicio de sesión
      await this.usersService.logUserActivity('login', 'authentication', { method: 'google' });
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      this.message.error('No se pudo iniciar sesión. Intente nuevamente.');
    } finally {
      this.isLoggingIn = false;
    }
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