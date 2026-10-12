import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, TERMS_VERSION } from '../../core/legal';

type LegalDoc = 'privacy' | 'deslinde';

// Renders the privacy policy and the event liability waiver (route data: { doc })
@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.css'
})
export class LegalPageComponent {
  readonly doc: LegalDoc;
  readonly version = TERMS_VERSION;
  readonly email = SUPPORT_EMAIL;
  readonly whatsapp = `https://wa.me/${SUPPORT_WHATSAPP}`;

  constructor(route: ActivatedRoute) {
    this.doc = route.snapshot.data['doc'] === 'deslinde' ? 'deslinde' : 'privacy';
  }
}
