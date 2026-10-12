import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FLAT_SHIPPING_USD, RETURN_DAYS, SUPPORT_EMAIL, SUPPORT_WHATSAPP, TERMS_VERSION } from '../../core/legal';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.css'
})
export class TermsComponent {
  readonly returnDays = RETURN_DAYS;
  readonly shipping = FLAT_SHIPPING_USD;
  readonly version = TERMS_VERSION;
  readonly email = SUPPORT_EMAIL;
  readonly whatsapp = `https://wa.me/${SUPPORT_WHATSAPP}`;

  // The app uses <base href="/">, so plain "#id" links would navigate to the home page
  scrollTo(id: string, event: Event): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
