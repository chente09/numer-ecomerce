import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzInputModule } from 'ng-zorro-antd/input';


@Component({
  selector: 'app-newsletter',
  imports: [
    CommonModule,
    FormsModule,
    NzGridModule,
    NzInputModule
  ],
  templateUrl: './newsletter.component.html',
  styleUrl: './newsletter.component.css'
})
export class NewsletterComponent {

  emailSubscription = '';

  subscribeToNewsletter() {
    if (this.emailSubscription && this.validateEmail(this.emailSubscription)) {
      // Aquí iría la lógica para guardar el email en la base de datos
      console.log('Email suscrito:', this.emailSubscription);
      alert('¡Gracias por suscribirte a nuestro newsletter!');
      this.emailSubscription = '';
    } else {
      alert('Por favor, introduce un email válido.');
    }
  }

  
  validateEmail(email: string): boolean {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(String(email).toLowerCase());
  }

}
