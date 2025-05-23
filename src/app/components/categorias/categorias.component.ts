import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzSpinModule } from 'ng-zorro-antd/spin';

import { CategoryService, Category } from '../../services/admin/category/category.service';
import { NzGridModule } from 'ng-zorro-antd/grid';

@Component({
  selector: 'app-categorias',
  imports: [
    CommonModule,
    NzSpinModule,
    NzCardModule,
    RouterLink,
    NzGridModule
  ],
  templateUrl: './categorias.component.html',
  styleUrl: './categorias.component.css'
})
export class CategoriasComponent implements OnInit {
  categoriesLoading = true;
  loading: any;
  categories: Category[] = [];
  hoveredCategorySlug: string | null = null;

  constructor(
    private categoryService: CategoryService
  ) { }

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.categoryService.getCategories().subscribe({
      next: (data) => {
        this.categories = this.shuffleArray(data); // Mezclar el arreglo
        this.categoriesLoading = false;
      },
      error: (error) => {
        console.error('Error loading categories:', error);
        this.categoriesLoading = false;
      }
    });
  }

  // Método privado para mezclar un arreglo
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

}
