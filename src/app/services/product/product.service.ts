import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

export interface Product {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  rating: number;
  category: string;
  description?: string;
  isNew?: boolean;
  isBestSeller?: boolean;
  colors: Color[];
}

export interface Color {
  name: string;
  code: string;
  imageUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private mockProducts: Product[] = [
    {
      id: 1,
      name: 'Extraligero',
      price: 79.95,
      imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
      rating: 0,
      category: 'climbing',
      description: 'The world\'s most trusted cam with a single-stem design.',
      isBestSeller: true,
      isNew: true,
      colors: [
        { name: 'Mint', code: '#b8d8d0', imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg' },
        { name: 'Black', code: '#333333', imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png' }
      ]
    },
    {
      id: 2,
      name: 'Extraligero',
      price: 84.95,
      imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
      rating: 4.5,
      category: 'climbing',
      isNew: true,
      description: 'Classic harness built for high-end sport climbing and bouldering.',
      colors: [
        { name: 'Teal', code: '#4a98a4', imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg' },
        { name: 'Sage', code: '#b0b8a8', imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png' },
        { name: 'Gold', code: '#c5a66e', imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg' },
        { name: 'Black', code: '#333333', imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png' }
      ]
    },
    {
      id: 3,
      name: 'Extraligero',
      price: 189.95,
      imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg',
      rating: 3,
      category: 'hiking',
      description: 'Our lightest, most packable Z-Pole built for mountain athletes and adventures.',
      colors: [
        { name: 'Beige', code: '#d4cec5', imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png' },
        { name: 'Gray', code: '#666666', imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg' }
      ]
    },
    {
      id: 4,
      name: 'Extraligero',
      price: 49.95,
      imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
      rating: 5,
      category: 'equipment',
      description: 'Compact, powerful headlamp for all-around use.',
      isNew: true,
      colors: [
        { name: 'Beige', code: '#d4cec5', imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg' },
        { name: 'Gray', code: '#666666', imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png' }
      ]
    },
    {
      id: 3,
      name: 'Extraligero',
      price: 189.95,
      imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg',
      rating: 3,
      category: 'hiking',
      description: 'Our lightest, most packable Z-Pole built for mountain athletes and adventures.',
      colors: [
        { name: 'Mint', code: '#b8d8d0', imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg' },
        { name: 'Black', code: '#333333', imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png' }
      ]
    },
    {
      id: 4,
      name: 'Extraligero',
      price: 49.95,
      imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg',
      rating: 2, 
      category: 'equipment',
      description: 'Compact, powerful headlamp for all-around use.',
      isNew: true,
      colors: [
        { name: 'Teal', code: '#4a98a4', imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg' },
        { name: 'Sage', code: '#b0b8a8', imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png' }, 
        { name: 'Gold', code: '#c5a66e', imageUrl: 'https://i.postimg.cc/MKq83qgC/img5.jpg' },
        { name: 'Black', code: '#333333', imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png' }
      ]
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

  getProduct(id: number): Observable<Product | undefined> {
    const product = this.mockProducts.find(p => p.id === id);
    return of(product);
  }

}
