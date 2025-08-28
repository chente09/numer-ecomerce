import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, from, of, forkJoin, map, catchError, Subject, takeUntil, firstValueFrom } from 'rxjs';
import { Promotion, ProductVariant, Cart, CartItem } from '../../../models/models';
import { PromotionService } from '../../../services/admin/promotion/promotion.service';
import { ProductService } from '../../../services/admin/product/product.service';
import { UsersService } from '../../../services/users/users.service';
import { deleteDoc, doc, Firestore, getDoc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { User } from '@angular/fire/auth';
import { NzMessageService } from 'ng-zorro-antd/message';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ShippingInfo } from '../../shipping-info-modal/shipping-info-modal.component';


@Injectable({
  providedIn: 'root'
})
export class CartService implements OnDestroy {
  // --- Inyección de Dependencias ---
  private firestore = inject(Firestore);
  private productService = inject(ProductService);
  private usersService = inject(UsersService);
  private promotionService = inject(PromotionService);
  private message = inject(NzMessageService);
  private http = inject(HttpClient);

  // --- Propiedades de Estado ---
  private currentUserId: string | null = null;
  private readonly GUEST_CART_KEY = 'guestCart';
  private initialCartState: Cart = {
    items: [], totalItems: 0, subtotal: 0, tax: 0, shipping: 0, discount: 0, totalSavings: 0, total: 0
  };
  private cartSubject = new BehaviorSubject<Cart>(this.initialCartState);
  public cart$: Observable<Cart> = this.cartSubject.asObservable();
  private destroy$ = new Subject<void>();
  private appliedCoupon: Promotion | null = null;

  constructor() {
    // Suscripción única para manejar el estado del usuario
    this.usersService.user$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.handleUserChange(user);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // --- LÓGICA CENTRAL DE MANEJO DE ESTADO ---

  private async handleUserChange(user: User | null): Promise<void> {
    const wasLoggedIn = !!this.currentUserId;
    this.currentUserId = user ? user.uid : null;

    if (this.currentUserId && !wasLoggedIn) {
      // Caso 1: Un invitado acaba de iniciar sesión -> Fusionar carritos
      await this.mergeLocalWithFirestore();
    } else if (this.currentUserId) {
      // Caso 2: Un usuario ya logueado recarga la página -> Cargar desde Firestore
      const firestoreItems = await this.loadFirestoreCartItems();
      this.updateCartState(firestoreItems);
    } else {
      // Caso 3: Es un invitado o un usuario acaba de cerrar sesión -> Cargar desde localStorage
      const guestItems = this.getGuestCartItems();
      this.updateCartState(guestItems);
    }
  }

  private async mergeLocalWithFirestore(): Promise<void> {
    const guestItems = this.getGuestCartItems();
    const firestoreItems = await this.loadFirestoreCartItems();

    // Lógica de fusión que suma cantidades si el item ya existía
    const mergedItems = this.mergeItems(guestItems, firestoreItems);

    this.updateCartState(mergedItems);
    await this.saveCartToFirestore(mergedItems);
    localStorage.removeItem(this.GUEST_CART_KEY);
  }

  // --- MÉTODOS PÚBLICOS (API del Servicio, compatible con tu código) ---

  public getCart = (): Cart => this.cartSubject.getValue();

  public getCartItemCount = (): Observable<number> => this.cart$.pipe(map(cart => cart.totalItems));

  public getVariantById = (variantId: string): Observable<ProductVariant | undefined> => this.productService.getVariantById(variantId);

  public addToCart(productId: string, variantId: string, quantity: number): Observable<boolean> {
  const promise = (async () => {
    // 1. Obtener los datos más frescos del producto y la variante.
    // El 'product' que recibimos de getProductById ya viene con su precio final calculado.
    const [product, variant] = await Promise.all([
      firstValueFrom(this.productService.getProductById(productId)),
      firstValueFrom(this.getVariantById(variantId)),
    ]);

    if (!product || !variant) throw new Error("Producto o variante no encontrados.");

    // 2. Validar stock (sin cambios)
    const currentItems = this.getCart().items;
    const existingItem = currentItems.find(i => i.variantId === variantId);
    const newQuantity = (existingItem?.quantity || 0) + quantity;
    if (variant.stock < newQuantity) throw new Error(`Stock insuficiente. Disponibles: ${variant.stock}`);

    // 3. ✅ NUEVA LÓGICA DE PRECIOS Y TÍTULOS: Lee la información que ya existe.
    let unitPrice = 0;
    let originalUnitPrice: number | undefined = undefined;
    let appliedPromotionTitle: string | undefined = undefined;

    // Prioridad 1: Usar el precio de la VARIANTE si tiene un descuento específico.
    if (variant.discountedPrice && variant.originalPrice && variant.discountedPrice < variant.originalPrice) {
      unitPrice = variant.discountedPrice;
      originalUnitPrice = variant.originalPrice;
      // Obtenemos el nombre de la promoción de la variante
      if (variant.promotionId) {
        const promo = await firstValueFrom(this.promotionService.getPromotionById(variant.promotionId));
        appliedPromotionTitle = promo?.name; // <-- AQUÍ SE OBTIENE EL NOMBRE
      }
    } 
    // Prioridad 2: Usar el precio del PRODUCTO si tiene un descuento general.
    else if (product.currentPrice && product.originalPrice && product.currentPrice < product.originalPrice) {
      unitPrice = product.currentPrice;
      originalUnitPrice = product.originalPrice;
      // Obtenemos el nombre de la promoción del producto
      if (product.promotionId) {
        const promo = await firstValueFrom(this.promotionService.getPromotionById(product.promotionId));
        appliedPromotionTitle = promo?.name; // <-- O AQUÍ SE OBTIENE EL NOMBRE
      }
    }
    // Prioridad 3: Usar el precio base si no hay descuentos.
    else {
      unitPrice = variant.price || product.price;
      originalUnitPrice = undefined;
      appliedPromotionTitle = undefined;
    }
    
    // 4. Construir y guardar el item del carrito con el título correcto
    let newItems: CartItem[];
    const newItemData: CartItem = {
      productId,
      variantId,
      quantity,
      product,
      variant,
      unitPrice,
      originalUnitPrice,
      appliedPromotionTitle, // <-- El nombre correcto se guarda aquí
      totalPrice: unitPrice * quantity,
    };
    
    if (existingItem) {
      newItemData.quantity = newQuantity;
      newItemData.totalPrice = unitPrice * newQuantity;
      newItems = currentItems.map(item => item.variantId === variantId ? newItemData : item);
    } else {
      newItems = [...currentItems, newItemData];
    }

    this.updateAndSync(newItems);
  })();

  return from(promise).pipe(
    map(() => true),
    catchError(err => {
      this.message.error(err instanceof Error ? err.message : 'No se pudo añadir al carrito.');
      return of(false);
    })
  );
}

  public updateItemQuantity(variantId: string, quantity: number): Observable<boolean> {
    if (quantity <= 0) {
      return this.removeItem(variantId);
    }
    const newItems = this.getCart().items.map(item => item.variantId === variantId ? { ...item, quantity } : item);
    this.updateAndSync(newItems);
    return of(true);
  }

  public removeItem(variantId: string): Observable<boolean> {
    const newItems = this.getCart().items.filter(item => item.variantId !== variantId);
    this.updateAndSync(newItems);
    return of(true);
  }

  public clearCart(): void {
    this.updateAndSync([]);
  }

  public applyDiscount(code: string, amount: number): boolean {
    const cart = this.getCart();
    cart.discount = amount;
    this.updateCartState(cart.items);
    this.syncCart(cart.items);
    return true;
  }

  /**
   * ✅ MÉTODO REFACTORIZADO: Valida y aplica un código de descuento.
   */
  public async applyDiscountCode(code: string): Promise<{ success: boolean; message: string }> {
    if (!code.trim()) {
      return { success: false, message: 'Por favor, ingresa un código.' };
    }

    const promotion = await firstValueFrom(this.promotionService.getPromotionByCode(code));

    if (!promotion) {
      return { success: false, message: 'El código de descuento no es válido o ha expirado.' };
    }

    const cart = this.getCart();

    // Validar monto mínimo de compra
    if (promotion.minPurchaseAmount && cart.subtotal < promotion.minPurchaseAmount) {
      return { success: false, message: `Este código requiere una compra mínima de $${promotion.minPurchaseAmount.toFixed(2)}.` };
    }

    // Si todo es válido, guardamos el cupón y recalculamos el carrito
    this.appliedCoupon = promotion;
    this.updateAndSync(cart.items); // Esto forzará un recálculo

    return { success: true, message: `¡Cupón "${promotion.name}" aplicado con éxito!` };
  }

  /**
   * ✅ NUEVO: Remueve el cupón aplicado
   */
  public removeDiscountCode(): void {
    this.appliedCoupon = null;
    this.updateAndSync(this.getCart().items);
  }

  // --- MÉTODOS PRIVADOS AUXILIARES ---

  private updateAndSync(items: CartItem[]): void {
    this.updateCartState(items);
    this.syncCart(items);
  }

  private syncCart(items: CartItem[]): void {
    this.currentUserId
      ? this.saveCartToFirestore(items)
      : this.saveGuestCartToStorage(items);
  }

  private updateCartState(items: CartItem[]): void {
    this.loadItemDetails(items).then(enrichedItems => {
      const newCart = this.recalculateCart(enrichedItems);
      this.cartSubject.next(newCart);
    });
  }

  private recalculateCart(items: CartItem[]): Cart {
    const newCart: Cart = { ...this.initialCartState, items };
    newCart.totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    // 1. Calcular subtotal y ahorros de productos
    newCart.subtotal = items.reduce((sum, item) => {
      item.totalPrice = item.unitPrice * item.quantity;
      return sum + item.totalPrice;
    }, 0);
    newCart.totalSavings = items.reduce((sum, item) => {
      const saving = (item.originalUnitPrice || item.unitPrice) - item.unitPrice;
      return sum + (saving * item.quantity);
    }, 0);

    // 2. ✅ APLICAR DESCUENTO DEL CUPÓN (si existe)
    newCart.discount = 0;
    if (this.appliedCoupon) {
      let discountAmount = 0;
      if (this.appliedCoupon.discountType === 'percentage') {
        discountAmount = newCart.subtotal * (this.appliedCoupon.discountValue / 100);
      } else if (this.appliedCoupon.discountType === 'fixed') {
        discountAmount = this.appliedCoupon.discountValue;
      }
      // No manejamos 'shipping' aquí, eso se hace en el checkout

      newCart.discount = discountAmount;
      newCart.totalSavings += discountAmount; // Sumar al ahorro total
    }

    // 3. Calcular impuestos y total final
    const baseForTax = newCart.subtotal - newCart.discount;
    newCart.tax = baseForTax * 0.15; // Asumo IVA 15%
    newCart.shipping = this.appliedCoupon?.discountType === 'shipping' ? 0 : 5; // Lógica de envío simple
    newCart.total = baseForTax + newCart.tax + newCart.shipping;

    return newCart;
  }

  /**
   * ✅ NUEVO: Valida el stock de todos los items del carrito en tiempo real.
   */
  public async validateCartForCheckout(): Promise<{ isValid: boolean; unavailableItems: CartItem[] }> {
    const cart = this.getCart();
    const unavailableItems: CartItem[] = [];

    // Creamos un array de promesas para verificar el stock de cada item en paralelo
    const stockChecks = cart.items.map(async (item) => {
      const variant = await firstValueFrom(this.getVariantById(item.variantId));
      if (!variant || variant.stock < item.quantity) {
        unavailableItems.push(item);
      }
    });

    await Promise.all(stockChecks);

    return {
      isValid: unavailableItems.length === 0,
      unavailableItems: unavailableItems
    };
  }


  private mergeItems(guest: CartItem[], firestore: CartItem[]): CartItem[] {
    const merged = new Map<string, CartItem>();
    [...firestore, ...guest].forEach(item => {
      const existing = merged.get(item.variantId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        merged.set(item.variantId, { ...item });
      }
    });
    return Array.from(merged.values());
  }

  private async saveCartToFirestore(items: CartItem[]): Promise<void> {
    if (!this.currentUserId) return;
    const cartRef = doc(this.firestore, `users/${this.currentUserId}/cart`, 'current');
    try {
      if (items.length === 0) {
        await deleteDoc(cartRef);
      } else {
        const storableItems = items.map(item => this.toStorableItem(item));
        await setDoc(cartRef, { items: storableItems, updatedAt: serverTimestamp() });
      }
    } catch (error) {
      console.error("Error guardando en Firestore:", error);
      this.message.error("No se pudo sincronizar el carrito con la nube.");
    }
  }

  private saveGuestCartToStorage(items: CartItem[]): void {
    const storableItems = items.map(item => this.toStorableItem(item));
    localStorage.setItem(this.GUEST_CART_KEY, JSON.stringify({ items: storableItems }));
  }

  private getGuestCartItems = (): CartItem[] => JSON.parse(localStorage.getItem(this.GUEST_CART_KEY) || '{"items":[]}').items;
  private toStorableItem = (item: CartItem) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice || item.unitPrice * item.quantity });

  private async loadFirestoreCartItems(): Promise<CartItem[]> {
    if (!this.currentUserId) return [];
    try {
      const cartRef = doc(this.firestore, `users/${this.currentUserId}/cart`, 'current');
      const cartSnap = await getDoc(cartRef);
      return cartSnap.exists() ? (cartSnap.data()['items'] || []) : [];
    } catch (error) {
      console.error("Error cargando carrito de Firestore:", error);
      return [];
    }
  }

  private async loadItemDetails(items: CartItem[]): Promise<CartItem[]> {
    if (items.length === 0) return [];
    const details$ = items.map(item =>
      forkJoin({
        product: this.productService.getProductById(item.productId),
        variant: this.getVariantById(item.variantId)
      }).pipe(
        map(({ product, variant }) => ({ ...item, product: product ?? undefined, variant, totalPrice: item.quantity * item.unitPrice })),
        catchError(() => of({ ...item, product: undefined, variant: undefined }))
      )
    );
    return firstValueFrom(forkJoin(details$));
  }

  /**
   * Envía el carrito a tu backend para ser procesado como un pedido de distribuidor.
   */
  /**
 * Envía el carrito y los detalles de envío al backend.
 */
  public async createDistributorOrder(shippingDetails: ShippingInfo): Promise<{ success: boolean; orderId?: string }> {
    const cart = this.getCart();
    if (cart.items.length === 0) {
      throw new Error("El carrito está vacío.");
    }

    const idToken = await this.usersService.getIdToken();
    if (!idToken) {
      throw new Error("No se pudo verificar la autenticación del usuario.");
    }

    const url = 'https://backend-numer.netlify.app/.netlify/functions/create-distributor-order';
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${idToken}`
    });

    // ✅ AÑADIMOS shippingDetails AL PAYLOAD
    const orderPayload = {
      cartItems: cart.items.map(item => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice
      })),
      total: cart.total,
      shippingDetails: shippingDetails // <-- Aquí va la nueva información
    };

    return firstValueFrom(
      this.http.post<{ success: boolean; orderId?: string }>(url, orderPayload, { headers })
    );
  }

}