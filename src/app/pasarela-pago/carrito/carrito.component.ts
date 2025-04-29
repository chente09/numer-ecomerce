import { Component } from '@angular/core';
import { CartService } from '../services/cart/cart.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-carrito',
  imports: [CommonModule, FormsModule],
  templateUrl: './carrito.component.html',
  styleUrl: './carrito.component.css'
})
export class CarritoComponent {
  productos: any[] = []; // Inicializa como un array vacío
  total: number = 0; // Inicializa en 0
  nombreProducto = '';
precioProducto: number | null = null;


  constructor(private cartService: CartService, private router: Router) {}

  ngOnInit(): void {
    // Aquí inicializas las propiedades una vez que el servicio está disponible
    this.productos = this.cartService.getProductos();
    this.total = this.cartService.getTotal();
  }

  irAPagar() {
    if (this.total > 0) {
      const totalCentavos = Math.round(this.total * 100);
      const transId = 'pedido-' + new Date().getTime();
      this.router.navigate(['/pago'], {
        queryParams: {
          amount: totalCentavos,
          referencia: 'Pago de productos CMG',
          transId
        }
      });
    }
  }

  agregarProducto() {
    if (this.nombreProducto && this.precioProducto && this.precioProducto > 0) {
      this.cartService.agregarProducto({
        nombre: this.nombreProducto,
        precio: this.precioProducto
      });
      // Actualizamos la lista y total
      this.productos = this.cartService.getProductos();
      this.total = this.cartService.getTotal();
      // Reseteamos el formulario
      this.nombreProducto = '';
      this.precioProducto = null;
    }
  }
}
