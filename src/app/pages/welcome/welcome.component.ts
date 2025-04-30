import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CategoryService, Category } from '../../services/category/category.service';
import { ProductService, Product } from '../../services/product/product.service';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';

@Component({
  selector: 'app-welcome',
  imports: [
    CommonModule,
    RouterLink,
    NzSpinModule,
    NzCardModule,
    NzGridModule,
    NzButtonModule,
    NzTagModule
  ],
  standalone: true,
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css'
})
export class WelcomeComponent implements OnInit {
  categories: Category[] = [];
  featuredProducts: Product[] = [];
  categoriesLoading = true;
  productsLoading = true;
loading: any;

  constructor(
    private categoryService: CategoryService,
    private productService: ProductService
  ) { }

  heroTitle = 'Para las Montañas y Más Allá';
  heroSubtitle = 'Numer Equipment: Equipamiento innovador para deportes de aventura, senderismo y montaña.';
  ctaText = 'Ver Novedades';
  ctaLink = '/new-arrivals';

  ngOnInit(): void {
    this.loadCategories();
    this.loadFeaturedProducts();
  }

  loadCategories(): void {
    this.categoryService.getCategories().subscribe(
      (data) => {
        this.categories = data;
        this.categoriesLoading = false;
      },
      (error) => {
        console.error('Error loading categories:', error);
        this.categoriesLoading = false;
      }
    );
  }

  loadFeaturedProducts(): void {
    this.productService.getFeaturedProducts().subscribe(
      (data) => {
        this.featuredProducts = data;
        this.productsLoading = false;
      },
      (error) => {
        console.error('Error loading featured products:', error);
        this.productsLoading = false;
      }
    );
  }


}
