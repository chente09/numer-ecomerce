import { Injectable } from '@angular/core';

const PAYPHONE_CSS = 'https://cdn.payphonetodoesposible.com/box/v1.1/payphone-payment-box.css';
const PAYPHONE_JS = 'https://cdn.payphonetodoesposible.com/box/v1.1/payphone-payment-box.js';

/**
 * El botón de pago de Payphone pesa ~620 KB (CSS + JS) y solo se usa al pagar. En vez de bajarlo
 * en todas las páginas desde index.html, se carga la primera vez que hace falta (el carrito lo
 * precarga, la página de pago lo exige) y las siguientes llamadas reutilizan la misma carga.
 */
@Injectable({ providedIn: 'root' })
export class PayphoneAssetsService {
  private pending: Promise<void> | null = null;

  ensureLoaded(): Promise<void> {
    if ((window as any).PPaymentButtonBox) return Promise.resolve();
    if (this.pending) return this.pending;

    this.pending = new Promise<void>((resolve, reject) => {
      if (!document.querySelector(`link[href="${PAYPHONE_CSS}"]`)) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = PAYPHONE_CSS;
        document.head.appendChild(css);
      }

      const existing = document.querySelector<HTMLScriptElement>(`script[src="${PAYPHONE_JS}"]`);
      const script = existing ?? document.createElement('script');
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', () => {
        this.pending = null; // permitir reintentar
        reject(new Error('No se pudo cargar el botón de pago de Payphone'));
      });
      if (!existing) {
        script.type = 'module';
        script.src = PAYPHONE_JS;
        document.head.appendChild(script);
      }
    });
    return this.pending;
  }
}
