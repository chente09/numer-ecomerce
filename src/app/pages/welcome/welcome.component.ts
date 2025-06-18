import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CategoriasComponent } from '../../components/categorias/categorias.component';
import { GeneroSectionComponent } from "../../components/genero-section/genero-section.component";
import { ProductosSectionComponent } from "../../components/productos-section/productos-section.component";
import { TestimoniosComponent } from "../../components/testimonios/testimonios.component";
import { BeneficiosSectionComponent } from "../../components/beneficios-section/beneficios-section.component";
import { TendenciasSectionComponent } from "../../components/tendencias-section/tendencias-section.component";
import { HeroSectionComponent } from "../../components/hero-section/hero-section.component";
import { NewsletterComponent } from "../../components/newsletter/newsletter.component";
import { InstagramComponent } from "../../components/instagram/instagram.component";
import { IconosLargeSectionComponent } from "../../components/iconos-large-section/iconos-large-section.component";
import { PromocionesSectionComponent } from "../../components/promociones-section/promociones-section.component";
import { ModelsSectionComponent } from "../../components/models-section/models-section.component";

// ✅ IMPORTAR EL SEO SERVICE
import { SeoService } from '../../services/seo/seo.service';

@Component({
  selector: 'app-welcome',
  imports: [
    CommonModule,
    CategoriasComponent,
    GeneroSectionComponent,
    ProductosSectionComponent,
    TestimoniosComponent,
    BeneficiosSectionComponent,
    TendenciasSectionComponent,
    HeroSectionComponent,
    NewsletterComponent,
    InstagramComponent,
    IconosLargeSectionComponent,
    ModelsSectionComponent
  ],
  standalone: true,
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css',
})
export class WelcomeComponent implements OnInit {

  // ✅ INYECTAR EL SEO SERVICE
  constructor(
    private seoService: SeoService
  ) { }

  ngOnInit(): void {
    // ✅ CONFIGURAR SEO PARA LA PÁGINA DE INICIO
    this.seoService.updatePageSEO('home', {
      // Datos específicos para tu homepage
      title: 'NUMER - Ropa Técnica para Deportes Outdoor, Montaña y Aventura | Ecuador',
      description: 'Descubre la mejor ropa técnica para deportes outdoor en Ecuador. Pantalón Extraligero trail, chompas impermeables AGUACERO y más. Perfecta para montaña, escalada, ciclismo, MTB, DH y aventuras al aire libre.',
      keywords: 'pantalón trail, ropa trekking ligera, pantalón outdoor, ropa deportiva montaña, pantalón técnico, NUMER trail, impermeable, aventura, escalada, MTB, DH, running, ciclismo ruta, pantalón extraligero, chompa AGUACERO',
      image: 'https://firebasestorage.googleapis.com/v0/b/numer-16f35.firebasestorage.app/o/products%2F27d9425a-2698-452d-8b93-4962772f11b7%2Fcolors%2Fverde%20olivo.webp?alt=media&token=9aaea191-a3c5-47ef-ab6f-c59e0b8226c0',
      url: 'https://numer.store'
    });

    console.log('✅ SEO configurado para página de inicio');
  }
}