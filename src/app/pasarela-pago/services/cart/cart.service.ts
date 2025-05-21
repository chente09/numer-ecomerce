import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom, map, tap, catchError, from, of, throwError, switchMap, forkJoin } from 'rxjs';
import { Product, ProductVariant } from '../../../models/models';
import { ProductService } from '../../../services/admin/product/product.service';
import { ProductInventoryService, SaleItem } from '../../../services/admin/inventario/product-inventory.service';
import { ErrorUtil } from '../../../utils/error-util';

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

export interface CheckoutResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

// La interfaz que debe implementar el CartService
export interface ICartService {
  // Observable para acceder al estado actual del carrito
  cart$: Observable<Cart>;

  // Métodos para gestionar el carrito
  addToCart(item: CartItem): Observable<Cart>;
  removeFromCart(variantId: string): Observable<Cart>;
  updateQuantity(variantId: string, quantity: number): Observable<Cart>;
  clearCart(): Observable<Cart>;

  // Método para finalizar la compra
  checkout(): Observable<CheckoutResult>;
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
    private inventoryService: ProductInventoryService
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
   * @returns Observable que emite true si se agregó correctamente, false si no
   */
  addToCart(
    productId: string,
    variantId: string,
    quantity: number,
    productData?: Product,
    variantData?: ProductVariant
  ): Observable<boolean> {
    // Usar los datos proporcionados si están disponibles, o buscarlos si no
    if (productData && variantData) {
      return this.processAddToCart(productId, variantId, quantity, productData, variantData);
    } else {
      // Verificar disponibilidad de stock
      return this.checkStock(variantId, quantity).pipe(
        switchMap(stockCheck => {
          if (!stockCheck.available) {
            console.error('No hay suficiente stock disponible', stockCheck);
            return of(false);
          }

          // Cargar datos completos del producto
          return this.productService.getProductById(productId).pipe(
            switchMap(product => {
              if (!product) {
                console.error('Producto no encontrado');
                return of(false);
              }

              // Encontrar la variante
              return this.productService.getVariantById(variantId).pipe(
                switchMap(variant => {
                  if (!variant) {
                    console.error('Variante no encontrada');
                    return of(false);
                  }

                  // Proceder con la adición al carrito
                  return this.processAddToCart(productId, variantId, quantity, product, variant);
                })
              );
            })
          );
        }),
        catchError(error => {
          ErrorUtil.handleError(error, 'addToCart');
          return of(false);
        })
      );
    }
  }

  /**
   * Procesa la adición de un producto al carrito (lógica interna)
   */
  private processAddToCart(
    productId: string,
    variantId: string,
    quantity: number,
    product: Product,
    variant: ProductVariant
  ): Observable<boolean> {
    try {
      // Obtener el precio actual (considerando descuentos)
      const unitPrice = product.currentPrice || product.price;

      // Obtener el carrito actual
      const currentCart = this.getCart();

      // Verificar si el producto ya está en el carrito
      const existingItemIndex = currentCart.items.findIndex(
        item => item.variantId === variantId
      );

      if (existingItemIndex !== -1) {
        // Si el item ya existe, verificar stock para la nueva cantidad total
        const newQuantity = currentCart.items[existingItemIndex].quantity + quantity;

        return this.checkStock(variantId, newQuantity).pipe(
          map(stockCheck => {
            if (!stockCheck.available) {
              console.error('No hay suficiente stock para la cantidad solicitada', stockCheck);
              return false;
            }

            // Actualizar el item existente
            currentCart.items[existingItemIndex].quantity = newQuantity;
            currentCart.items[existingItemIndex].totalPrice = newQuantity * unitPrice;

            // Recalcular totales
            this.recalculateCart(currentCart);

            // Actualizar el estado y guardar en localStorage
            this.cartSubject.next(currentCart);
            this.saveCartToStorage();

            return true;
          })
        );
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

        // Recalcular totales
        this.recalculateCart(currentCart);

        // Actualizar el estado y guardar en localStorage
        this.cartSubject.next(currentCart);
        this.saveCartToStorage();

        return of(true);
      }
    } catch (error) {
      console.error('Error al procesar adición al carrito:', error);
      return of(false);
    }
  }

  /**
   * Actualiza la cantidad de un item en el carrito
   */
  updateItemQuantity(variantId: string, quantity: number): Observable<boolean> {
    if (quantity <= 0) {
      return this.removeItem(variantId);
    }

    return this.checkStock(variantId, quantity).pipe(
      map(stockCheck => {
        if (!stockCheck.available) {
          console.error('No hay suficiente stock disponible', stockCheck);
          return false;
        }

        const currentCart = this.getCart();
        const itemIndex = currentCart.items.findIndex(item => item.variantId === variantId);

        if (itemIndex === -1) {
          console.error('Item no encontrado en el carrito');
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
      }),
      catchError(error => {
        console.error('Error al actualizar cantidad:', error);
        return of(false);
      })
    );
  }


  /**
   * Elimina un item del carrito
   */
  removeItem(variantId: string): Observable<boolean> {
    try {
      const currentCart = this.getCart();
      const updatedItems = currentCart.items.filter(item => item.variantId !== variantId);

      if (updatedItems.length === currentCart.items.length) {
        // No se encontró el item
        return of(false);
      }

      currentCart.items = updatedItems;

      // Recalcular totales
      this.recalculateCart(currentCart);

      // Actualizar el estado y guardar
      this.cartSubject.next(currentCart);
      this.saveCartToStorage();

      return of(true);
    } catch (error) {
      console.error('Error al eliminar item:', error);
      return of(false);
    }
  }

  /**
   * Vacía completamente el carrito
   */
  clearCart(): void {
    this.cartSubject.next({ ...this.initialCartState });
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

    // Calcular impuestos (ejemplo: 15% IVA)
    cart.tax = cart.subtotal * 0.15;

    // Calcular envío (lógica simplificada)
    cart.shipping = cart.subtotal > 1000 ? 0 : 5; // Envío gratis para compras mayores a $1000

    // Calcular total general
    cart.total = cart.subtotal + cart.tax + cart.shipping - cart.discount;
  }

  /**
   * Verifica la disponibilidad de stock para una variante
   */
  private checkStock(variantId: string, quantity: number): Observable<{
    available: boolean,
    requested: number,
    availableStock: number
  }> {
    console.log('Verificando stock para variant ID:', variantId, 'cantidad:', quantity);

    return this.productService.getVariantById(variantId).pipe(
      map(variant => {
        console.log('Variante encontrada:', variant);

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
      }),
      catchError(error => {
        console.error('Error al verificar stock:', error);
        return of({ available: false, requested: quantity, availableStock: 0 });
      })
    );
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
  private loadCartFromStorage(): void {
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

      // Inicializar un carrito básico con los items del storage
      const initialCart: Cart = {
        ...parsedCart,
        items: parsedCart.items.map(item => ({
          ...item,
          // No incluimos product ni variant aún, se cargarán asíncronamente
        }))
      };

      // Actualizar el BehaviorSubject con datos iniciales
      this.cartSubject.next(initialCart);

      // Cargar detalles de productos y variantes de forma asíncrona
      this.loadCartItemDetails(parsedCart.items);
    } catch (error) {
      console.error('Error al cargar carrito desde localStorage:', error);
    }
  }

  /**
   * Carga los detalles de productos y variantes de forma asíncrona
   */
  private loadCartItemDetails(items: CartItem[]): void {
    // Para cada item del carrito, cargar detalles completos
    items.forEach(item => {
      this.productService.getProductById(item.productId).pipe(
        switchMap(product => {
          if (!product) {
            // Si el producto no existe, lo eliminamos del carrito
            this.removeItem(item.variantId);
            return throwError(() => new Error(`Producto no encontrado: ${item.productId}`));
          }

          return this.productService.getVariantById(item.variantId).pipe(
            map(variant => {
              if (!variant) {
                // Si la variante no existe, lo eliminamos del carrito
                this.removeItem(item.variantId);
                throw new Error(`Variante no encontrada: ${item.variantId}`);
              }

              // Actualizar el carrito con el item completo
              return { product, variant };
            })
          );
        })
      ).subscribe({
        next: ({ product, variant }) => {
          const currentCart = this.getCart();
          const itemIndex = currentCart.items.findIndex(i => i.variantId === item.variantId);

          if (itemIndex !== -1) {
            // Actualizar precio unitario por si cambió
            const unitPrice = product.currentPrice || product.price;

            // Actualizar item con datos completos
            currentCart.items[itemIndex] = {
              ...currentCart.items[itemIndex],
              product,
              variant,
              unitPrice,
              totalPrice: currentCart.items[itemIndex].quantity * unitPrice
            };

            // Recalcular totales
            this.recalculateCart(currentCart);

            // Actualizar el estado
            this.cartSubject.next({ ...currentCart });
          }
        },
        error: error => {
          console.error('Error al cargar detalles de item:', error);
          // El item problemático ya fue eliminado en los operadores anteriores
        }
      });
    });
  }

  /**
   * Finaliza la compra con los items del carrito
   */
  checkout(): Observable<{
    success: boolean,
    orderId?: string,
    error?: string
  }> {
    const cart = this.getCart();

    // Verificar que haya items
    if (cart.items.length === 0) {
      return of({
        success: false,
        error: 'El carrito está vacío'
      });
    }

    // Verificar stock de todos los items
    const unavailableItems: any[] = [];

    for (const item of cart.items) {
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
      return of({
        success: false,
        error: 'Algunos productos no tienen suficiente stock disponible'
      });
    }

    // Preparar items para la venta
    const saleItems: SaleItem[] = cart.items.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity
    }));

    // Para cada producto, registrar la venta usando el formato que espera ProductInventoryService
    const registerSaleOperations: Observable<void>[] = [];

    // Agrupar items por productId
    const itemsByProduct = new Map<string, SaleItem[]>();

    cart.items.forEach(item => {
      if (!itemsByProduct.has(item.productId)) {
        itemsByProduct.set(item.productId, []);
      }
      itemsByProduct.get(item.productId)!.push({
        variantId: item.variantId,
        quantity: item.quantity
      });
    });

    // Crear operaciones de registro de venta
    itemsByProduct.forEach((items, productId) => {
      registerSaleOperations.push(
        this.inventoryService.registerSale(productId, items)
      );
    });

    // Ejecutar todas las operaciones de venta
    return forkJoin(registerSaleOperations).pipe(
      map(() => {
        // Aquí se integraría con el servicio de órdenes para crear la orden
        const orderId = 'ORD-' + Date.now();

        // Limpiar el carrito después de la compra exitosa
        this.clearCart();

        return {
          success: true,
          orderId
        };
      }),
      catchError(error => {
        console.error('Error al procesar el checkout:', error);
        return of({
          success: false,
          error: 'Ocurrió un error al procesar la compra'
        });
      })
    );
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