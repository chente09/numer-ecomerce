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
    PromocionesSectionComponent
],
  standalone: true,
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css',
  
})
export class WelcomeComponent implements OnInit {
  

  constructor(
  ) { }


  ngOnInit(): void {
    
  }

}
