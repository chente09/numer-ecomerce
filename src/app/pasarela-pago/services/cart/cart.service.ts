import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, from, of, forkJoin, map, catchError, Subject, takeUntil, firstValueFrom } from 'rxjs';
import { Product, ProductVariant } from '../../../models/models';
import { ProductService } from '../../../services/admin/product/product.service';
import { UsersService } from '../../../services/users/users.service';
import { deleteDoc, doc, Firestore, getDoc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { User } from '@angular/fire/auth';
import { NzMessageService } from 'ng-zorro-antd/message';
import { HttpClient, HttpHeaders } from '@angular/common/http';

// --- Tus Interfaces (no cambian) ---
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
export class CartService implements OnDestroy {
  // --- Inyección de Dependencias ---
  private firestore = inject(Firestore);
  private productService = inject(ProductService);
  private usersService = inject(UsersService);
  private message = inject(NzMessageService);
  private http = inject(HttpClient);
  
  // --- Propiedades de Estado ---
  private currentUserId: string | null = null;
  private readonly GUEST_CART_KEY = 'guestCart';
  private initialCartState: Cart = {
    items: [], totalItems: 0, subtotal: 0, tax: 0, shipping: 0, discount: 0, total: 0
  };
  private cartSubject = new BehaviorSubject<Cart>(this.initialCartState);
  public cart$: Observable<Cart> = this.cartSubject.asObservable();
  private destroy$ = new Subject<void>();

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

  public addToCart(productId: string, variantId: string, quantity: number, productData?: Product, variantData?: ProductVariant): Observable<boolean> {
    const promise = (async () => {
      const product = productData ?? await firstValueFrom(this.productService.getProductById(productId));
      const variant = variantData ?? await firstValueFrom(this.getVariantById(variantId));
      if (!product || !variant) throw new Error("Producto no encontrado.");
      
      const currentItems = this.getCart().items;
      const existingItem = currentItems.find(i => i.variantId === variantId);
      const newQuantity = (existingItem?.quantity || 0) + quantity;

      if (variant.stock < newQuantity) throw new Error(`Stock insuficiente para ${product.name}. Disponibles: ${variant.stock}`);

      let newItems: CartItem[];
      if (existingItem) {
        newItems = currentItems.map(item => item.variantId === variantId ? { ...item, quantity: newQuantity } : item);
      } else {
        newItems = [...currentItems, {
          productId, variantId, quantity, product, variant,
          unitPrice: product.currentPrice ?? product.price,
          totalPrice: (product.currentPrice ?? product.price) * quantity,
        }];
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
    const newCart = { ...this.initialCartState, items };
    newCart.totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    newCart.subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    newCart.tax = newCart.subtotal * 0.15; // Tu lógica de impuestos
    newCart.total = newCart.subtotal + newCart.tax + newCart.shipping - newCart.discount;
    return newCart;
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
  public async createDistributorOrder(): Promise<{ success: boolean; orderId?: string }> {
    const cart = this.getCart();
    if (cart.items.length === 0) {
      throw new Error("El carrito está vacío.");
    }
    
    // 1. Obtenemos el token de autenticación del usuario actual
    const idToken = await this.usersService.getIdToken();
    if (!idToken) {
      throw new Error("No se pudo verificar la autenticación del usuario.");
    }

    // 2. Preparamos la petición para tu backend de Node.js
    const url = 'https://backend-numer.netlify.app/.netlify/functions/create-distributor-order'; 
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${idToken}`
    });
    
    const orderPayload = {
      cartItems: cart.items.map(item => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice
      })),
      total: cart.total
    };
    
    // 3. Hacemos la llamada POST a tu servidor
    return firstValueFrom(
      this.http.post<{ success: boolean; orderId?: string }>(url, orderPayload, { headers })
    );
  }
}