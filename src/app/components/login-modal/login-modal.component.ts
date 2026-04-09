import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

// Servicios
import { UsersService } from '../../services/users/users.service';

// NG-Zorro
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-login-modal',
  standalone: true,
  imports: [
    CommonModule,
    NzModalModule,
    NzButtonModule,
    NzIconModule,
    NzSpinModule
  ],
  templateUrl: './login-modal.component.html',
  styleUrls: ['./login-modal.component.css']
})
export class LoginModalComponent {

  @Input() visible: boolean = false;
  @Input() message: string = 'Para continuar, necesitas iniciar sesión con tu cuenta de Google.';

  @Output() loginSuccess = new EventEmitter<void>();
  @Output() modalClosed = new EventEmitter<void>();

  loading = false;

  constructor(
    private usersService: UsersService,
    private messageService: NzMessageService
  ) { }

  async handleLogin(): Promise<void> {
    if (this.loading) return;

    this.loading = true;

    try {
      // 1. Establecer persistencia local
      try {
        await this.usersService.setLocalPersistence();
      } catch (persistenceError) {
        console.warn('No se pudo establecer persistencia local:', persistenceError);
        // Continuar de todos modos
      }

      // 2. Login con Google
      const result = await this.usersService.loginWithGoogle();

      if (result && result.user) {
        this.messageService.success('¡Inicio de sesión exitoso!');

        // 3. Registrar actividad (sin bloquear el flujo si falla)
        try {
          await this.usersService.logUserActivity('login', 'authentication', { method: 'google' });
        } catch (activityError) {
          console.warn('No se pudo registrar actividad:', activityError);
        }

        // 4. Emitir evento de éxito
        this.loginSuccess.emit();

        // 5. Cerrar modal después de un delay
        setTimeout(() => {
          this.handleCancel();
        }, 300);
      }
    } catch (error: any) {
      console.error('Error al iniciar sesión:', error);

      // Manejo de errores específicos
      const errorCode = error?.code || '';
      const errorMessage = error?.message || '';

      if (errorCode === 'auth/popup-closed-by-user') {
        this.messageService.warning('Cancelaste el inicio de sesión');
      } else if (errorCode === 'auth/network-request-failed') {
        this.messageService.error('Error de conexión. Verifica tu conexión a internet.');
      } else if (errorCode === 'auth/internal-error') {
        this.messageService.error('Error de configuración. Por favor, recarga la página e intenta nuevamente.');
        console.error('Detalles del error interno:', errorMessage);
      } else if (errorCode === 'auth/popup-blocked') {
        this.messageService.error('El navegador bloqueó la ventana de inicio de sesión. Por favor, permite ventanas emergentes.');
      } else if (errorCode === 'auth/unauthorized-domain') {
        this.messageService.error('Este dominio no está autorizado. Contacta al administrador.');
      } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
        this.messageService.error('Error de red. Verifica tu conexión a internet.');
      } else {
        this.messageService.error('No se pudo iniciar sesión. Por favor, intenta nuevamente.');
      }
    } finally {
      this.loading = false;
    }
  }

  handleCancel(): void {
    if (!this.loading) {
      this.modalClosed.emit();
    }
  }
}