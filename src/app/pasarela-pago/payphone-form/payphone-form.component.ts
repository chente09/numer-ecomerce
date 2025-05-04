import { AfterViewInit, Component, Input } from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CartService } from '../services/cart/cart.service';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-payphone-form',
  imports: [CommonModule, FormsModule],
  templateUrl: './payphone-form.component.html',
  styleUrl: './payphone-form.component.css',
})
export class PayphoneFormComponent implements AfterViewInit {


  constructor(private route: ActivatedRoute, private cartService: CartService, private http: HttpClient) {}

  ngAfterViewInit(): void {
    this.route.queryParams.subscribe(params => {
      const total = this.cartService.getTotal();
      const amount = Math.round(total * 100);
  
      this.http.post('https://backend-numer.netlify.app/.netlify/functions/payphone', {
        amount,
        reference: params['referencia'] || 'Compra desde carrito CMG'
      }).subscribe((data: any) => {
        this.crearBotonSeguro(data);
      });
    });
  }

  crearBotonSeguro(data: any) {
    const esperarRender = setInterval(() => {
      const target = document.getElementById('pp-button');
      if (target && typeof (window as any).PPaymentButtonBox !== 'undefined') {
        clearInterval(esperarRender);
  
        new (window as any).PPaymentButtonBox({
          ...data,
          lang: 'es',
          defaultMethod: 'card',
          timeZone: -5,
          lat: '-0.2299',
          lng: '-78.5249'
        }).render('pp-button');
      }
    }, 300);
  }
  
  
  
  
}