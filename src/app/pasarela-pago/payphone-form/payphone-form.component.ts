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

  token = 'za5oHaelhnn1_A1nRaDFx3dQkDVFrxQRpXI3gToaE37jk6t8SWH48kyxEYugfg2RF3FiMU9WISHDSzSgOocQFWBCWiPBEWIHWIY3lHI63DhYk4QEIT8Jbv27mI91YOtwCGYeF--xp2-QMsO3uxC3kDbovh9k-28GaeNA7iHnm3-Tll0LmCafLZ3fTYfcuG3l6medVtcWfG41SfTkzNhv0WvbpbAM5y-zYOAdID1CnEE1srSfY--SSP7wCDxXpVkrkEVmTHo-2Z_KL_2ALpl8-i7x485RbAQtlGGRwUsIZT_Z6igtfBiHNzv3JGX33hWXOFML_g';
  
  storeId = 'cd3d7025-400d-4e42-a279-b389277fcf0e';

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
    if (typeof (window as any).PPaymentButtonBox !== 'undefined') {
      const total = this.amount; 
      // ✅ Calculamos los valores correctamente
      const amountWithTax = Math.round(total / 1.15); // 💵 Base imponible (sin IVA)
    const tax = total - amountWithTax;              // 💵 IVA calculado (15% del base)
    const amountWithoutTax = 0;                       
  
    console.log('✅ Desglose para PayPhone → Total:', total, 'Base:', amountWithTax, 'IVA:', tax);
  
      // @ts-ignore
      new PPaymentButtonBox({
        token: this.token,
        storeId: this.storeId,
        clientTransactionId: this.clientTransactionId,
        amount: total,
        amountWithTax: amountWithTax,
        amountWithoutTax: amountWithoutTax,
        tax: tax,
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
    } else {
      console.error('❌ No se pudo cargar PPaymentButtonBox');
    }
  }
  
  
  
  
}