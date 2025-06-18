import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { SeoService } from '../../services/seo/seo.service';

@Component({
  selector: 'app-nosotros',
  imports: [
    CommonModule,
    RouterLink,
    NzButtonModule,
    NzGridModule,
    NzDividerModule,
    NzCardModule,
    NzIconModule
  ],
  templateUrl: './nosotros.component.html',
  styleUrl: './nosotros.component.css'
})
export class NosotrosComponent implements OnInit {

  storyTitle = 'Nuestra Historia';
  storyContent = 'En medio de uno de los momentos más retadores de nuestra historia —la pandemia COVID 19— mientras el mundo se detenía, en 2021 nosotros decidimos ir hacia adelante. Así nació NUMER, una marca con alma aventurera y corazón textil, creada para quienes encontraron en el ciclismo y los deportes al aire libre una nueva forma de vivir, respirar y sentirse libres. Lo que comenzó como una idea para vestir a ciclistas, rápidamente se transformó en una marca outdoor con visión deportiva, gracias al impulso y pasión de nuestros primeros clientes. Con años de experiencia en confección de uniformes corporativos y ropa técnica, decidimos rediseñar nuestro camino y poner todo ese conocimiento al servicio de una nueva comunidad: la que no se detiene. Lanzamos nuestro primer producto con los pilares que siguen guiando todo lo que hacemos: calidad, transparencia, mejora constante, diseño propio e innovación. Desde entonces, no hemos parado. Nuestra línea ha crecido, nuestras aventuras también… y lo más emocionante es que apenas estamos comenzando. En NUMER creemos que la ropa no solo acompaña tus recorridos: los potencia, los hace inolvidables y te empuja a ir más allá. Gracias por ser parte de esta historia que seguimos construyendo juntos, paso a paso, kilómetro a kilómetro, cima tras cima.';
  ctaText = 'Explorar Colección';
  ctaLink = '/shop';

  missionTitle = 'Nuestra Misión';
  missionContent = 'En NUMER creamos prendas técnicas de alta calidad que acompañan y potencian cada aventura al aire libre. Nos comprometemos a diseñar ropa funcional, duradera y con estilo, elaborada con los más altos estándares de calidad y sostenibilidad para una comunidad que valora tanto el rendimiento como el respeto por el entorno natural.';
  
  visionTitle = 'Nuestra Visión';
  visionContent = 'Aspiramos a ser reconocidos globalmente como la marca de referencia para los amantes de los deportes outdoor, creando productos innovadores que inspiren a las personas a explorar más allá de sus límites, conectar con la naturaleza y vivir experiencias transformadoras, siempre con un compromiso firme hacia la excelencia y la responsabilidad ambiental.';

  // Valores (opcional pero recomendado)
  values = [
    {
      title: 'Calidad',
      description: 'Cada prenda es elaborada con materiales premium y procesos rigurosos para garantizar durabilidad y rendimiento.',
      icon: 'bi bi-check-circle'
    },
    {
      title: 'Innovación',
      description: 'Constantemente exploramos nuevas tecnologías y diseños para mejorar la experiencia de nuestros usuarios.',
      icon: 'bi bi-lightbulb'
    },
    {
      title: 'Sostenibilidad',
      description: 'Nos comprometemos a minimizar nuestro impacto ambiental en cada etapa del proceso productivo.',
      icon: 'bi bi-recycle'
    },
    {
      title: 'Comunidad',
      description: 'Creamos más que productos; construimos una comunidad de exploradores y amantes del aire libre.',
      icon: 'bi bi-people'
    }
  ];  

  constructor(private seoService: SeoService) {}

  // ✅ IMPLEMENTAR ngOnInit
  ngOnInit(): void {
    // ✅ CONFIGURAR SEO PARA NOSOTROS
    this.seoService.updatePageSEO('nosotros', {
      title: 'Nosotros - Historia y Misión de NUMER | Ropa Outdoor Ecuador',
      description: 'Conoce la historia de NUMER, marca ecuatoriana de ropa técnica para deportes outdoor. Desde 2021 creando Pantalón Extraligero, Chompa AGUACERO y prendas de calidad para aventureros.',
      keywords: 'NUMER historia, marca ecuatoriana outdoor, misión visión NUMER, ropa técnica Ecuador, aventureros ciclismo montaña, calidad innovación sostenibilidad',
      image: 'https://firebasestorage.googleapis.com/v0/b/numer-16f35.firebasestorage.app/o/products%2F27d9425a-2698-452d-8b93-4962772f11b7%2Fcolors%2Fverde%20olivo.webp?alt=media&token=9aaea191-a3c5-47ef-ab6f-c59e0b8226c0'
    });

    console.log('✅ NosotrosComponent inicializado con SEO');
  }

}
