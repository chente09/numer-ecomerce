import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom, map, tap, catchError, from, of, throwError, switchMap, forkJoin, take, finalize } from 'rxjs';
import { Product, ProductVariant } from '../../../models/models';
import { ProductService } from '../../../services/admin/product/product.service';
import { ProductInventoryService, SaleItem } from '../../../services/admin/inventario/product-inventory.service';
import { ErrorUtil } from '../../../utils/error-util';
import { StockUpdateService } from '../../../services/admin/stockUpdate/stock-update.service';

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
    private inventoryService: ProductInventoryService,
    private stockUpdateService: StockUpdateService
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
   * 🚀 CORREGIDO: Agrega un producto al carrito
   * @returns Observable que emite true si se agregó correctamente, false si no
   */
  addToCart(
    productId: string,
    variantId: string,
    quantity: number,
    productData?: Product,
    variantData?: ProductVariant
  ): Observable<boolean> {
    console.log(`🛒 CartService: Agregando al carrito - Product: ${productId}, Variant: ${variantId}, Qty: ${quantity}`);

    // Usar los datos proporcionados si están disponibles, o buscarlos si no
    if (productData && variantData) {
      return this.processAddToCart(productId, variantId, quantity, productData, variantData);
    } else {
      // Verificar disponibilidad de stock
      return this.checkStock(variantId, quantity).pipe(
        take(1), // ✅ NUEVO: Forzar completar
        switchMap(stockCheck => {
          if (!stockCheck.available) {
            console.error('❌ CartService: No hay suficiente stock disponible', stockCheck);
            return of(false);
          }

          console.log('✅ CartService: Stock disponible, cargando datos del producto...');

          // Cargar datos completos del producto
          return this.productService.getProductById(productId).pipe(
            take(1), // ✅ NUEVO: Forzar completar
            switchMap(product => {
              if (!product) {
                console.error('❌ CartService: Producto no encontrado');
                return of(false);
              }

              console.log(`✅ CartService: Producto encontrado: ${product.name}`);

              // Encontrar la variante
              return this.productService.getVariantById(variantId).pipe(
                take(1), // ✅ NUEVO: Forzar completar
                switchMap(variant => {
                  if (!variant) {
                    console.error('❌ CartService: Variante no encontrada');
                    return of(false);
                  }

                  console.log(`✅ CartService: Variante encontrada: ${variant.colorName}-${variant.sizeName}`);

                  // Proceder con la adición al carrito
                  return this.processAddToCart(productId, variantId, quantity, product, variant);
                })
              );
            })
          );
        }),
        catchError(error => {
          console.error('❌ CartService: Error en addToCart:', error);
          ErrorUtil.handleError(error, 'addToCart');
          return of(false);
        }),
        finalize(() => {
          console.log('🏁 CartService: addToCart completado');
        })
      );
    }
  }

  /**
   * 🚀 CORREGIDO: Procesa la adición de un producto al carrito (lógica interna)
   */
  private processAddToCart(
    productId: string,
    variantId: string,
    quantity: number,
    product: Product,
    variant: ProductVariant
  ): Observable<boolean> {
    try {
      console.log(`🔄 CartService: Procesando adición al carrito para ${product.name}`);

      // Obtener el precio actual (considerando descuentos)
      const unitPrice = product.currentPrice || product.price;

      // Obtener el carrito actual
      const currentCart = this.getCart();

      // Verificar si el producto ya está en el carrito
      const existingItemIndex = currentCart.items.findIndex(
        item => item.variantId === variantId
      );

      if (existingItemIndex !== -1) {
        console.log('🔄 CartService: Item ya existe en carrito, actualizando cantidad...');

        // Si el item ya existe, verificar stock para la nueva cantidad total
        const newQuantity = currentCart.items[existingItemIndex].quantity + quantity;

        return this.checkStock(variantId, newQuantity).pipe(
          take(1), // ✅ NUEVO: Forzar completar
          map(stockCheck => {
            if (!stockCheck.available) {
              console.error('❌ CartService: No hay suficiente stock para la cantidad solicitada', stockCheck);
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

            // 🚀 NOTIFICAR CAMBIO DE STOCK POR COMPRA
            this.stockUpdateService.notifyStockChange({
              productId: productId,
              variantId: variantId,
              stockChange: -quantity, // Reducir stock
              newStock: Math.max(0, (variant.stock || 0) - quantity),
              timestamp: new Date(),
              source: 'purchase',
              metadata: {
                colorName: variant.colorName,
                sizeName: variant.sizeName,
                productName: product.name,
                userAction: 'add_to_cart_existing'
              }
            });


            console.log(`✅ CartService: Cantidad actualizada - Nueva cantidad: ${newQuantity}`);
            return true;
          }),
          finalize(() => {
            console.log('🏁 CartService: processAddToCart (update) completado');
          })
        );
      } else {
        console.log('➕ CartService: Agregando nuevo item al carrito...');

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

        // 🚀 NOTIFICAR CAMBIO DE STOCK POR COMPRA NUEVA
        this.stockUpdateService.notifyStockChange({
          productId: productId,
          variantId: variantId,
          stockChange: -quantity, // Reducir stock
          newStock: Math.max(0, (variant.stock || 0) - quantity),
          timestamp: new Date(),
          source: 'purchase',
          metadata: {
            colorName: variant.colorName,
            sizeName: variant.sizeName,
            productName: product.name,
            userAction: 'add_to_cart_new'
          }
        });

        console.log(`✅ CartService: Nuevo item agregado - Items en carrito: ${currentCart.items.length}`);
        return of(true);
      }
    } catch (error) {
      console.error('❌ CartService: Error al procesar adición al carrito:', error);
      return of(false);
    }
  }

  /**
   * 🚀 CORREGIDO: Actualiza la cantidad de un item en el carrito
   */
  updateItemQuantity(variantId: string, quantity: number): Observable<boolean> {
    console.log(`🔄 CartService: Actualizando cantidad - Variant: ${variantId}, Qty: ${quantity}`);

    if (quantity <= 0) {
      return this.removeItem(variantId);
    }

    return this.checkStock(variantId, quantity).pipe(
      take(1), // ✅ NUEVO: Forzar completar
      map(stockCheck => {
        if (!stockCheck.available) {
          console.error('❌ CartService: No hay suficiente stock disponible', stockCheck);
          return false;
        }

        const currentCart = this.getCart();
        const itemIndex = currentCart.items.findIndex(item => item.variantId === variantId);

        if (itemIndex === -1) {
          console.error('❌ CartService: Item no encontrado en el carrito');
          return false;
        }

        const item = currentCart.items[itemIndex];
        const oldQuantity = item.quantity;
        const quantityChange = quantity - oldQuantity;

        // Actualizar cantidad
        currentCart.items[itemIndex].quantity = quantity;
        currentCart.items[itemIndex].totalPrice =
          quantity * currentCart.items[itemIndex].unitPrice;

        // Recalcular totales
        this.recalculateCart(currentCart);

        // Actualizar el estado y guardar
        this.cartSubject.next(currentCart);
        this.saveCartToStorage();

        // 🚀 NOTIFICAR CAMBIO DE STOCK POR ACTUALIZACIÓN DE CANTIDAD
        if (quantityChange !== 0) {
          this.stockUpdateService.notifyStockChange({
            productId: item.productId,
            variantId: variantId,
            stockChange: -quantityChange, // Si aumenta qty, reduce stock
            newStock: Math.max(0, (item.variant?.stock || 0) - quantityChange),
            timestamp: new Date(),
            source: 'purchase',
            metadata: {
              colorName: item.variant?.colorName,
              sizeName: item.variant?.sizeName,
              productName: item.product?.name,
              userAction: 'update_cart_quantity'
            }
          });
        }

        console.log(`✅ CartService: Cantidad actualizada exitosamente`);
        return true;
      }),
      catchError(error => {
        console.error('❌ CartService: Error al actualizar cantidad:', error);
        return of(false);
      }),
      finalize(() => {
        console.log('🏁 CartService: updateItemQuantity completado');
      })
    );
  }

  /**
   * Elimina un item del carrito
   */
  removeItem(variantId: string): Observable<boolean> {
    try {
      console.log(`🗑️ CartService: Eliminando item - Variant: ${variantId}`);

      const currentCart = this.getCart();
      const itemToRemove = currentCart.items.find(item => item.variantId === variantId);
      const updatedItems = currentCart.items.filter(item => item.variantId !== variantId);

      if (updatedItems.length === currentCart.items.length) {
        // No se encontró el item
        console.warn('⚠️ CartService: Item no encontrado para eliminar');
        return of(false);
      }

      if (itemToRemove) {
        // 🚀 NOTIFICAR DEVOLUCIÓN DE STOCK
        this.stockUpdateService.notifyStockChange({
          productId: itemToRemove.productId,
          variantId: itemToRemove.variantId,
          stockChange: itemToRemove.quantity, // Devolver stock
          newStock: (itemToRemove.variant?.stock || 0) + itemToRemove.quantity,
          timestamp: new Date(),
          source: 'purchase',
          metadata: {
            colorName: itemToRemove.variant?.colorName,
            sizeName: itemToRemove.variant?.sizeName,
            productName: itemToRemove.product?.name,
            userAction: 'remove_from_cart'
          }
        });
      }

      currentCart.items = updatedItems;

      // Recalcular totales
      this.recalculateCart(currentCart);

      // Actualizar el estado y guardar
      this.cartSubject.next(currentCart);
      this.saveCartToStorage();

      console.log(`✅ CartService: Item eliminado - Items restantes: ${currentCart.items.length}`);
      return of(true);
    } catch (error) {
      console.error('❌ CartService: Error al eliminar item:', error);
      return of(false);
    }
  }

  /**
   * Vacía completamente el carrito
   */
  clearCart(): void {
    console.log('🧹 CartService: Limpiando carrito completo');
    this.cartSubject.next({ ...this.initialCartState });
    localStorage.removeItem('cart');
    console.log('✅ CartService: Carrito limpiado');
  }

  /**
   * Aplicar código de descuento al carrito
   */
  applyDiscount(discountCode: string, discountAmount: number): boolean {
    try {
      console.log(`💰 CartService: Aplicando descuento - Código: ${discountCode}, Monto: ${discountAmount}`);

      const currentCart = this.getCart();

      // Aplicar descuento
      currentCart.discount = discountAmount;

      // Recalcular totales
      this.recalculateCart(currentCart);

      // Actualizar el estado y guardar
      this.cartSubject.next(currentCart);
      this.saveCartToStorage();

      console.log('✅ CartService: Descuento aplicado exitosamente');
      return true;
    } catch (error) {
      console.error('❌ CartService: Error al aplicar descuento:', error);
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

    console.log(`💰 CartService: Totales recalculados - Items: ${cart.totalItems}, Total: $${cart.total.toFixed(2)}`);
  }

  /**
   * 🚀 CORREGIDO: Verifica la disponibilidad de stock para una variante
   */
  private checkStock(variantId: string, quantity: number): Observable<{
    available: boolean,
    requested: number,
    availableStock: number
  }> {
    console.log(`🔍 CartService: Verificando stock - Variant: ${variantId}, Cantidad: ${quantity}`);

    return this.productService.getVariantById(variantId).pipe(
      take(1), // ✅ NUEVO: Forzar completar
      map(variant => {
        if (!variant) {
          console.error('❌ CartService: Variante no encontrada con ID:', variantId);
          return { available: false, requested: quantity, availableStock: 0 };
        }

        // Verificar explícitamente si el stock es undefined o null
        const stockAvailable = variant.stock !== undefined && variant.stock !== null ? variant.stock : 0;
        const available = stockAvailable >= quantity;

        console.log(`📊 CartService: Stock verificado - Disponible: ${stockAvailable}, Solicitado: ${quantity}, OK: ${available}`);

        return {
          available,
          requested: quantity,
          availableStock: stockAvailable
        };
      }),
      catchError(error => {
        console.error('❌ CartService: Error al verificar stock:', error);
        return of({ available: false, requested: quantity, availableStock: 0 });
      }),
      finalize(() => {
        console.log('🏁 CartService: checkStock completado');
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
      console.log('💾 CartService: Carrito guardado en localStorage');
    } catch (error) {
      console.error('❌ CartService: Error al guardar carrito en localStorage:', error);
    }
  }

  /**
   * 🚀 CORREGIDO: Recupera el carrito desde localStorage
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
        console.log('ℹ️ CartService: Carrito guardado está vacío');
        return;
      }

      console.log(`📦 CartService: Carrito cargado con ${parsedCart.items.length} items`);

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
      console.error('❌ CartService: Error al cargar carrito desde localStorage:', error);
    }
  }

  /**
   * 🚀 CORREGIDO: Carga los detalles de productos y variantes de forma asíncrona
   */
  private loadCartItemDetails(items: CartItem[]): void {
    console.log(`🔄 CartService: Cargando detalles para ${items.length} items del carrito...`);

    if (items.length === 0) return;

    // ✅ SOLUCIÓN: Usar forkJoin para procesar todos los items a la vez
    const itemDetails$ = items.map((item, index) =>
      this.productService.getProductById(item.productId).pipe(
        take(1),
        switchMap(product => {
          if (!product) {
            console.warn(`⚠️ CartService: Producto no encontrado: ${item.productId}`);
            return of(null); // ✅ Retornar null en lugar de error
          }

          return this.productService.getVariantById(item.variantId).pipe(
            take(1),
            map(variant => {
              if (!variant) {
                console.warn(`⚠️ CartService: Variante no encontrada: ${item.variantId}`);
                return null; // ✅ Retornar null en lugar de error
              }
              return { item, product, variant, index };
            })
          );
        }),
        catchError(error => {
          console.error(`❌ CartService: Error cargando item ${index + 1}:`, error);
          return of(null); // ✅ Continuar con otros items
        })
      )
    );

    // ✅ SOLUCIÓN: Una sola actualización del carrito al final
    forkJoin(itemDetails$).pipe(
      finalize(() => {
        console.log('🏁 CartService: loadCartItemDetails completado');
      })
    ).subscribe(results => {
      const currentCart = this.getCart();
      const validResults = results.filter(result => result !== null);
      const itemsToRemove: string[] = [];

      // Actualizar items válidos
      validResults.forEach(({ item, product, variant }) => {
        const itemIndex = currentCart.items.findIndex(i => i.variantId === item.variantId);

        if (itemIndex !== -1) {
          const unitPrice = product.currentPrice || product.price;
          currentCart.items[itemIndex] = {
            ...currentCart.items[itemIndex],
            product,
            variant,
            unitPrice,
            totalPrice: currentCart.items[itemIndex].quantity * unitPrice
          };
        }
      });

      // Identificar items a eliminar
      items.forEach(item => {
        const wasLoaded = validResults.some(result =>
          result && result.item.variantId === item.variantId
        );
        if (!wasLoaded) {
          itemsToRemove.push(item.variantId);
        }
      });

      // Eliminar items inválidos
      if (itemsToRemove.length > 0) {
        currentCart.items = currentCart.items.filter(
          item => !itemsToRemove.includes(item.variantId)
        );
      }

      // ✅ Una sola actualización del carrito
      this.recalculateCart(currentCart);
      this.cartSubject.next({ ...currentCart });
      this.saveCartToStorage();

      console.log(`✅ CartService: ${validResults.length}/${items.length} items cargados exitosamente`);
    });
  }

  /**
   * 🚀 CORREGIDO: Finaliza la compra con los items del carrito
   */
  checkout(): Observable<{
    success: boolean,
    orderId?: string,
    error?: string
  }> {
    console.log('🛒 CartService: Iniciando proceso de checkout...');

    const cart = this.getCart();

    // Verificar que haya items
    if (cart.items.length === 0) {
      console.warn('⚠️ CartService: El carrito está vacío');
      return of({
        success: false,
        error: 'El carrito está vacío'
      });
    }

    console.log(`🔍 CartService: Verificando stock de ${cart.items.length} items...`);

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
      console.error('❌ CartService: Items sin stock suficiente:', unavailableItems);
      return of({
        success: false,
        error: 'Algunos productos no tienen suficiente stock disponible'
      });
    }

    console.log('✅ CartService: Stock verificado, procesando venta...');

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

    console.log(`📊 CartService: Registrando ventas para ${itemsByProduct.size} productos...`);

    // Crear operaciones de registro de venta
    itemsByProduct.forEach((items, productId) => {
      registerSaleOperations.push(
        this.inventoryService.registerSale(productId, items).pipe(
          take(1) // ✅ NUEVO: Forzar completar cada operación
        )
      );
    });

    // Ejecutar todas las operaciones de venta
    return forkJoin(registerSaleOperations).pipe(
      map(() => {
        // Aquí se integraría con el servicio de órdenes para crear la orden
        const orderId = 'ORD-' + Date.now();

        console.log(`🎉 CartService: Checkout exitoso - Orden: ${orderId}`);

        // Limpiar el carrito después de la compra exitosa
        this.clearCart();

        return {
          success: true,
          orderId
        };
      }),
      catchError(error => {
        console.error('❌ CartService: Error al procesar el checkout:', error);
        return of({
          success: false,
          error: 'Ocurrió un error al procesar la compra'
        });
      }),
      finalize(() => {
        console.log('🏁 CartService: checkout completado');
      })
    );
  }

  /**
   * 🚀 CORREGIDO: Obtiene el número de items en el carrito (para el badge)
   */
  getCartItemCount(): Observable<number> {
    return this.cart$.pipe(
      map(cart => cart.totalItems),
      finalize(() => {
        console.log('🏁 CartService: getCartItemCount completado');
      })
    );
  }

  /**
   * 🆕 NUEVO: Método de debugging para ver el estado del carrito
   */
  debugCart(): void {
    console.group('🛒 [CART DEBUG] Estado actual del carrito');

    const cart = this.getCart();

    console.log(`📊 Total de items: ${cart.totalItems}`);
    console.log(`💰 Subtotal: $${cart.subtotal.toFixed(2)}`);
    console.log(`📦 Tax: $${cart.tax.toFixed(2)}`);
    console.log(`🚚 Shipping: $${cart.shipping.toFixed(2)}`);
    console.log(`🎯 Discount: $${cart.discount.toFixed(2)}`);
    console.log(`💵 Total: $${cart.total.toFixed(2)}`);

    if (cart.items.length > 0) {
      const itemsSummary = cart.items.map(item => ({
        product: item.product?.name || 'Cargando...',
        variant: item.variant ? `${item.variant.colorName}-${item.variant.sizeName}` : 'Cargando...',
        quantity: item.quantity,
        unitPrice: `$${item.unitPrice.toFixed(2)}`,
        totalPrice: `$${item.totalPrice.toFixed(2)}`,
        stock: item.variant?.stock || 'N/A'
      }));

      console.table(itemsSummary);
    } else {
      console.log('🤷‍♂️ El carrito está vacío');
    }

    console.groupEnd();
  }
}