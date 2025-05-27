import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-tendencias-section',
  imports: [
    CommonModule,
    NzTabsModule,
    FormsModule,
    NzGridModule,
    RouterLink,
    NzRateModule
  ],
  templateUrl: './tendencias-section.component.html',
  styleUrl: './tendencias-section.component.css'
})
export class TendenciasSectionComponent implements OnInit {

  // Productos en tendencia
  trendingProducts = {
    mostPopular: [
      {
        id: 1,
        name: 'Sendero',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 199.99
      },
      {
        id: 2,
        name: 'Barranco',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 249.99
      },
      {
        id: 3,
        name: 'Aguacero',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 129.99
      },
      {
        id: 4,
        name: 'Sendero ',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 179.99
      }
    ],
    newArrivals: [
      {
        id: 5,
        name: 'Extra Ligero',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 499.99
      },
      {
        id: 6,
        name: 'Barranco',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 79.99
      },
      {
        id: 7,
        name: 'Aguacero',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 129.99
      },
      {
        id: 8,
        name: 'Sendero ',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 149.99
      }
    ],
    onSale: [
      {
        id: 9,
        name: 'Extra Ligero',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 899.99,
        originalPrice: 1099.99,
        discountPercentage: 18
      },
      {
        id: 10,
        name: 'Sendero',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 349.99,
        originalPrice: 449.99,
        discountPercentage: 22
      },
      {
        id: 11,
        name: 'Barranco',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 399.99,
        originalPrice: 499.99,
        discountPercentage: 20
      },
      {
        id: 12,
        name: 'Aguacero',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 599.99,
        originalPrice: 749.99,
        discountPercentage: 20
      }
    ]
  };


  ngOnInit(): void {
      
  }


  

}
