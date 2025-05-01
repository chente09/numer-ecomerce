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

  token = 'sicBfX1A8I_J2eF2sl1BAY_Tk4YTrjOl8DgiuDchpBa1eVp9T-WCVpWMBByjquFbE-QGu9FZUcO_niECpZFpy8uvFqYt4G1wPemawp8O347sRvo9vR4F1ZHJ38_gZSGuLdKru7aXfaiTqjd6Bhw6myT0wJbxvB-1Vp_Pqv-6nK_q1_rjwhdALEnelqCri3S5xjHdTFk2uQQQMUcs027FeiDcvpnEwVW1A2yv-x0ciaTxRk_7fh2QqddhOW7KglFbKGBs6ZQLp5Du6KSns1kiK7TX1bXbngXJIHvWVPlVIngnBbpaB7vTQ0V5uNJnj0S2D_uI61zwgCMnCZlMJIAkjjjdYBY';
  
  storeId = '82ca19dd-cb46-4cce-811b-e83073c42aa1';

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