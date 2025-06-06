import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { GenderSectionService,  GenderSectionItem, GenderSectionConfig } from '../../services/admin/genderSection/gender-section.service';

@Component({
  selector: 'app-genero-section',
  standalone: true,
  imports: [
    CommonModule,
    NzIconModule
  ],
  templateUrl: './genero-section.component.html',
  styleUrls: ['./genero-section.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeneroSectionComponent implements OnInit, OnDestroy {

  // Datos del servicio
  config: GenderSectionConfig | null = null;
  items: GenderSectionItem[] = [];
  
  // Estado simple
  imagesLoaded = new Set<string>();
  isDesktop = window.innerWidth > 600;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly genderService: GenderSectionService
  ) {}

  ngOnInit(): void {
    this.loadSectionData();
    this.setupResizeListener();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // 📡 CARGAR DATOS DEL SERVICIO
  private loadSectionData(): void {
    // Cargar configuración
    this.genderService.getConfig().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (config) => {
        this.config = config;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error cargando configuración:', error);
      }
    });

    // Cargar items activos y ordenados
    this.genderService.getItems().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (items) => {
        // Filtrar solo items activos y ordenar
        this.items = items
          ?.filter(item => item.isActive)
          ?.sort((a, b) => (a.order || 0) - (b.order || 0)) || [];
        
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error cargando items:', error);
      }
    });
  }

  // 🖥️ DETECTAR CAMBIOS DE VIEWPORT
  private setupResizeListener(): void {
    const resizeHandler = () => {
      const newIsDesktop = window.innerWidth > 600;
      if (newIsDesktop !== this.isDesktop) {
        this.isDesktop = newIsDesktop;
        this.cdr.markForCheck();
      }
    };

    window.addEventListener('resize', resizeHandler, { passive: true });
    
    // Cleanup en destroy
    this.destroy$.subscribe(() => {
      window.removeEventListener('resize', resizeHandler);
    });
  }

  // 🔄 NAVEGACIÓN
  navigateToCategory(category: string): void {
    if (category) {
      this.router.navigate(['/shop'], {
        queryParams: { gender: category }
      });
    }
  }

  // 🖼️ MANEJO DE IMÁGENES SIMPLIFICADO
  onImageLoad(itemId: string): void {
    this.imagesLoaded.add(itemId);
    this.cdr.markForCheck();
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && !img.classList.contains('error-handled')) {
      img.classList.add('error-handled');
      img.src = this.createFallbackImage();
      console.warn('Error cargando imagen, usando fallback');
    }
  }

  // 🎨 IMAGEN DE FALLBACK SIMPLE
  private createFallbackImage(): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <text x="50%" y="50%" font-family="Arial" font-size="18" fill="#999" 
              text-anchor="middle" dominant-baseline="middle">
          Imagen no disponible
        </text>
      </svg>
    `)}`;
  }

  // 🔍 HELPERS PARA EL TEMPLATE
  isImageLoaded(itemId: string): boolean {
    return this.imagesLoaded.has(itemId);
  }

  trackByItemId(index: number, item: GenderSectionItem): string {
    return item.id;
  }

  // 🎯 GETTERS PARA EL TEMPLATE
  get sectionTitle(): string {
    return this.config?.sectionTitle || 'Para Cada Aventurero';
  }

  get titleColor(): string {
    return this.config?.titleColor || 'aliceblue';
  }

  get backgroundColor(): string {
    return this.config?.backgroundColor || '#000000';
  }

  get isVisible(): boolean {
    return this.config?.isActive !== false && this.items.length > 0;
  }

  // 📱 OBTENER IMAGEN APROPIADA SEGÚN DISPOSITIVO
  getImageUrl(item: GenderSectionItem): string {
    // Usar imagen móvil si existe y estamos en móvil
    if (!this.isDesktop && item.mobileImageUrl) {
      return item.mobileImageUrl;
    }
    
    // Sino, usar imagen principal
    return item.imageUrl || '';
  }

  // 🎨 OBTENER ESTILOS DEL ITEM
  getItemStyles(item: GenderSectionItem): { [key: string]: string } {
    const styles: { [key: string]: string } = {};
    
    if (item.backgroundColor) {
      styles['--item-bg-color'] = item.backgroundColor;
    }
    
    if (item.textColor) {
      styles['--item-text-color'] = item.textColor;
      styles['color'] = item.textColor;
    }
    
    return styles;
  }

  // 📋 OBTENER SUBTÍTULO
  getSubtitle(item: GenderSectionItem): string {
    return item.subtitle || 'Explorar colección';
  }
}