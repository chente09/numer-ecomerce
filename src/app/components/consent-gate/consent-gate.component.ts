import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subscription, filter } from 'rxjs';
import { MIN_AGE, TERMS_VERSION } from '../../core/legal';
import { UsersService } from '../../services/users/users.service';

// Routes where the gate must not interrupt (the payment flow, the legal pages themselves,
// the profile form that already asks for consent, and the admin panel)
const GATE_EXCLUDED_PREFIXES = ['/respuesta-pago', '/terms', '/privacy', '/deslinde', '/completar-perfil', '/admin'];

/**
 * Global consent gate: whatever sign-in entry point a person used (navbar, reviews, Instagram, cart...),
 * the first time they are signed in without having accepted the current terms they are asked to read
 * and accept them. Declining signs them out. The acceptance is stored with its version and date.
 */
@Component({
  selector: 'app-consent-gate',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NzModalModule, NzButtonModule],
  template: `
    <nz-modal [(nzVisible)]="visible" nzTitle="Antes de continuar" [nzClosable]="false" [nzMaskClosable]="false"
      [nzKeyboard]="false" [nzFooter]="null" [nzWidth]="480" nzCentered>
      <ng-container *nzModalContent>
        <p class="gate-intro">
          Tu cuenta es tuya, y queremos que tengas claras las reglas del juego: cómo compras, cómo te
          cambiamos o devolvemos un producto y cómo cuidamos tus datos.
        </p>

        <label class="gate-row">
          <input type="checkbox" [(ngModel)]="acceptedTerms" />
          <span>
            He leído y acepto los <a routerLink="/terms" target="_blank">Términos y Condiciones</a> y la
            <a routerLink="/privacy" target="_blank">Política de Privacidad</a>. Declaro ser mayor de {{ minAge }} años.
          </span>
        </label>

        <label class="gate-row gate-promos">
          <input type="checkbox" [(ngModel)]="acceptedPromos" />
          <span>
            <strong>Quiero ser de los primeros en saber</strong> de lanzamientos y ofertas exclusivas, y recibir
            un saludo en mi cumpleaños. <em>(Opcional)</em>
          </span>
        </label>

        <div class="gate-actions">
          <button nz-button nzType="default" class="gate-btn-secondary" (click)="decline()" [disabled]="saving">No acepto</button>
          <button nz-button nzType="primary" class="gate-btn-primary" (click)="accept()" [disabled]="!acceptedTerms"
            [nzLoading]="saving">
            Aceptar y continuar
          </button>
        </div>
      </ng-container>
    </nz-modal>
  `,
  styles: [`
    .gate-intro { color: #424242; margin-bottom: 16px; line-height: 1.5; }
    .gate-row { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.5; cursor: pointer; }
    .gate-row input { margin-top: 4px; width: 18px; height: 18px; accent-color: #000; flex-shrink: 0; }
    .gate-row a { color: #000; text-decoration: underline; }
    .gate-promos { margin-top: 14px; padding-top: 14px; border-top: 1px dashed #e0e0e0; }
    .gate-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; flex-wrap: wrap; }
    /* Brand colors: black primary, outlined secondary (never the library's default blue) */
    .gate-btn-primary { background: #000 !important; border-color: #000 !important; color: #fff !important; cursor: pointer; }
    .gate-btn-primary:hover:not(:disabled) { background: #333 !important; border-color: #333 !important; }
    .gate-btn-primary:disabled { background: #f5f5f5 !important; border-color: #d9d9d9 !important; color: #bfbfbf !important; cursor: not-allowed; }
    .gate-btn-secondary { color: #000 !important; border-color: #d9d9d9 !important; cursor: pointer; }
    .gate-btn-secondary:hover:not(:disabled) { border-color: #000 !important; background: #f5f5f5 !important; }
    @media (max-width: 480px) {
      .gate-actions { flex-direction: column-reverse; }
      .gate-actions button { width: 100%; }
    }
  `]
})
export class ConsentGateComponent implements OnInit, OnDestroy {
  visible = false;
  acceptedTerms = false;
  acceptedPromos = false;
  saving = false;
  readonly minAge = MIN_AGE;

  private authSub?: Subscription;
  private navSub?: Subscription;
  private needsConsent = false;

  constructor(
    private usersService: UsersService,
    private router: Router,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {
    this.authSub = this.usersService.user$.subscribe(async user => {
      this.needsConsent = false;
      if (user && !user.isAnonymous) {
        try {
          const profile = await this.usersService.getUserProfile(user.uid);
          this.needsConsent = profile?.termsVersion !== TERMS_VERSION;
        } catch {
          this.needsConsent = false; // never lock people out because of a read error
        }
      }
      this.refresh();
    });
    this.navSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.refresh());
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.navSub?.unsubscribe();
  }

  private refresh(): void {
    const url = this.router.url || '';
    const excluded = GATE_EXCLUDED_PREFIXES.some(p => url.startsWith(p));
    this.visible = this.needsConsent && !excluded;
  }

  async accept(): Promise<void> {
    if (!this.acceptedTerms || this.saving) return;
    this.saving = true;
    try {
      await this.usersService.recordConsent({ terms: true, marketing: this.acceptedPromos }, TERMS_VERSION);
      this.needsConsent = false;
      this.visible = false;
      this.message.success('¡Gracias! Ya puedes continuar.');
    } catch (error) {
      console.error('No se pudo guardar el consentimiento:', error);
      this.message.error('No se pudo guardar tu aceptación. Inténtalo de nuevo.');
    } finally {
      this.saving = false;
    }
  }

  async decline(): Promise<void> {
    this.saving = true;
    try {
      await this.usersService.logout();
      this.message.info('Cerraste sesión. Puedes seguir navegando la tienda.');
    } finally {
      this.needsConsent = false;
      this.visible = false;
      this.saving = false;
    }
  }
}
