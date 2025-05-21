import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CartService } from '../services/cart/cart.service';
import { HttpClient } from '@angular/common/http';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { BehaviorSubject, Observable, Subject, catchError, filter, firstValueFrom, map, switchMap, take, takeUntil, tap } from 'rxjs';
import { ErrorUtil } from '../../utils/error-util';

// Nueva interfaz para los datos de Payphone
interface PayphoneInitData {
  amount: number;
  reference: string;
  transactionId: string;
}

interface PayphoneResponse {
  transactionId: string;
  clientTransactionId?: string;
  statusCode?: number;
  [key: string]: any; // Para otras propiedades que pueda devolver la API
}

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
    NzIconModule
  ],
  templateUrl: './payphone-form.component.html',
  styleUrl: './payphone-form.component.css',
})
export class PayphoneFormComponent implements AfterViewInit, OnDestroy {
  // Subjects para estado reactivo
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private destroy$ = new Subject<void>();
  
  // Propiedades públicas como observables
  isLoading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  transactionId = '';
  
  constructor(
    private route: ActivatedRoute, 
    private router: Router,
    private cartService: CartService, 
    private http: HttpClient,
    private modalService: NzModalService
  ) {}

  ngAfterViewInit(): void {
    // Verificar si ya hay una sesión de Payphone activa
    this.checkExistingSession();
    
    // Iniciar proceso de pago
    this.initializePayment();
  }

  ngOnDestroy(): void {
    // Limpiar subscripciones
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkExistingSession(): void {
    // Verificar si hay una transacción en progreso
    this.route.queryParams.pipe(
      take(1),
      filter(params => !!params['transId']),
      tap(params => {
        this.transactionId = params['transId'] || '';
        console.log('Retomando transacción existente:', this.transactionId);
      })
    ).subscribe();
  }

  private async initializePayment(): Promise<void> {
    try {
      // Obtener el carrito una sola vez
      const cart = await firstValueFrom(this.cartService.cart$.pipe(take(1)));
      
      // Validar el carrito
      if (!cart || cart.items.length === 0) {
        this.setError('El carrito está vacío. No se puede procesar el pago.');
        return;
      }

      // Preparar los datos para la API
      this.route.queryParams.pipe(
        take(1),
        map(params => {
          // Usar el transaction ID existente o crear uno nuevo
          this.transactionId = params['transId'] || `order-${Date.now()}`;
          
          const paymentData: PayphoneInitData = {
            amount: Math.round(cart.total * 100),
            reference: params['referencia'] || `Compra ${cart.items.length} artículos`,
            transactionId: this.transactionId
          };
          
          return paymentData;
        }),
        tap(() => this.loadingSubject.next(true)),
        // Llamar a la API de Payphone
        switchMap(data => this.callPayphoneAPI(data)),
        takeUntil(this.destroy$)
      ).subscribe({
        next: (response) => this.handleApiSuccess(response),
        error: (err) => this.handleApiError(err)
      });
    } catch (error) {
      this.handleApiError(error);
    }
  }

  private callPayphoneAPI(data: PayphoneInitData): Observable<any> {
    const apiEndpoint = 'https://backend-numer.netlify.app/.netlify/functions/payphone';
    
    return this.http.post(apiEndpoint, data).pipe(
      catchError(error => {
        throw ErrorUtil.handleCatchError(error, 'PayphoneAPI');
      })
    );
  }

  private handleApiSuccess(data: any): void {
    try {
      this.renderPayphoneButton(data);
    } catch (error) {
      this.setError('Error al inicializar el botón de pago. Por favor, recarga la página.');
      console.error('Error renderizando botón de Payphone:', error);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  private handleApiError(error: any): void {
    const errorMsg = ErrorUtil.formatError(error, 'PayphoneInit');
    console.error(errorMsg);
    this.setError('No se pudo conectar con el servicio de pago. Por favor, intenta de nuevo más tarde.');
    this.loadingSubject.next(false);
  }

  private renderPayphoneButton(data: any): void {
    // Esperar a que el elemento esté disponible y la librería cargada
    const maxRetries = 10;
    let retries = 0;
    
    const renderInterval = setInterval(() => {
      const target = document.getElementById('pp-button');
      const PPaymentButtonBox = (window as any).PPaymentButtonBox;
      
      if (target && typeof PPaymentButtonBox !== 'undefined') {
        clearInterval(renderInterval);
        
        try {
          new PPaymentButtonBox({
            ...data,
            lang: 'es',
            defaultMethod: 'card',
            timeZone: -5,
            lat: '-0.2299',
            lng: '-78.5249',
            onSuccess: this.handlePaymentSuccess.bind(this),
            onError: this.handlePaymentError.bind(this)
          }).render('pp-button');
        } catch (error) {
          console.error('Error al renderizar el botón:', error);
          this.setError('Error al inicializar el botón de pago.');
        }
      } else {
        retries++;
        if (retries >= maxRetries) {
          clearInterval(renderInterval);
          this.setError('No se pudo cargar el botón de pago. Por favor, recarga la página.');
        }
      }
    }, 300);
  }
  
  // Manejador para pago exitoso
  handlePaymentSuccess(response: PayphoneResponse): void {
    console.log('Pago exitoso:', response);
    
    // Mostrar loading mientras procesamos el checkout
    this.loadingSubject.next(true);
    
    // Procesamos el checkout final
    this.cartService.checkout().pipe(
      take(1)
    ).subscribe({
      next: (result) => {
        if (result.success) {
          // Mostrar modal de éxito antes de redireccionar
          const paymentId = response.transactionId || this.transactionId;
          const orderId = result.orderId || 'unknown';
          this.showSuccessModal(orderId, paymentId);
        } else {
          throw new Error('Error al finalizar la orden después del pago.');
        }
      },
      error: (err) => {
        console.error('Error en checkout después del pago:', err);
        this.setError('El pago fue procesado pero hubo un problema al finalizar la orden. Por favor, contacta con servicio al cliente.');
        this.loadingSubject.next(false);
      }
    });
  }
  
  // Manejador para error de pago
  handlePaymentError(error: any): void {
    console.error('Error en el pago:', error);
    this.setError('Se produjo un error al procesar el pago. Por favor, intenta con otro método de pago o contacta con servicio al cliente.');
  }
  
  private showSuccessModal(orderId: string, paymentId: string): void {
    this.modalService.success({
      nzTitle: '¡Pago Exitoso!',
      nzContent: 'Tu pago ha sido procesado correctamente. Serás redirigido a la página de confirmación.',
      nzOkText: 'Continuar',
      nzOnOk: () => {
        this.router.navigate(['/confirmacion'], {
          queryParams: { orderId, paymentId }
        });
      }
    });
  }
  
  // Método para volver al carrito
  volverAlCarrito(): void {
    this.router.navigate(['/carrito']);
  }
  
  // Método para actualizar error
  private setError(message: string | null): void {
    this.errorSubject.next(message);
  }
}