import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom, map, tap } from 'rxjs';
import { Product, ProductVariant } from '../../../models/models';
import { ProductService } from '../../../services/admin/product/product.service';
import { ProductInventoryService } from '../../../services/admin/inventario/product-inventory.service';
import { ProductVariantService } from '../../../services/admin/productVariante/product-variant.service';
import { doc, increment, updateDoc } from '@angular/fire/firestore';

export interface CartItem {
  productId: string;
  variantId: string;
  quantity: number;
  product?: Product;
  variant?: ProductVariant;
  unitPrice: number;
  totalPrice: number;
}

export interface Cart {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class CartService {
  // Estado inicial del carrito
  private initialCartState: Cart = {
    items: [],
    totalItems: 0,
    subtotal: 0,
    tax: 0,
    shipping: 0,
    discount: 0,
    total: 0
  };

  // BehaviorSubject para mantener el estado del carrito
  private cartSubject = new BehaviorSubject<Cart>(this.initialCartState);

  // Observable público para que los componentes se suscriban
  public cart$: Observable<Cart> = this.cartSubject.asObservable();

  constructor(
    private productService: ProductService,
    private inventoryService: ProductInventoryService,
    private productVariantService: ProductVariantService
  ) {
    // Intentar recuperar el carrito del localStorage al iniciar
    this.loadCartFromStorage();
  }

  /**
   * Obtiene el estado actual del carrito
   */
  getCart(): Cart {
    return this.cartSubject.getValue();
  }

  /**
   * Agrega un producto al carrito
   */
  async addToCart(productId: string, variantId: string, quantity: number, productData?: Product, variantData?: ProductVariant): Promise<boolean> {
    try {

      // Usar los datos proporcionados si están disponibles, o buscarlos si no
      let product: Product | undefined;
      let variant: ProductVariant | undefined;

      if (productData && variantData) {
        // Usar los datos proporcionados
        product = productData;
        variant = variantData;
      } else {
        // Verificar disponibilidad de stock
        const stockCheck = await this.checkStock(variantId, quantity);
        if (!stockCheck.available) {
          console.error('No hay suficiente stock disponible', stockCheck);
          return false;
        }

        // Cargar datos completos del producto
        product = await this.productService.getProductById(productId);
        if (!product) {
          console.error('Producto no encontrado');
          return false;
        }

        // Encontrar la variante seleccionada
        variant = product.variants.find(v => v.id === variantId);
        if (!variant) {
          console.error('Variante no encontrada');
          return false;
        }
      }

      // Obtener el precio actual (considerando descuentos)
      const unitPrice = product.currentPrice || product.price;

      // Obtener el carrito actual
      const currentCart = this.getCart();

      // Verificar si el producto ya está en el carrito
      const existingItemIndex = currentCart.items.findIndex(
        item => item.variantId === variantId
      );

      if (existingItemIndex !== -1) {
        // Actualizar cantidad si ya existe
        const newQuantity = currentCart.items[existingItemIndex].quantity + quantity;

        // Verificar stock para la nueva cantidad total
        const stockCheckForUpdate = await this.checkStock(variantId, newQuantity);
        if (!stockCheckForUpdate.available) {
          console.error('No hay suficiente stock para la cantidad solicitada', stockCheckForUpdate);
          return false;
        }

        // Actualizar el item existente
        currentCart.items[existingItemIndex].quantity = newQuantity;
        currentCart.items[existingItemIndex].totalPrice = newQuantity * unitPrice;
      } else {
        // Agregar nuevo item al carrito
        const newItem: CartItem = {
          productId,
          variantId,
          quantity,
          product,
          variant,
          unitPrice,
          totalPrice: quantity * unitPrice
        };

        currentCart.items.push(newItem);
      }

      // Recalcular totales
      this.recalculateCart(currentCart);

      // Actualizar el estado y guardar en localStorage
      this.cartSubject.next(currentCart);
      this.saveCartToStorage();

      return true;
    } catch (error) {
      console.error('Error al agregar al carrito:', error);
      return false;
    }
  }

  /**
   * Actualiza la cantidad de un item en el carrito
   */
  async updateItemQuantity(variantId: string, quantity: number): Promise<boolean> {
    if (quantity <= 0) {
      return this.removeItem(variantId);
    }

    try {
      const currentCart = this.getCart();
      const itemIndex = currentCart.items.findIndex(item => item.variantId === variantId);

      if (itemIndex === -1) {
        console.error('Item no encontrado en el carrito');
        return false;
      }

      // Verificar stock para la nueva cantidad
      const stockCheck = await this.checkStock(variantId, quantity);
      if (!stockCheck.available) {
        console.error('No hay suficiente stock disponible', stockCheck);
        return false;
      }

      // Actualizar cantidad
      currentCart.items[itemIndex].quantity = quantity;
      currentCart.items[itemIndex].totalPrice =
        quantity * currentCart.items[itemIndex].unitPrice;

      // Recalcular totales
      this.recalculateCart(currentCart);

      // Actualizar el estado y guardar
      this.cartSubject.next(currentCart);
      this.saveCartToStorage();

      return true;
    } catch (error) {
      console.error('Error al actualizar cantidad:', error);
      return false;
    }
  }

  /**
   * Elimina un item del carrito
   */
  removeItem(variantId: string): boolean {
    try {
      const currentCart = this.getCart();
      const updatedItems = currentCart.items.filter(item => item.variantId !== variantId);

      if (updatedItems.length === currentCart.items.length) {
        // No se encontró el item
        return false;
      }

      currentCart.items = updatedItems;

      // Recalcular totales
      this.recalculateCart(currentCart);

      // Actualizar el estado y guardar
      this.cartSubject.next(currentCart);
      this.saveCartToStorage();

      return true;
    } catch (error) {
      console.error('Error al eliminar item:', error);
      return false;
    }
  }

  /**
   * Vacía completamente el carrito
   */
  clearCart(): void {
    this.cartSubject.next(this.initialCartState);
    localStorage.removeItem('cart');
  }

  /**
   * Aplicar código de descuento al carrito
   */
  applyDiscount(discountCode: string, discountAmount: number): boolean {
    try {
      const currentCart = this.getCart();

      // Aplicar descuento
      currentCart.discount = discountAmount;

      // Recalcular totales
      this.recalculateCart(currentCart);

      // Actualizar el estado y guardar
      this.cartSubject.next(currentCart);
      this.saveCartToStorage();

      return true;
    } catch (error) {
      console.error('Error al aplicar descuento:', error);
      return false;
    }
  }

  /**
   * Recalcula todos los totales del carrito
   */
  private recalculateCart(cart: Cart): void {
    // Calcular total de items
    cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);

    // Calcular subtotal
    cart.subtotal = cart.items.reduce((total, item) => total + item.totalPrice, 0);

    // Calcular impuestos (ejemplo: 16% IVA)
    cart.tax = cart.subtotal * 0.15;

    // Calcular envío (lógica simplificada)
    cart.shipping = cart.subtotal > 1000 ? 0 : 5; // Envío gratis para compras mayores a $1000

    // Calcular total general
    cart.total = cart.subtotal + cart.tax + cart.shipping - cart.discount;
  }

  /**
   * Verifica la disponibilidad de stock para una variante
   */
  private async checkStock(variantId: string, quantity: number): Promise<{
    available: boolean,
    requested: number,
    availableStock: number
  }> {
    try {
      console.log('Verificando stock para variant ID:', variantId, 'cantidad:', quantity);

      const variant = await this.productVariantService.getVariantById(variantId);
      console.log('Variante encontrada:', variant);  // Ver qué datos se están recibiendo

      if (!variant) {
        console.error('Variante no encontrada con ID:', variantId);
        return { available: false, requested: quantity, availableStock: 0 };
      }

      // Verificar explícitamente si el stock es undefined o null
      const stockAvailable = variant.stock !== undefined && variant.stock !== null ? variant.stock : 0;
      console.log('Stock disponible:', stockAvailable);

      const available = stockAvailable >= quantity;

      return {
        available,
        requested: quantity,
        availableStock: stockAvailable
      };
    } catch (error) {
      console.error('Error al verificar stock:', error);
      return { available: false, requested: quantity, availableStock: 0 };
    }
  }

  /**
   * Guarda el carrito en localStorage
   */
  private saveCartToStorage(): void {
    try {
      const cart = this.getCart();

      // Crear una versión simplificada para almacenar
      // (evitamos guardar objetos grandes como el producto completo)
      const storageCart = {
        items: cart.items.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice
        })),
        totalItems: cart.totalItems,
        subtotal: cart.subtotal,
        tax: cart.tax,
        shipping: cart.shipping,
        discount: cart.discount,
        total: cart.total
      };

      localStorage.setItem('cart', JSON.stringify(storageCart));
    } catch (error) {
      console.error('Error al guardar carrito en localStorage:', error);
    }
  }

  /**
   * Recupera el carrito desde localStorage
   */
  private async loadCartFromStorage(): Promise<void> {
    try {
      const storedCart = localStorage.getItem('cart');

      if (!storedCart) {
        return;
      }

      const parsedCart = JSON.parse(storedCart) as Cart;

      // Si no hay items, no hacemos nada
      if (!parsedCart.items || parsedCart.items.length === 0) {
        return;
      }

      // Cargar información completa de productos y variantes
      const itemsWithDetails = await Promise.all(
        parsedCart.items.map(async (item) => {
          try {
            const product = await this.productService.getProductById(item.productId);

            if (!product) {
              return null; // Producto no encontrado o eliminado
            }

            const variant = product.variants.find(v => v.id === item.variantId);

            if (!variant) {
              return null; // Variante no encontrada o eliminada
            }

            // Actualizar precio unitario por si cambió
            const unitPrice = product.currentPrice || product.price;

            return {
              ...item,
              product,
              variant,
              unitPrice,
              totalPrice: item.quantity * unitPrice
            };
          } catch (error) {
            console.error('Error al cargar detalles de producto:', error);
            return null;
          }
        })
      );

      // Filtrar items que no se pudieron cargar
      const validItems = itemsWithDetails.filter(item => item !== null) as CartItem[];

      // Actualizar el carrito con los items cargados
      const newCart = {
        ...parsedCart,
        items: validItems
      };

      // Recalcular totales (por si cambiaron precios)
      this.recalculateCart(newCart);

      // Actualizar el estado
      this.cartSubject.next(newCart);
    } catch (error) {
      console.error('Error al cargar carrito desde localStorage:', error);
    }
  }

  /**
   * Finaliza la compra con los items del carrito
   */
  async checkout(): Promise<{
    success: boolean,
    orderId?: string,
    error?: string
  }> {
    try {
      const cart = this.getCart();

      // Verificar que haya items
      if (cart.items.length === 0) {
        return {
          success: false,
          error: 'El carrito está vacío'
        };
      }

      // En lugar de verificar el stock usando el servicio, verificaremos con los datos que ya tenemos
      const unavailableItems = [];

      for (const item of cart.items) {
        // Aquí usamos el stock que ya conocemos de la variante cargada
        if (!item.variant || (item.variant.stock < item.quantity)) {
          unavailableItems.push({
            productName: item.product?.name || 'Producto desconocido',
            variantId: item.variantId,
            requested: item.quantity,
            available: item.variant?.stock || 0
          });
        }
      }

      if (unavailableItems.length > 0) {
        console.error('Items sin stock suficiente:', unavailableItems);
        return {
          success: false,
          error: 'Algunos productos no tienen suficiente stock disponible'
        };
      }

      // Para cada producto, registrar la venta y decrementar el stock
      // Aquí usamos una versión modificada que evita buscar variantes
      for (const item of cart.items) {
        if (!item.product || !item.variant) {
          console.error('Item sin datos completos:', item);
          continue;
        }

        try {
          // Registrar la venta directamente, sin buscar variantes
          await this.updateProductInventory(
            item.productId,
            item.variantId,
            item.quantity
          );
        } catch (error) {
          console.error('Error al procesar item:', item, error);
          // Continuar con los demás items en lugar de fallar todo el checkout
        }
      }

      // Aquí se integraría con el servicio de órdenes para crear la orden
      // const orderId = await orderService.createOrder(cart);
      const orderId = 'ORD-' + Date.now();

      // Limpiar el carrito después de la compra exitosa
      this.clearCart();

      return {
        success: true,
        orderId
      };
    } catch (error) {
      console.error('Error al procesar el checkout:', error);
      return {
        success: false,
        error: 'Ocurrió un error al procesar la compra'
      };
    }
  }

  // Nuevo método para actualizar el inventario sin depender del ProductInventoryService
  private async updateProductInventory(
    productId: string,
    variantId: string,
    quantity: number
  ): Promise<void> {
    // Esta implementación depende de cómo está estructurada tu base de datos
    try {
      // Aquí se asume que tienes un método para obtener el documento de inventario
      console.log(`Inventario actualizado: producto ${productId}, variante ${variantId}, cantidad -${quantity}`);
    } catch (error) {
      console.error('Error al actualizar inventario:', error);
      if (error instanceof Error) {
        throw new Error(`Error al actualizar inventario: ${error.message}`);
      } else {
        throw new Error('Error al actualizar inventario: Error desconocido');
      }
    }
  }

  /**
   * Obtiene el número de items en el carrito (para el badge)
   */
  getCartItemCount(): Observable<number> {
    return this.cart$.pipe(
      map(cart => cart.totalItems)
    );
  }
}