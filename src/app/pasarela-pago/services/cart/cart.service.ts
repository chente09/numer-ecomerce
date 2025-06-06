import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom, map, tap, catchError, from, of, throwError, switchMap, forkJoin, take, finalize, takeUntil, Subject } from 'rxjs';
import { Product, ProductVariant } from '../../../models/models';
import { ProductService } from '../../../services/admin/product/product.service';
import { ErrorUtil } from '../../../utils/error-util';
import { UsersService } from '../../../services/users/users.service';
import { deleteDoc, doc, Firestore, getDoc, setDoc } from '@angular/fire/firestore';
import { User } from '@angular/fire/auth';

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

  private firestore = inject(Firestore);
  private currentUserId: string | null = null;

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

  private destroy$ = new Subject<void>();

  // Observable público para que los componentes se suscriban
  public cart$: Observable<Cart> = this.cartSubject.asObservable();

  constructor(
    private productService: ProductService,
    private usersService: UsersService
  ) {
    // ✅ SUSCRIPCIÓN con cleanup automático
    this.usersService.user$.pipe(
      takeUntil(this.destroy$) // Previene memory leaks
    ).subscribe(user => {
      this.handleUserChange(user);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ✅ NUEVO: Manejar cambio de usuario
  private async handleUserChange(user: User | null): Promise<void> {
    const previousUserId = this.currentUserId;
    this.currentUserId = user?.uid || null;

    console.log('👤 Cambio de usuario:', {
      previous: previousUserId,
      current: this.currentUserId
    });

    // ✅ PREVENIR procesamiento innecesario
    if (previousUserId === this.currentUserId) {
      return;
    }

    if (user && !user.isAnonymous) {
      // Usuario se logueó
      await this.handleUserLogin(previousUserId);
    } else if (previousUserId && !user) {
      // Usuario se deslogueó
      await this.handleUserLogout();
    } else if (!user && !previousUserId) {
      // ✅ NUEVO: Usuario inicial no logueado - cargar desde localStorage
      this.loadCartFromStorage();
    }
  }

  // ✅ NUEVO: Cuando usuario se loguea
  private async handleUserLogin(previousUserId: string | null): Promise<void> {
    try {
      console.log('🔄 Usuario logueado, sincronizando carrito...');

      const currentCart = this.getCart();
      const userCart = await this.loadUserCartFromFirestore();
      const mergedCart = this.mergeCartItems(currentCart, userCart);

      this.cartSubject.next(mergedCart);
      await this.saveCartToFirestore();
      this.saveCartToStorage();

      // ✅ AGREGAR: Cargar detalles de productos si hay items
      if (mergedCart.items.length > 0) {
        this.loadCartItemDetails(mergedCart.items);
      }

      console.log('✅ Carrito sincronizado exitosamente');
    } catch (error) {
      console.error('❌ Error sincronizando carrito:', error);
    }
  }

  // ✅ NUEVO: Cuando usuario se desloguea
  private async handleUserLogout(): Promise<void> {
    console.log('👋 Usuario deslogueado, limpiando carrito...');
    this.cartSubject.next({ ...this.initialCartState });
    localStorage.removeItem('cart');
  }

  // ✅ NUEVO: Cargar carrito de Firestore
  private async loadUserCartFromFirestore(): Promise<Cart> {
    if (!this.currentUserId) return { ...this.initialCartState };

    try {
      const cartRef = doc(this.firestore, `users/${this.currentUserId}/cart`, 'current');
      const cartSnap = await getDoc(cartRef);

      if (cartSnap.exists()) {
        const data = cartSnap.data();
        console.log('📦 Carrito cargado desde Firestore:', data);

        // Validar y limpiar datos
        return this.sanitizeCartData(data as Cart);
      }
    } catch (error) {
      console.error('❌ Error cargando carrito de Firestore:', error);
    }

    return { ...this.initialCartState };
  }

  // ✅ NUEVO: Guardar carrito en Firestore
  private async saveCartToFirestore(): Promise<void> {
    if (!this.currentUserId) return;

    try {
      const cart = this.getCart();

      // ✅ VALIDAR que hay algo que guardar
      if (cart.items.length === 0) {
        // Si carrito vacío, eliminar documento
        await this.clearUserCart();
        return;
      }

      const cartRef = doc(this.firestore, `users/${this.currentUserId}/cart`, 'current');

      const cartToSave = {
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
        total: cart.total,
        updatedAt: new Date()
      };

      await setDoc(cartRef, cartToSave);
      console.log('💾 Carrito guardado en Firestore');
    } catch (error) {
      console.error('❌ Error guardando carrito en Firestore:', error);
      // ✅ NO lanzar error - continuar sin sincronización
    }
  }

  // ✅ NUEVO: Merge inteligente de carritos
  private mergeCartItems(localCart: Cart, userCart: Cart): Cart {
    console.log('🔀 Mergeando carritos...', {
      local: localCart.items.length,
      user: userCart.items.length
    });

    // ✅ SOLUCIÓN: Usar carrito de usuario como base, NO sumar local
    const mergedItems = [...userCart.items];

    // Solo agregar items del carrito local que NO estén en el de usuario
    localCart.items.forEach(localItem => {
      const existingIndex = mergedItems.findIndex(
        item => item.variantId === localItem.variantId
      );

      if (existingIndex === -1) {
        // ✅ Solo agregar si NO existe en el carrito del usuario
        console.log(`➕ Agregando item local no existente: ${localItem.product?.name}`);
        mergedItems.push(localItem);
      } else {
        // ✅ NO sumar - mantener la cantidad del usuario
        console.log(`🔄 Item ya existe en carrito de usuario, manteniendo cantidad del servidor: ${mergedItems[existingIndex].quantity}`);
      }
    });

    const mergedCart = {
      ...this.initialCartState,
      items: mergedItems
    };

    this.recalculateCart(mergedCart);
    return mergedCart;
  }

  // ✅ NUEVO: Sanitizar datos del carrito
  private sanitizeCartData(data: any): Cart {
    return {
      items: (data.items || []).map((item: any) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice || 0,
        totalPrice: item.totalPrice || 0,
        // ✅ NO incluir product/variant - se cargarán después
      })),
      totalItems: data.totalItems || 0,
      subtotal: data.subtotal || 0,
      tax: data.tax || 0,
      shipping: data.shipping || 0,
      discount: data.discount || 0,
      total: data.total || 0
    };
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
        take(1),
        switchMap(stockCheck => {
          if (!stockCheck.available) {
            console.error('❌ CartService: No hay suficiente stock disponible', stockCheck);
            return of(false);
          }

          console.log('✅ CartService: Stock disponible, cargando datos del producto...');

          // Cargar datos completos del producto
          return this.productService.getProductById(productId).pipe(
            take(1),
            switchMap(product => {
              if (!product) {
                console.error('❌ CartService: Producto no encontrado');
                return of(false);
              }

              console.log(`✅ CartService: Producto encontrado: ${product.name}`);

              // Encontrar la variante
              return this.productService.getVariantById(variantId).pipe(
                take(1),
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
        // ✅ NUEVO: Sincronizar con Firestore después de agregar
        tap(success => {
          if (success && this.currentUserId) {
            this.saveCartToFirestore();
          }
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

  getVariantById(variantId: string): Observable<ProductVariant | undefined> {
    return this.productService.getVariantById(variantId);
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

      const unitPrice = product.currentPrice || product.price;
      const currentCart = this.getCart();
      const existingItemIndex = currentCart.items.findIndex(
        item => item.variantId === variantId
      );

      if (existingItemIndex !== -1) {
        console.log('🔄 CartService: Item ya existe en carrito, actualizando cantidad...');

        const newQuantity = currentCart.items[existingItemIndex].quantity + quantity;

        return this.checkStock(variantId, newQuantity).pipe(
          take(1),
          map(stockCheck => {
            if (!stockCheck.available) {
              console.error('❌ CartService: No hay suficiente stock para la cantidad solicitada', stockCheck);
              return false;
            }

            // Actualizar cantidad en el carrito
            currentCart.items[existingItemIndex].quantity = newQuantity;
            currentCart.items[existingItemIndex].totalPrice = newQuantity * unitPrice;

            this.recalculateCart(currentCart);
            this.cartSubject.next(currentCart);
            this.saveCartToStorage();

            console.log(`✅ CartService: Cantidad actualizada - Nueva cantidad: ${newQuantity}`);
            return true;
          }),
          // ✅ AGREGAR: Sincronización con Firestore AQUÍ
          tap(success => {
            if (success && this.currentUserId) {
              this.saveCartToFirestore().catch(error =>
                console.error('Error sincronizando con Firestore:', error)
              );
            }
          }),
          finalize(() => {
            console.log('🏁 CartService: processAddToCart (update) completado');
          })
        );
      } else {
        console.log('➕ CartService: Agregando nuevo item al carrito...');

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
        this.recalculateCart(currentCart);
        this.cartSubject.next(currentCart);
        this.saveCartToStorage();

        // ✅ CORREGIR: Sincronizar con Firestore para nuevos items también
        if (this.currentUserId) {
          this.saveCartToFirestore().catch(error =>
            console.error('Error sincronizando con Firestore:', error)
          );
        }

        console.log(`✅ CartService: Nuevo item agregado - Items en carrito: ${currentCart.items.length}`);
        return of(true);
      }
    } catch (error) {
      console.error('❌ CartService: Error al procesar adición al carrito:', error);
      return of(false); // ✅ CORREGIR: Retornar Observable con false
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
      take(1),
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

        // Actualizar cantidad en carrito
        currentCart.items[itemIndex].quantity = quantity;
        currentCart.items[itemIndex].totalPrice = quantity * currentCart.items[itemIndex].unitPrice;

        this.recalculateCart(currentCart);
        this.cartSubject.next(currentCart);
        this.saveCartToStorage();

        // ✅ NUEVO: Sincronizar con Firestore
        if (this.currentUserId) {
          this.saveCartToFirestore();
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
    console.log(`🗑️ CartService: Eliminando item - Variant: ${variantId}`);

    try {
      const currentCart = this.getCart();
      const itemIndex = currentCart.items.findIndex(item => item.variantId === variantId);

      if (itemIndex === -1) {
        console.error('❌ CartService: Item no encontrado en el carrito');
        return of(false);
      }

      // Eliminar item del carrito
      currentCart.items.splice(itemIndex, 1);

      this.recalculateCart(currentCart);
      this.cartSubject.next(currentCart);
      this.saveCartToStorage();

      // ✅ NUEVO: Sincronizar con Firestore
      if (this.currentUserId) {
        this.saveCartToFirestore();
      }

      console.log('✅ CartService: Item eliminado exitosamente');
      return of(true);
    } catch (error) {
      console.error('❌ CartService: Error al eliminar item:', error);
      return of(false);
    }
  }

  private getCurrentUser(): any {
    return this.usersService.getCurrentUser();
  }

  /**
   * Vacía completamente el carrito
   */
  clearCart(): void {
    console.log('🧹 CartService: Limpiando carrito completo');

    // ✅ LIMPIAR TODO INMEDIATAMENTE
    this.cartSubject.next({ ...this.initialCartState });
    localStorage.removeItem('cart');

    // ✅ NUEVO: Marcar que el carrito fue limpiado intencionalmente
    localStorage.setItem('cart_cleared_flag', Date.now().toString());

    // ✅ LIMPIAR TAMBIÉN CARRITO REMOTO SI HAY USUARIO
    const currentUser = this.getCurrentUser();
    if (currentUser && !currentUser.isAnonymous) {
      this.clearRemoteCart().subscribe({
        next: () => console.log('✅ CartService: Carrito remoto limpiado'),
        error: (error) => console.error('❌ Error limpiando carrito remoto:', error)
      });
    }

    // ✅ FORZAR ACTUALIZACIÓN DE PRODUCTOS
    console.log('🔄 CartService: Forzando actualización de productos...');
    this.productService.forceReloadProducts().pipe(
      take(1)
    ).subscribe({
      next: (products) => {
        console.log(`✅ CartService: ${products.length} productos actualizados después de limpiar carrito`);
      },
      error: (error) => {
        console.error('❌ CartService: Error actualizando productos:', error);
      }
    });

    console.log('✅ CartService: Carrito limpiado completamente');
  }

  private clearRemoteCart(): Observable<void> {
    const user = this.getCurrentUser();

    if (!user || user.isAnonymous) {
      return of(void 0); // No hacer nada si no hay usuario autenticado
    }

    // ✅ IMPLEMENTACIÓN para Firestore (ajusta según tu estructura)
    return from((async () => {
      try {
        // Opción 1: Si guardas el carrito como documento del usuario
        const userCartRef = doc(this.firestore, `users/${user.uid}/cart`, 'current');
        await deleteDoc(userCartRef);
        console.log('🗑️ CartService: Carrito remoto eliminado de Firestore');

        // Opción 2: Si guardas el carrito en el documento del usuario
        // const userRef = doc(this.firestore, `users/${user.uid}`);
        // await updateDoc(userRef, { cart: null });

      } catch (error) {
        console.error('❌ CartService: Error limpiando carrito remoto:', error);
        throw error;
      }
    })()).pipe(
      catchError(error => {
        console.error('❌ CartService: Error en clearRemoteCart:', error);
        return of(void 0); // No fallar la operación principal
      })
    );
  }

  private async clearUserCart(): Promise<void> {
    if (!this.currentUserId) return;

    try {
      const cartRef = doc(this.firestore, `users/${this.currentUserId}/cart`, 'current');
      await deleteDoc(cartRef);
      console.log('✅ Carrito remoto limpiado');
    } catch (error) {
      console.error('❌ Error limpiando carrito remoto:', error);
    }
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
      take(1),
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

      const clearedFlag = localStorage.getItem('cart_cleared_flag');
      if (clearedFlag) {
        const clearedTime = parseInt(clearedFlag);
        const timeDiff = Date.now() - clearedTime;

        // Si fue limpiado hace menos de 5 minutos, no cargar desde storage
        if (timeDiff < 5 * 60 * 1000) { // 5 minutos
          console.log('🚫 CartService: Carrito fue limpiado recientemente, no cargando desde storage');
          localStorage.removeItem('cart_cleared_flag'); // Limpiar flag
          return;
        }
      }

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
    if (!items || items.length === 0) return;

    console.log(`🔄 CartService: Cargando detalles de ${items.length} items del carrito`);

    // Cargar todos los productos y variantes de manera paralela
    const loadPromises = items.map(item => {
      return forkJoin({
        product: this.productService.getProductById(item.productId).pipe(take(1)),
        variant: this.productService.getVariantById(item.variantId).pipe(take(1))
      }).pipe(
        map(({ product, variant }) => ({
          ...item,
          product: product || undefined,
          variant: variant || undefined
        })),
        catchError(error => {
          console.error(`❌ Error cargando detalles del item ${item.productId}:`, error);
          return of(item); // Devolver item sin detalles si hay error
        })
      );
    });

    forkJoin(loadPromises).subscribe({
      next: (enrichedItems) => {
        console.log('✅ CartService: Detalles de items cargados exitosamente');

        const currentCart = this.getCart();
        const updatedCart = {
          ...currentCart,
          items: enrichedItems
        };

        this.cartSubject.next(updatedCart);
      },
      error: (error) => {
        console.error('❌ CartService: Error al cargar detalles de items:', error);
      }
    });
  }

  /**
   * 🚀 CORREGIDO: Finaliza la compra con los items del carrito
   */
  checkout(): Observable<{ success: boolean, orderId?: string, error?: string }> {
    console.log('🛒 CartService: Preparando para checkout...');

    const cart = this.getCart();

    if (cart.items.length === 0) {
      return of({ success: false, error: 'El carrito está vacío' });
    }

    // ✅ AHORA: Solo validar que haya items, el inventario se procesa en backend
    console.log(`✅ CartService: ${cart.items.length} items listos para checkout`);

    return of({
      success: true,
      orderId: `temp-${Date.now()}` // ID temporal
    });
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