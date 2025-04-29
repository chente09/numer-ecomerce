import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CartService {

  private productos: any[] = [];

  agregarProducto(producto: any) {
    this.productos.push(producto);
  }

  getProductos() {
    return this.productos;
  }

  getTotal(): number {
    return this.productos.reduce((sum, p) => sum + p.precio, 0);
  }
}
