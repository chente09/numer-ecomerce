import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { CartService } from '../../pasarela-pago/services/cart/cart.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-cart-button',
  standalone: true,
  imports: [CommonModule, NzIconModule],
  templateUrl: './cart-button.component.html',
  styleUrl: './cart-button.component.css'
})
export class CartButtonComponent implements OnInit, OnDestroy {
  itemCount: number = 0;
  isVisible: boolean = false;
  private destroy$ = new Subject<void>();

  constructor(
    private cartService: CartService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.cartService.cart$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(cart => {
      this.itemCount = cart.totalItems;
      this.isVisible = cart.totalItems > 0;
    });
  }

  goToCart(): void {
    this.router.navigate(['/carrito']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}