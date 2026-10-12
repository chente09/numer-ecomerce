import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Subscription } from 'rxjs';
import { UsersService } from '../../services/users/users.service';

@Component({
  selector: 'app-newsletter',
  imports: [
    CommonModule,
    NzGridModule,
    NzButtonModule,
    NzIconModule
  ],
  templateUrl: './newsletter.component.html',
  styleUrl: './newsletter.component.css'
})
export class NewsletterComponent implements OnInit, OnDestroy {
  public usersService = inject(UsersService);
  private message = inject(NzMessageService);
  private subscription?: Subscription;
  private statusSubscription?: Subscription;

  isLoading = false;
  isUserLoggedIn = false;
  userEmail: string | null = null;
  isSubscribed = false;

  ngOnInit() {
    // Follows the shared state, so subscribing from the footer is reflected here immediately
    this.statusSubscription = this.usersService.newsletterSubscribed$.subscribe(value => {
      this.isSubscribed = value;
    });

    this.subscription = this.usersService.user$.subscribe(async user => {
      this.isUserLoggedIn = !!user;
      
      if (user?.email) {
        this.userEmail = user.email;
        // Verificar si ya está suscrito
        await this.checkSubscriptionStatus();
      } else {
        this.userEmail = null;
        this.isSubscribed = false;
      }
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    this.statusSubscription?.unsubscribe();
  }

  async handleNewsletterAction() {
    if (!this.isUserLoggedIn) {
      // Si no está logueado, iniciar sesión con Google
      await this.loginAndSubscribe();
    } else if (!this.isSubscribed) {
      // Si está logueado pero no suscrito, suscribir
      await this.subscribeToNewsletter();
    } else {
      // Si ya está suscrito, mostrar mensaje
      this.message.info('Ya estás suscrito a nuestro newsletter 📧');
    }
  }

  private async loginAndSubscribe() {
    this.isLoading = true;

    try {
      // Iniciar sesión con Google
      const result = await this.usersService.loginWithGoogle();
      
      if (result.user?.email) {
        this.message.success(`¡Bienvenido, ${result.user.displayName || result.user.email}!`);
        
        // Pequeña pausa para mejor UX
        setTimeout(async () => {
          await this.subscribeToNewsletter();
        }, 1000);
      }
    } catch (error: any) {
      console.error('Error en login con Google:', error);
      
      if (error.code === 'auth/popup-closed-by-user') {
        this.message.info('Proceso de login cancelado');
      } else if (error.code === 'auth/popup-blocked') {
        this.message.warning('Las ventanas emergentes están bloqueadas. Por favor, permite ventanas emergentes para continuar.');
      } else {
        this.message.error('Error al iniciar sesión. Por favor, inténtalo de nuevo.');
      }
    } finally {
      this.isLoading = false;
    }
  }

  private async subscribeToNewsletter() {
    if (!this.userEmail) {
      this.message.error('No se pudo obtener el email del usuario');
      return;
    }

    this.isLoading = true;

    try {
      const subscriptionData = {
        email: this.userEmail.toLowerCase().trim(),
        subscribedAt: new Date(),
        source: 'newsletter-component-google-auth',
        isActive: true,
        userId: this.usersService.getCurrentUser()?.uid || null
      };

      await this.usersService.saveNewsletterSubscription(subscriptionData);
      await this.updateUserNewsletterPreference();

      this.isSubscribed = true;
      this.message.success('¡Te has suscrito exitosamente a nuestro newsletter! 🎉');
      
    } catch (error) {
      console.error('Error suscribiendo al newsletter:', error);
      this.message.error('Error al procesar la suscripción. Inténtalo de nuevo.');
    } finally {
      this.isLoading = false;
    }
  }

  private async updateUserNewsletterPreference() {
    try {
      const userProfile = await this.usersService.getUserProfile();
      
      await this.usersService.saveUserProfile({
        ...userProfile,
        newsletterSubscribed: true,
        newsletterSubscribedAt: new Date()
      });
    } catch (error) {
      console.warn('Error actualizando preferencias de usuario:', error);
    }
  }

  private async checkSubscriptionStatus() {
    if (!this.userEmail) return;

    await this.usersService.refreshNewsletterStatus();
  }

  // Método auxiliar para obtener el texto del botón
  getButtonText(): string {
    if (this.isLoading) {
      return this.isUserLoggedIn ? 'Suscribiendo...' : 'Iniciando sesión...';
    }
    
    if (!this.isUserLoggedIn) {
      return 'Suscribirse';
    }
    
    if (this.isSubscribed) {
      return '✓ Ya estás suscrito';
    }
    
    return 'Suscribirse al newsletter';
  }

  // Método auxiliar para el icono del botón
  getButtonIcon(): string {
    if (this.isLoading) {
      return 'loading';
    }
    
    if (!this.isUserLoggedIn) {
      return '';
    }
    
    if (this.isSubscribed) {
      return '';
    }
    
    return 'mail';
  }
}