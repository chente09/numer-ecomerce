import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

export interface Product {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  category: string;
  description?: string;
  isNew?: boolean;
  isBestSeller?: boolean;
}


@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private mockProducts: Product[] = [
    {
      id: 1,
      name: 'Camalot C4',
      price: 79.95,
      imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg',
      category: 'climbing',
      description: 'The world\'s most trusted cam with a single-stem design.',
      isBestSeller: true
    },
    {
      id: 2,
      name: 'Solution Harness',
      price: 84.95,
      imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg',
      category: 'climbing',
      description: 'Classic harness built for high-end sport climbing and bouldering.'
    },
    {
      id: 3,
      name: 'Distance Carbon Z Trekking Poles',
      price: 189.95,
      imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg',
      category: 'hiking',
      description: 'Our lightest, most packable Z-Pole built for mountain athletes and adventures.'
    },
    {
      id: 4,
      name: 'Spot 400 Headlamp',
      price: 49.95,
      imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg',
      category: 'equipment',
      description: 'Compact, powerful headlamp for all-around use.',
      isNew: true
    }
  ];
  constructor(private http: HttpClient) { }

  // Simula obtener productos destacados
  getFeaturedProducts(): Observable<Product[]> {
    // En una app real, este endpoint vendría de un servicio real
    // return this.http.get<Product[]>('api/products/featured');
    return of(this.mockProducts);
  }

  // Simula obtener productos por categoría
  getProductsByCategory(category: string): Observable<Product[]> {
    return of(this.mockProducts.filter(product => product.category === category));
  }

}
