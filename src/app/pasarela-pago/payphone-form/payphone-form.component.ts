import { AfterViewInit, Component, Input } from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CartService } from '../services/cart/cart.service';

@Component({
  selector: 'app-payphone-form',
  imports: [CommonModule, FormsModule],
  templateUrl: './payphone-form.component.html',
  styleUrl: './payphone-form.component.css',
})
export class PayphoneFormComponent implements AfterViewInit {
  amount = 0;
  reference = '';
  clientTransactionId = '';

  token = 'ygIAzZKO9TjlLdqu1uX761lplNaS6lFjzRwUgFYRMa3FLXpnsP1XX9Io9qul_LXionVyE_HlAuRDZB_FT1-tSRlIIBTqm-wkjszuaHskDcEgVlX8WzF0-lty_pHeZap2VLK0n7iUsyj784Tx6CUyywV88-Gme_vGYh46PcVdK079xLFPHYQjYkvo5CwoXhtJ6VG6V1bgHi4SxHoKrslislcxEPFpuYvZL8FbYTjoRfDQDCoBBUDfEDPGJWSZaxg7YYgjCqivJ62DCCOlO52N6XC9QFb3Nh5JVIYIOhRgjpOVJIHrOxXbQm7buq7J9Wgt8y8XCkdIYuhIz4cmUE5FaHHvdew';
  
  storeId = '063c6737-d0fb-4fe1-949a-57cd26c2de47';

  constructor(private route: ActivatedRoute, private cartService: CartService) {}

  ngAfterViewInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['amount']) {
        // ✅ Si viene amount por URL (en centavos), úsalo
        this.amount = +params['amount'];
      } else {
        // ✅ Si no, lo obtenemos desde el carrito
        const totalCarrito = this.cartService.getTotal();


        this.amount = Math.round(totalCarrito * 100); // 🔥 Convertimos a centavos

      }

      this.reference = params['referencia'] || 'Compra desde carrito CMG';
      this.clientTransactionId = params['transId'] || 'pedido-' + Date.now();

      this.crearBoton();
    });
  }

  crearBoton() {
    const esperarRender = setInterval(() => {
      const target = document.getElementById('pp-button');
      if (target && typeof (window as any).PPaymentButtonBox !== 'undefined') {
        clearInterval(esperarRender);
  
        const total = this.amount;
        const amountWithTax = Math.round(total / 1.15);
        const tax = total - amountWithTax;
  
        new (window as any).PPaymentButtonBox({
          token: this.token,
          storeId: this.storeId,
          clientTransactionId: this.clientTransactionId,
          amount: total,
          amountWithTax,
          amountWithoutTax: 0,
          tax,
          service: 0,
          tip: 0,
          currency: 'USD',
          reference: this.reference,
          lang: 'es',
          defaultMethod: 'card',
          timeZone: -5,
          lat: '-0.2299',
          lng: '-78.5249',
        }).render('pp-button');
      }
    }, 300);
  }
  
}