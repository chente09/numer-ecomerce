import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-welcome',
  imports: [
    CommonModule,
    RouterLink
  ],
  standalone: true,
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css'
})
export class WelcomeComponent {
  constructor() { }

  heroTitle = 'Para las Montañas y Más Allá';
  heroSubtitle = 'Numer Equipment: Equipamiento innovador para deportes de aventura, senderismo y montaña.';
  ctaText = 'Ver Novedades';
  ctaLink = '/new-arrivals';

}
