import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

// models/category.model.ts
export interface Category {
  id: number;
  name: string;
  description: string;
  imageUrl: string;
  slug: string;
}
@Injectable({
  providedIn: 'root'
})
export class CategoryService {

  // En un escenario real, estos datos vendrían de una API
  private mockCategories: Category[] = [
    {
      id: 1,
      name: 'Escalada',
      description: 'Arneses, Protección, Mosquetones y más',
      imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg',
      slug: 'climbing'
    },
    {
      id: 2,
      name: 'MTB',
      description: 'Cascos, Ropa, Accesorios y más',
      imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg',
      slug: 'skiing'
    },
    {
      id: 3,
      name: 'Senderismo',
      description: 'Bastones de Trekking, Linternas Frontales, Tiendas de Campaña y más',
      imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg',
      slug: 'hiking'
    },
    {
      id: 4,
      name: 'Ropa',
      description: 'Chaquetas, Pantalones, Capas Base y más',
      imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg',
      slug: 'apparel'
    }
    
  ];

  constructor(private http: HttpClient) { }

  // Simula obtener todas las categorías
  getCategories(): Observable<Category[]> {
    // En una app real, este endpoint vendría de un servicio real
    // return this.http.get<Category[]>('api/categories');
    return of(this.mockCategories);
  }

  // Simula obtener una categoría por su slug
  getCategoryBySlug(slug: string): Observable<Category | undefined> {
    return of(this.mockCategories.find(category => category.slug === slug));
  }
}
