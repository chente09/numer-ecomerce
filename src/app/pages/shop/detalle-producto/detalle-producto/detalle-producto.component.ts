import { Component, OnInit } from '@angular/core';
import { ProductService, Product, Color } from '../../../../services/product/product.service';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-detalle-producto',
  imports: [
    CommonModule
  ],
  templateUrl: './detalle-producto.component.html',
  styleUrl: './detalle-producto.component.css'
})
export class DetalleProductoComponent implements OnInit {

  product: Product | undefined;
  selectedColor: Color | undefined;
  quantity: number = 1;

  constructor(
    private route: ActivatedRoute,
    private productService: ProductService
  ) { }

  ngOnInit(): void {
    const productId = Number(this.route.snapshot.paramMap.get('id'));
    this.productService.getProductById(productId.toString()).then(
      (product) => {
        this.product = product;
        if (product && product.colors.length > 0) {
          this.selectedColor = product.colors[0]; // Selecciona el primer color por defecto
        }
      }
    );
  }

  selectColor(color: Color): void {
    if (this.product) {
      this.selectedColor = color;
      this.product.imageUrl = color.imageUrl;
    }
  }

  increaseQuantity(): void {
    this.quantity++;
  }

  decreaseQuantity(): void {
    if (this.quantity > 1) {
      this.quantity--;
    }
  }

  // Método para generar array para mostrar las estrellas de rating
  getStarsArray(rating: number): number[] {
    return Array(5).fill(0).map((_, i) => i < Math.floor(rating) ? 1 : 0);
  }
}
