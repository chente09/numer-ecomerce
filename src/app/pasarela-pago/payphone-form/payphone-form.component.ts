import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CartService, Cart } from '../services/cart/cart.service';
import { HttpClient } from '@angular/common/http';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzResultModule } from 'ng-zorro-antd/result';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import {
  BehaviorSubject,
  Observable,
  Subject,
  catchError,
  filter,
  firstValueFrom,
  map,
  switchMap,
  take,
  takeUntil,
  tap,
  timeout,
} from 'rxjs';
import { ErrorUtil } from '../../utils/error-util';
import { UsersService } from '../../services/users/users.service';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';

// Interfaces (sin cambios)
interface PayphoneInitData {
  amount: number;
  reference: string;
  transactionId: string;
}

interface PayphoneResponse {
  transactionId: string;
  clientTransactionId?: string;
  statusCode?: number;
  [key: string]: any; // ✅ Permite acceso a propiedades dinámicas
}

// ✅ NUEVA INTERFAZ para respuesta de confirmación
interface ConfirmationResponse {
  transactionStatus?: string;
  inventoryProcessed?: boolean;
  transactionId?: string;
  clientTransactionId?: string;
  warning?: string;
  [key: string]: any;
}

interface ValidationResult {
  valid: boolean;
  message: string;
}

// Constantes centralizadas
const PAYPHONE_CONFIG = {
  API_ENDPOINT: 'https://backend-numer.netlify.app/.netlify/functions/payphone',
  RENDER_MAX_RETRIES: 15,
  RENDER_INTERVAL: 200,
  CHECKOUT_MAX_RETRIES: 3,
  CHECKOUT_TIMEOUT: 30000,
  MIN_AMOUNT: 1,
  WHATSAPP_URL: 'https://wa.me/593987125801',
  COORDINATES: { lat: '-0.2299', lng: '-78.5249' }
} as const;

@Component({
  selector: 'app-payphone-form',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    NzSpinModule, 
    NzAlertModule, 
    NzButtonModule,
    NzModalModule, 
    NzIconModule, 
    NzTagModule, 
    NzStepsModule, 
    NzCardModule,
    NzDividerModule, 
    NzResultModule,
    NzCollapseModule
  ],
  templateUrl: './payphone-form.component.html',
  styleUrl: './payphone-form.component.css',
})
export class PayphoneFormComponent implements AfterViewInit, OnDestroy {
  // Estado reactivo (preservado)
  private readonly loadingSubject = new BehaviorSubject<boolean>(true);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly destroy$ = new Subject<void>();

  private readonly currentStepSubject = new BehaviorSubject<number>(1);
  private readonly paymentResultSubject = new BehaviorSubject<any>(null);

  // Observables públicos (preservados)
  cartSummary$: Observable<Cart>;
  readonly isLoading$ = this.loadingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();
  readonly currentStep$ = this.currentStepSubject.asObservable();
  readonly paymentResult$ = this.paymentResultSubject.asObservable();

  transactionId = '';
  currencyCode = 'USD';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cartService: CartService,
    private http: HttpClient,
    private modalService: NzModalService,
    private usersService: UsersService
  ) {
    this.cartSummary$ = this.cartService.cart$;
  }

  ngAfterViewInit(): void {
    // ✅ PRESERVADO: Verificar sesión existente + inicializar
    this.checkExistingSessionAndInitialize();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  retryPayment(): void {
    this.setError(null);
    this.initializePayment();
  }

  volverAlCarrito(): void {
    this.router.navigate(['/carrito']);
  }

  // 🔄 PRESERVADO: Lógica original de verificación de sesión
  private checkExistingSessionAndInitialize(): void {
    this.route.queryParams
      .pipe(
        take(1),
        tap((params) => {
          if (params['transId']) {
            this.transactionId = params['transId'];
            console.log('Retomando transacción existente:', this.transactionId);
          }
        }),
        // Continúa con inicialización
        switchMap(() => this.initializePayment()),
        takeUntil(this.destroy$)
      )
      .subscribe({
        error: (error) => this.handleApiError(error)
      });
  }

  // 🎯 OPTIMIZADO: Inicialización de pago como Observable
  private initializePayment(): Observable<any> {
    console.log('🔄 Inicializando proceso de pago...');

    return this.validateCartAsObservable().pipe(
      map(cart => this.createPaymentData(cart)),
      tap(() => this.setLoading(true)),
      switchMap(paymentData => this.callPayphoneAPI(paymentData)),
      tap(response => this.handleApiSuccess(response)),
      catchError(error => {
        this.handleApiError(error);
        throw error;
      })
    );
  }

  // 🔍 OPTIMIZADO: Validación como Observable
  private validateCartAsObservable(): Observable<Cart> {
    return this.cartService.cart$.pipe(
      take(1),
      map(cart => {
        // Validación de carrito vacío
        if (!cart || cart.items.length === 0) {
          this.setError('El carrito está vacío. No se puede procesar el pago.');
          this.redirectToCartWithMessage('Carrito vacío');
          throw new Error('EMPTY_CART');
        }

        // Validación de stock
        const stockValidation = this.validateCartStock(cart);
        if (!stockValidation.valid) {
          this.setError(`Stock insuficiente: ${stockValidation.message}`);
          this.redirectToCartWithMessage('Stock insuficiente');
          throw new Error('INSUFFICIENT_STOCK');
        }

        // Validación de monto mínimo
        if (cart.total < PAYPHONE_CONFIG.MIN_AMOUNT) {
          this.setError('El monto mínimo para procesar un pago es $1.00');
          this.redirectToCartWithMessage('Monto inválido');
          throw new Error('INVALID_AMOUNT');
        }

        console.log('✅ Carrito validado, preparando pago...');
        return cart;
      })
    );
  }

  // ✅ PRESERVADO: Validación de stock (sin cambios)
  private validateCartStock(cart: Cart): ValidationResult {
    // Esta validación es opcional ahora, ya que el backend hace la validación final
    // Pero la puedes mantener para UX (mostrar problemas antes de intentar pagar)
    for (const item of cart.items) {
      if (!item.variant || item.variant.stock < item.quantity) {
        return {
          valid: false,
          message: `${item.product?.name}: disponible ${item.variant?.stock || 0}, solicitado ${item.quantity}`
        };
      }
    }
    return { valid: true, message: '' };
  }

  // 🎯 OPTIMIZADO: Creación de datos de pago
  private createPaymentData(cart: Cart): PayphoneInitData {
    // Generar transactionId si no existe
    if (!this.transactionId) {
      this.transactionId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    }

    const params = this.route.snapshot.queryParams;
    return {
      amount: Math.round(cart.total * 100),
      reference: params['referencia'] || `Compra ${cart.items.length} artículo${cart.items.length !== 1 ? 's' : ''}`,
      transactionId: this.transactionId
    };
  }

  // ✅ PRESERVADO: Llamada a API (sin cambios)
  private callPayphoneAPI(data: PayphoneInitData): Observable<any> {
    return this.cartService.cart$.pipe(
      take(1),
      switchMap(cart => {
        const cartItems = cart.items.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          productName: item.product?.name,
          variantName: `${item.variant?.colorName}-${item.variant?.sizeName}`
        }));

        return this.http.post(PAYPHONE_CONFIG.API_ENDPOINT, {
          ...data,
          cartItems, // ✅ Enviar items al backend
          userId: this.getCurrentUserId() || 'anonymous'
        });
      }),
      catchError(error => {
        throw ErrorUtil.handleCatchError(error, 'PayphoneAPI');
      })
    );
  }

  private getCurrentUserId(): string | null {
    const user = this.usersService.getCurrentUser();
    return user ? user.uid : null; // Firebase usa .uid, no .id
  }

  // ✅ PRESERVADO: Manejo de éxito de API
  private handleApiSuccess(data: any): void {
    try {
      this.renderPayphoneButton(data);
    } catch (error) {
      this.setError('Error al inicializar el botón de pago. Por favor, recarga la página.');
      console.error('Error renderizando botón de Payphone:', error);
    } finally {
      this.setLoading(false);
    }
  }

  // ✅ PRESERVADO: Manejo de errores de API
  private handleApiError(error: any): void {
    const errorMsg = ErrorUtil.formatError(error, 'PayphoneInit');
    console.error(errorMsg);
    this.setError('No se pudo conectar con el servicio de pago. Por favor, intenta de nuevo más tarde.');
    this.setLoading(false);
  }

  // ✅ PRESERVADO: Renderizado del botón (sin cambios)
  private renderPayphoneButton(data: any): void {
    console.log('🎨 Renderizando botón de Payphone...');

    let retries = 0;
    const renderInterval = setInterval(() => {
      const target = document.getElementById('pp-button');
      const PPaymentButtonBox = (window as any).PPaymentButtonBox;

      if (target && typeof PPaymentButtonBox !== 'undefined') {
        clearInterval(renderInterval);

        try {
          target.innerHTML = '';

          new PPaymentButtonBox({
            ...data,
            lang: 'es',
            defaultMethod: 'card',
            timeZone: -5,
            ...PAYPHONE_CONFIG.COORDINATES,
            onSuccess: (response: PayphoneResponse) => this.handlePaymentSuccess(response),
            onError: (error: any) => this.handlePaymentError(error),
            onCancel: () => {
              console.log('🚫 Pago cancelado por el usuario');
              this.setError('Pago cancelado. Puedes intentar de nuevo.');
            }
          }).render('pp-button');

          console.log('✅ Botón de Payphone renderizado exitosamente');
        } catch (error) {
          console.error('❌ Error al renderizar el botón:', error);
          this.setError('Error al inicializar el botón de pago. Por favor, recarga la página.');
        }
      } else {
        retries++;
        if (retries >= PAYPHONE_CONFIG.RENDER_MAX_RETRIES) {
          clearInterval(renderInterval);
          console.error('❌ Timeout: No se pudo cargar Payphone después de varios intentos');
          this.setError('No se pudo cargar el botón de pago. Verifica tu conexión e intenta recargar la página.');
        } else {
          console.log(`⏳ Esperando Payphone... Intento ${retries}/${PAYPHONE_CONFIG.RENDER_MAX_RETRIES}`);
        }
      }
    }, PAYPHONE_CONFIG.RENDER_INTERVAL);
  }

  // ✅ PRESERVADO: Manejo de pago exitoso (sin cambios en lógica)
  private handlePaymentSuccess(response: PayphoneResponse): void {
    console.log('🎉 Pago exitoso:', response);
    this.setLoading(true);

    // ✅ Verificar confirmación del pago antes de limpiar carrito
    this.confirmPaymentAndCleanCart(response);
  }

  // ✅ NUEVO: Método para confirmar pago y limpiar carrito
  private async confirmPaymentAndCleanCart(response: PayphoneResponse): Promise<void> {
    try {
      this.setLoading(true);
      this.setCurrentStep(2); // ✅ Correcto: Mostrar paso "Confirmación"

      const confirmationResponse = await firstValueFrom(
        this.http.post<ConfirmationResponse>(
          'https://backend-numer.netlify.app/.netlify/functions/confirmacion',
          {
            id: response['id'] || response.transactionId,
            clientTxId: response.clientTransactionId || this.transactionId
          }
        )
      );

      console.log('📋 Respuesta de confirmación:', confirmationResponse);

      const shouldClearCart = confirmationResponse && (
        confirmationResponse.inventoryProcessed === true ||
        confirmationResponse.transactionStatus === 'Approved'
      );

      if (shouldClearCart) {
        console.log('✅ Inventario procesado exitosamente, limpiando carrito...');
        this.cartService.clearCart();

        // ✅ MOSTRAR TICKET en lugar de modal
        this.setPaymentResult(confirmationResponse);
        this.setLoading(false);

      } else {
        console.warn('⚠️ Pago no confirmado:', confirmationResponse);
        this.setCurrentStep(1); // ✅ VOLVER al paso de pago si hay error
        this.handlePostPaymentError(
          'Pago pendiente de confirmación',
          response.transactionId || 'unknown'
        );
      }

    } catch (error: any) {
      console.error('❌ Error confirmando pago:', error);
      this.setCurrentStep(1); // ✅ VOLVER al paso de pago si hay error
      this.handlePostPaymentError(
        `Error en confirmación: ${error.message}`,
        response.transactionId || 'unknown'
      );
    } finally {
      // ✅ CORRECTO: Se ejecuta siempre
      this.setLoading(false);
    }
  }

  // ✅ NUEVOS métodos auxiliares
  private setCurrentStep(step: number): void {
    this.currentStepSubject.next(step);
  }

  private setPaymentResult(result: any): void {
    this.paymentResultSubject.next(result);
  }

  // ✅ MÉTODOS para el ticket
  get friendlyStatus(): string {
    const result = this.paymentResultSubject.value;
    const status = result?.transactionStatus;
    switch (status) {
      case 'Approved': return 'Aprobado';
      case 'Canceled':
      case 'Cancelled': return 'Cancelado';
      case 'Error': return 'Error en la transacción';
      default: return status || '';
    }
  }

  isCanceled(): boolean {
    const result = this.paymentResultSubject.value;
    const s = result?.transactionStatus;
    return s === 'Canceled' || s === 'Cancelled';
  }

  printTicket(): void {
    window.print();
  }

  // ✅ NUEVO: Volver a comprar
  goBackToShopping(): void {
    this.router.navigate(['/shop']);
  }

  // ✅ PRESERVADO: Manejo de errores de pago
  private handlePaymentError(error: any): void {
    console.error('Error en el pago:', error);
    this.setError('Se produjo un error al procesar el pago. Por favor, intenta con otro método de pago o contacta con servicio al cliente.');
  }

  // 🎯 OPTIMIZADO: Manejo de errores post-pago con categorización
  private handlePostPaymentError(errorMessage: string, paymentId: string): void {
    console.error('❌ Error después del pago exitoso:', errorMessage);
  }

  // 🎯 NUEVO: Categorización de errores
  private categorizeError(errorMessage: string): 'inventory' | 'timeout' | 'generic' {
    const lowerMessage = errorMessage.toLowerCase();
    if (lowerMessage.includes('stock') || lowerMessage.includes('inventario')) return 'inventory';
    if (lowerMessage.includes('timeout') || lowerMessage.includes('tiempo')) return 'timeout';
    return 'generic';
  }

  // ✅ PRESERVADO: Redirección con mensaje
  private redirectToCartWithMessage(reason: string): void {
    setTimeout(() => {
      this.router.navigate(['/carrito'], { queryParams: { error: reason } });
    }, 2000);
  }

  // ✅ PRESERVADO: Modal de éxito
  private showSuccessModal(orderId: string, paymentId: string): void {
    this.modalService.success({
      nzTitle: '¡Pago Exitoso!',
      nzContent: 'Tu pago ha sido procesado correctamente. Serás redirigido a la página de confirmación.',
      nzOkText: 'Continuar',
      nzOnOk: () => {
        this.router.navigate(['/confirmacion'], { queryParams: { orderId, paymentId } });
      }
    });
  }


  // 🛠️ UTILIDADES: Gestión de estado
  private setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  private setError(message: string | null): void {
    this.errorSubject.next(message);
  }
}