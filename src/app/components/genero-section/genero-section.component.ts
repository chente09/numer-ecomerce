import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { GenderSectionService, GenderSectionItem, GenderSectionConfig } from '../../services/admin/genderSection/gender-section.service';

@Component({
  selector: 'app-genero-section',
  standalone: true,
  imports: [CommonModule, NzIconModule],
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
  isDesktop = window.innerWidth > 768;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly genderService: GenderSectionService
  ) { }

  ngOnInit(): void {
    this.loadSectionData();
    this.setupResizeListener();
    
    setTimeout(() => {
      if (this.items.length > 0) {
        this.validateItemConfiguration();
      }
    }, 2000);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // 📡 CARGAR DATOS DEL SERVICIO
  private loadSectionData(): void {
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

    this.genderService.getItems().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (items) => {
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
      const newIsDesktop = window.innerWidth > 768;
      if (newIsDesktop !== this.isDesktop) {
        this.isDesktop = newIsDesktop;
        this.cdr.markForCheck();
      }
    };

    window.addEventListener('resize', resizeHandler, { passive: true });

    this.destroy$.subscribe(() => {
      window.removeEventListener('resize', resizeHandler);
    });
  }

  // 🎯 NAVEGACIÓN SIMPLIFICADA - SOLO GÉNERO
  onItemClick(item: GenderSectionItem): void {
    console.log('🖱️ Click en género:', item.title);

    if (!item.category) {
      console.error('❌ Item sin categoría definida');
      return;
    }

    // 🎯 SOLO enviar 'hombre' o 'mujer'
    let genderParam: string;
    const category = item.category.toLowerCase();
    
    if (category.includes('mujer') || category.includes('women') || category.includes('female')) {
      genderParam = 'mujer';
    } else if (category.includes('hombre') || category.includes('men') || category.includes('male')) {
      genderParam = 'hombre';
    } else {
      console.warn('⚠️ Categoría no reconocida como género:', item.category);
      return;
    }

    console.log('👤 Navegando con género:', genderParam);

    // 🚀 Navegación simple
    this.router.navigate(['/shop'], {
      queryParams: { gender: genderParam }
    }).then(() => {
      console.log('✅ Navegación completada:', genderParam);
    }).catch(error => {
      console.error('❌ Error en navegación:', error);
    });
  }

  // 🖼️ MANEJO DE IMÁGENES
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

  validateItemConfiguration(): void {
    console.group('✅ Validando configuración de items');
    this.items.forEach((item, index) => {
      console.log(`Item ${index + 1}:`, {
        id: item.id,
        title: item.title,
        category: item.category,
        isActive: item.isActive,
        hasImage: !!item.imageUrl,
        hasMobileImage: !!item.mobileImageUrl
      });

      if (!item.category) {
        console.warn(`⚠️ Item "${item.title}" no tiene categoría definida`);
      }
    });
    console.groupEnd();
  }

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

  getImageUrl(item: GenderSectionItem): string {
    if (!this.isDesktop && item.mobileImageUrl) {
      return item.mobileImageUrl;
    }
    return item.imageUrl || '';
  }

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

  getSubtitle(item: GenderSectionItem): string {
    return item.subtitle || 'Explorar colección';
  }
}