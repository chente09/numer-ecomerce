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

  token = 'LtBftB0D9H2Naod9iwTNv_FD6jCLDUNalhv2-YoKg3G08YEN1Rugek2NqxMa5qppcM90tDJwvej5fRkVKGHoQY-xlXLY_eUFIRaGwAVJWl9hsssAFsIGfUhaX2zeChWvta-OGGu6ruNXpBQ93YVFrRIRMvmyZcJ5tkOPS6PXy3KtGE1vdIvnXlaIyR0O-NVgy3CwauH84j3nshSYKSqHDSuZnFNyAOkYKmo6k3SkSzIPkO1PMSVE0ezy8Wf6lsD0BmYjNAj5YqMShBebjhAk44nA0OZfUUONJhsQmkc4CV8KA6-1cwrHpuVdWYWeN2ksD2aiY_jjQtLTtHVRZ8ra58fqMIQ';
  
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