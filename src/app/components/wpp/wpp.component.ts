import { Component, OnInit } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { CommonModule } from '@angular/common';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzInputModule } from 'ng-zorro-antd/input';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-wpp',
  standalone: true,
  imports: [
    NzButtonModule, 
    NzIconModule,
    CommonModule,
    NzPopoverModule,
    NzInputModule,
    FormsModule
  ],
  templateUrl: './wpp.component.html',
  styleUrl: './wpp.component.css'
})
export class WppComponent implements OnInit {
  // Configuración
  phoneNumber: string = '5930987125801';
  
  // Estados
  showTooltip: boolean = false;
  hasNewNotifications: boolean = true;
  notificationCount: number = 1;
  tooltipMessage: string = '¡Chatea con nosotros!';
  customMessage: string = '';

  constructor() {}

  ngOnInit(): void {
    // Inicializar notificaciones
    this.checkNotifications();
    
    // Personalizar mensaje según la hora
    this.setGreetingByTime();
  }

  /**
   * Método principal para redirigir a WhatsApp con mensaje predeterminado
   */
  redirectToWhatsApp(): void {
    const message = encodeURIComponent('¡Hola! Me gustaría obtener más información sobre sus productos.');
    this.openWhatsApp(message);
  }

  /**
   * Método para redirigir a WhatsApp con mensaje personalizado
   */
  redirectToWhatsAppWithMessage(message: string): void {
    if (message && message.trim() !== '') {
      const encodedMessage = encodeURIComponent(message);
      this.openWhatsApp(encodedMessage);
      
      // Limpiar el input después de enviar el mensaje
      this.customMessage = '';
    }
  }

  /**
   * Método privado para abrir WhatsApp con el mensaje
   */
  private openWhatsApp(encodedMessage: string): void {
    const whatsappUrl = `https://wa.me/${this.phoneNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  }

  /**
   * Verificar si hay promociones o novedades para mostrar notificaciones
   * En un caso real, esto podría conectarse a un servicio
   */
  private checkNotifications(): void {
    // Simulación - en producción esto vendría de tu backend
    const hasNewPromotion = true;  // Ejemplo: hay nuevas promociones
    const hasNewCollection = false; // Ejemplo: no hay nuevas colecciones
    
    this.hasNewNotifications = hasNewPromotion || hasNewCollection;
    
    // Calcular cantidad de notificaciones
    let count = 0;
    if (hasNewPromotion) count++;
    if (hasNewCollection) count++;
    this.notificationCount = count > 0 ? count : 0;
  }

  /**
   * Personalizar el mensaje del tooltip según la hora del día
   */
  private setGreetingByTime(): void {
    const hour = new Date().getHours();
    
    if (hour < 12) {
      this.tooltipMessage = '¡Buenos días!\n¿Buscas algo especial?';
    } else if (hour < 18) {
      this.tooltipMessage = '¡Buenas tardes!\n¿En qué podemos ayudarte?';
    } else {
      this.tooltipMessage = '¡Buenas noches!\nEstamos aquí para ayudarte.';
    }
  }
}