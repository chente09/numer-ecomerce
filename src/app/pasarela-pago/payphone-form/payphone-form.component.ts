import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CartService } from '../services/cart/cart.service';
import { Cart } from '../../models/models';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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
import { ActivityLogService } from '../../services/admin/activityLog/activity-log.service';

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
export class PayphoneFormComponent implements OnInit, AfterViewInit, OnDestroy {
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
    private usersService: UsersService,
    private activityLogService: ActivityLogService
  ) {
    this.cartSummary$ = this.cartService.cart$;
  }


  ngOnInit(): void {
    // ✅ Verificar si hay un pago pendiente al cargar
    this.route.queryParams.pipe(take(1)).subscribe(params => {
      if (params['id'] && params['clientTransactionId']) {
        // Viene de redirección de Payphone - procesar confirmación
        this.handleLateConfirmation(params);
      } else {
        // Flujo normal - continuar con inicialización en ngAfterViewInit
        console.log('ℹ️ Flujo normal de pago');
      }
    });
  }

  ngAfterViewInit(): void {
    // ✅ PRESERVADO: Verificar sesión existente + inicializar
    this.checkExistingSessionAndInitialize();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private handleLateConfirmation(params: any): void {
    console.log('🔄 Procesando confirmación tardía desde URL:', params);

    this.setCurrentStep(2);
    this.setLoading(true);

    const response = {
      id: params['id'],
      clientTransactionId: params['clientTransactionId'],
      transactionId: params['id']
    };

    // Usar la misma lógica de confirmación que ya tienes
    this.confirmPaymentAndCleanCart(response);
  }
  retryPayment(): void {
    this.setError(null);
    this.initializePayment();
  }

  volverAlCarrito(): void {
    sessionStorage.setItem('reloadAfterPurchase', 'true');
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
      switchMap(async (cart) => {
        // Validación de carrito vacío
        if (!cart || cart.items.length === 0) {
          this.setError('El carrito está vacío. No se puede procesar el pago.');
          this.redirectToCartWithMessage('Carrito vacío');
          throw new Error('EMPTY_CART');
        }

        // Validación básica de stock (solo existencia de variantes)
        const stockValidation = this.validateCartStock(cart);
        if (!stockValidation.valid) {
          this.setError(`Error en el carrito: ${stockValidation.message}`);
          this.redirectToCartWithMessage('Error en carrito');
          throw new Error('CART_ERROR');
        }

        // Validación de monto mínimo
        if (cart.total < PAYPHONE_CONFIG.MIN_AMOUNT) {
          this.setError('El monto mínimo para procesar un pago es $1.00');
          this.redirectToCartWithMessage('Monto inválido');
          throw new Error('INVALID_AMOUNT');
        }

        // ✅ NUEVA VALIDACIÓN: Revalidar cupón aplicado antes del pago
        const appliedCoupon = this.cartService.getAppliedCoupon();
        if (appliedCoupon) {
          console.log('🎫 Revalidando cupón antes de procesar pago...');

          try {
            // Obtener usuario actual
            const currentUser = this.usersService.getCurrentUser();
            if (!currentUser || currentUser.isAnonymous) {
              throw new Error('Usuario no autenticado para usar cupones');
            }

            // Usar el servicio de validación completa
            const couponValidation = await firstValueFrom(
              this.cartService.cart$.pipe(
                take(1),
                switchMap(async (currentCart) => {
                  // Importar CouponUsageService si no está disponible
                  // Alternativa: usar la validación del CartService
                  const result = await this.cartService.applyDiscountCode(appliedCoupon.couponCode!);
                  return result;
                })
              )
            );

            if (!couponValidation.success) {
              this.setError(`Cupón no válido: ${couponValidation.message}`);

              // Mostrar modal para que el usuario decida
              this.modalService.error({
                nzTitle: 'Cupón No Válido',
                nzContent: `Tu cupón ya no es válido: ${couponValidation.message}\n\n¿Deseas continuar sin el cupón?`,
                nzOkText: 'Continuar sin cupón',
                nzCancelText: 'Volver al carrito',
                nzOnOk: () => {
                  // Remover cupón y recargar la página de pago
                  this.cartService.removeDiscountCode();
                  window.location.reload();
                },
                nzOnCancel: () => {
                  this.redirectToCartWithMessage('Cupón inválido');
                }
              });

              throw new Error('INVALID_COUPON');
            }

            console.log('✅ Cupón revalidado exitosamente antes del pago');
          } catch (couponError) {
            console.error('❌ Error revalidando cupón:', couponError);

            // Para otros errores, mostrar mensaje genérico
            this.setError('Error validando cupón. Por favor, intenta nuevamente.');
            this.redirectToCartWithMessage('Error de cupón');
            throw new Error('COUPON_VALIDATION_ERROR');
          }
        }

        console.log('✅ Carrito y cupón validados, preparando pago...');
        return cart;
      })
    );
  }


  // ✅ PRESERVADO: Validación de stock (sin cambios)
  private validateCartStock(cart: Cart): ValidationResult {
    console.log('ℹ️ Validación de stock desactivada - Backend se encarga de la validación final');

    // ✅ SOLO validar que existan las variantes, NO el stock
    for (const item of cart.items) {
      if (!item.variant) {
        return {
          valid: false,
          message: `${item.product?.name}: variante no encontrada`
        };
      }
    }

    // ✅ SIEMPRE retornar válido - el backend validará el stock real
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
  // En tu PayphoneFormComponent, modifica el método callPayphoneAPI:

  private callPayphoneAPI(data: PayphoneInitData): Observable<any> {
    return this.cartService.cart$.pipe(
      take(1),
      switchMap(async (cart) => {
        // 🔍 DEBUG: Verificar usuario actual
        const currentUser = this.usersService.getCurrentUser();
        console.log('🔍 Usuario actual:', {
          isAuthenticated: !!currentUser,
          uid: currentUser?.uid,
          email: currentUser?.email,
          isAnonymous: currentUser?.isAnonymous
        });

        // ✅ Verificar que el usuario no sea anónimo
        if (!currentUser || currentUser.isAnonymous) {
          throw new Error('Debes iniciar sesión para continuar con el pago');
        }

        const cartItems = cart.items.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          productName: item.product?.name,
          variantName: `${item.variant?.colorName}-${item.variant?.sizeName}`
        }));

        // ✅ Obtener el token con manejo de errores mejorado
        let idToken: string | null = null;
        try {
          idToken = await this.usersService.getIdToken();
          console.log('✅ Token obtenido:', idToken ? 'Sí' : 'No');
          console.log('📏 Longitud del token:', idToken?.length || 0);
        } catch (error) {
          console.error('❌ Error obteniendo token:', error);
          throw new Error('Error de autenticación. Por favor, inicia sesión nuevamente.');
        }

        if (!idToken) {
          throw new Error('No se pudo obtener el token de autenticación');
        }

        // ✅ Crear headers con el token
        const headers = new HttpHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        });

        // 🔍 DEBUG: Log de headers
        console.log('📤 Enviando request con headers:', {
          hasAuth: headers.has('Authorization'),
          authLength: headers.get('Authorization')?.length
        });

        // ✅ OBTENER CUPÓN APLICADO
        const appliedCoupon = this.cartService.getAppliedCoupon();

        const payload = {
          ...data,
          cartItems,
          userId: currentUser.uid,
          // ✅ CORREGIDO: appliedCoupon (antes era "ppliedCoupon")
          appliedCoupon: appliedCoupon ? {
            id: appliedCoupon.id,
            code: appliedCoupon.couponCode,
            name: appliedCoupon.name,
            discountType: appliedCoupon.discountType,
            discountValue: appliedCoupon.discountValue
          } : null
        };

        return firstValueFrom(
          this.http.post(PAYPHONE_CONFIG.API_ENDPOINT, payload, { headers })
        );
      }),
      catchError(error => {
        console.error('❌ Error en callPayphoneAPI:', error);

        // Mejorar mensajes de error
        if (error.message.includes('autenticación')) {
          this.modalService.error({
            nzTitle: 'Error de Autenticación',
            nzContent: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
            nzOnOk: () => {
              this.router.navigate(['/login'], {
                queryParams: { returnUrl: '/pago' }
              });
            }
          });
        }

        throw ErrorUtil.handleCatchError(error, 'PayphoneAPI');
      })
    );
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
            // ✅ CONFIGURACIÓN SIN REDIRECCIÓN
            autoRedirect: false, // Prevenir redirección automática
            onSuccess: (response: PayphoneResponse) => {
              console.log('🎉 Pago exitoso - manejo interno:', response);
              this.handlePaymentSuccess(response);
              return false; // ✅ CRÍTICO: Prevenir redirección
            },
            onError: (error: any) => this.handlePaymentError(error),
            onCancel: () => {
              console.log('🚫 Pago cancelado por el usuario');
              this.setError('Pago cancelado. Puedes intentar de nuevo.');
            }
          }).render('pp-button');

          console.log('✅ Botón de Payphone renderizado con configuración sin redirección');
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

    // ✅ AGREGAR: Limpiar errores previos
    this.setError(null);
    this.setLoading(true);

    this.confirmPaymentAndCleanCart(response);
  }

  // ✅ NUEVO: Método para confirmar pago y limpiar carrito
  // En PayphoneFormComponent, actualiza el método confirmPaymentAndCleanCart:

  private async confirmPaymentAndCleanCart(response: PayphoneResponse): Promise<void> {
    try {
      this.setLoading(true);
      this.setCurrentStep(2);
      this.setError(null);

      // DEBUG: Verificar estado de autenticación
      const currentUser = this.usersService.getCurrentUser();
      console.log('Usuario en confirmación:', {
        isAuthenticated: !!currentUser,
        uid: currentUser?.uid,
        email: currentUser?.email
      });

      // Obtener token con mejor manejo de errores
      let idToken: string | null = null;
      try {
        idToken = await this.usersService.getIdToken();
        console.log('Token para confirmación obtenido:', !!idToken);
      } catch (tokenError) {
        console.error('Error obteniendo token para confirmación:', tokenError);

        // Intentar reautenticar
        this.modalService.error({
          nzTitle: 'Sesión Expirada',
          nzContent: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
          nzOnOk: () => {
            this.router.navigate(['/login'], {
              queryParams: {
                returnUrl: '/pago',
                transId: this.transactionId
              }
            });
          }
        });
        return;
      }

      if (!idToken) {
        throw new Error('No se pudo obtener token de autenticación');
      }

      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      });

      // DEBUG: Log del request
      const confirmationPayload = {
        id: response['id'] || response.transactionId,
        clientTxId: response.clientTransactionId || this.transactionId
      };

      console.log('Enviando confirmación:', {
        url: 'https://backend-numer.netlify.app/.netlify/functions/confirmacion',
        payload: confirmationPayload,
        hasAuth: headers.has('Authorization')
      });

      const confirmationResponse = await firstValueFrom(
        this.http.post<ConfirmationResponse>(
          'https://backend-numer.netlify.app/.netlify/functions/confirmacion',
          confirmationPayload,
          { headers }
        ).pipe(
          catchError(error => {
            console.error('Error HTTP en confirmación:', error);

            // Analizar el tipo de error
            if (error.status === 401) {
              throw new Error('Error de autenticación. Por favor, inicia sesión nuevamente.');
            } else if (error.status === 403) {
              throw new Error('Token inválido o expirado. Por favor, inicia sesión nuevamente.');
            } else if (error.status === 0) {
              throw new Error('Error de conexión. Verifica tu conexión a internet.');
            }

            throw error;
          })
        )
      );

      console.log('Respuesta de confirmación:', confirmationResponse);

      const shouldClearCart = confirmationResponse && (
        confirmationResponse.inventoryProcessed === true ||
        confirmationResponse.transactionStatus === 'Approved'
      );

      if (shouldClearCart) {
        console.log('Inventario procesado exitosamente, limpiando carrito...');
        const currentCart = await firstValueFrom(this.cartService.cart$.pipe(take(1)));
        const transactionId = response['id'] || response.transactionId || this.transactionId;

        // NUEVO: Registrar uso de cupón ANTES de limpiar el carrito
        try {
          await this.cartService.recordCouponUsageForOrder(transactionId);
          console.log('Uso de cupón registrado para transacción:', transactionId);
        } catch (couponError) {
          console.warn('Error registrando uso de cupón (no crítico):', couponError);
          // No lanzar error para no afectar el flujo principal
        }

        try {
          await this.activityLogService.logPurchase(transactionId, currentCart.items, currentCart.total);
          console.log('Compra registrada exitosamente');
        } catch (error) {
          console.warn('Error registrando compra:', error);
        }

        this.cartService.clearCart();
        this.setPaymentResult(confirmationResponse);
        this.setLoading(false);
      } else {
        console.warn('Pago no confirmado:', confirmationResponse);
        this.setCurrentStep(1);
        this.setError('Pago pendiente de confirmación');
      }

    } catch (error: any) {
      console.error('Error en confirmación:', error);
      this.setCurrentStep(1);

      // Mejorar el mensaje de error basado en el tipo
      let errorMessage = 'Error en confirmación';
      if (error.message.includes('autenticación') || error.message.includes('Token')) {
        errorMessage = 'Error de autenticación. Por favor, inicia sesión nuevamente.';
      } else if (error.message.includes('conexión')) {
        errorMessage = 'Error de conexión. Por favor, verifica tu internet e intenta nuevamente.';
      } else {
        errorMessage = `Error: ${error.message}`;
      }

      this.setError(errorMessage);
    } finally {
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
    sessionStorage.setItem('reloadAfterPurchase', 'true');
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