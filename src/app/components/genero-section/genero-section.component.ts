import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { Subject, fromEvent } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';

interface ProductPair {
  id: string;
  image: string;
  title: string;
  category: string;
  alt: string;
  fallbackImage?: string;
}

@Component({
  selector: 'app-genero-section',
  standalone: true,
  imports: [
    CommonModule,
    NzGridModule,
    NzCardModule,
    NzIconModule,
    NzButtonModule
  ],
  templateUrl: './genero-section.component.html',
  styleUrls: ['./genero-section.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeneroSectionComponent implements OnInit, OnDestroy {
  
  private destroy$ = new Subject<void>();
  
  productPairs: ProductPair[] = [
    {
      id: 'hombre',
      title: 'Hombre',
      category: 'hombre',
      image: 'https://i.postimg.cc/fRSzrGFv/img.webp',
      alt: 'Colección para Hombre - Productos deportivos y casuales',
      fallbackImage: this.generateFallbackImage('Hombre', '#1890ff')
    },
    {
      id: 'mujer',
      title: 'Mujer',
      category: 'mujer',
      image: 'https://i.postimg.cc/k5wpF4cY/Imagen-de-Whats-App-2025-05-15-a-las-20-08-55-c0bbe9f9.jpg',
      alt: 'Colección para Mujer - Productos deportivos y casuales',
      fallbackImage: this.generateFallbackImage('Mujer', '#ff4d4f')
    }
  ];

  // Estado del componente
  imagesLoaded = new Set<string>();
  isDesktop = false;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.detectViewport();
    this.preloadImages();
    this.setupResizeListener();
    // Forzar detección inicial
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Detecta si es vista desktop o móvil
   */
  private detectViewport(): void {
    this.isDesktop = window.innerWidth > 600;
  }

  /**
   * Escucha cambios de tamaño de ventana
   */
  private setupResizeListener(): void {
    fromEvent(window, 'resize')
      .pipe(
        debounceTime(250),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.detectViewport();
        this.cdr.markForCheck();
      });
  }

  /**
   * Navega a una categoría específica
   */
  navigateToCategory(category: string): void {
    if (category && typeof category === 'string') {
      this.router.navigate(['/shop', category.toLowerCase()]);
    }
  }

  /**
   * Precarga todas las imágenes de forma optimizada
   */
  private async preloadImages(): Promise<void> {
    const preloadPromises = this.productPairs.map(product => 
      this.preloadSingleImage(product)
    );

    try {
      await Promise.allSettled(preloadPromises);
    } catch (error) {
      console.warn('⚠️ Error en precarga de imágenes:', error);
    }
  }

  /**
   * Precarga una imagen individual
   */
  private preloadSingleImage(product: ProductPair): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      
      img.onload = () => {
        this.imagesLoaded.add(product.id);
        this.cdr.markForCheck();
        resolve();
      };

      img.onerror = () => {
        console.warn(`❌ Error al precargar imagen: ${product.title}`);
        resolve(); // Resolvemos para no bloquear otras imágenes
      };

      // Configurar imagen con optimizaciones
      img.loading = 'eager';
      img.src = product.image;
    });
  }

  /**
   * Maneja errores de carga de imágenes con fallback dinámico
   */
  handleImageError(event: Event, product: ProductPair): void {
    const imgElement = event.target as HTMLImageElement;
    
    if (imgElement && !imgElement.classList.contains('fallback-applied')) {
      // Aplicar imagen de fallback personalizada
      imgElement.src = product.fallbackImage || this.getGenericFallback();
      imgElement.classList.add('fallback-applied', 'image-error');
      
      console.warn(`🔄 Fallback aplicado para: ${product.title}`);
    }
  }

  /**
   * Genera imagen de fallback personalizada
   */
  private generateFallbackImage(title: string, color: string): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${color};stop-opacity:0.8" />
            <stop offset="100%" style="stop-color:${color};stop-opacity:0.4" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)"/>
        <text x="50%" y="45%" font-family="Arial, sans-serif" font-size="28" font-weight="bold" 
              fill="white" text-anchor="middle" dominant-baseline="middle">${title}</text>
        <text x="50%" y="65%" font-family="Arial, sans-serif" font-size="14" 
              fill="white" text-anchor="middle" dominant-baseline="middle">Colección Disponible</text>
      </svg>
    `)}`;
  }

  /**
   * Fallback genérico para casos extremos
   */
  private getGenericFallback(): string {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjVmNWY1Ii8+PGcgZmlsbD0iIzk5OSI+PGNpcmNsZSBjeD0iMjAwIiBjeT0iMTIwIiByPSIyMCIvPjxwYXRoIGQ9Im0xNzAgMTgwaDYwdjQwaC02MHoiLz48L2c+PHRleHQgeD0iNTAlIiB5PSI3NSUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SW1hZ2VuIG5vIGRpc3BvbmlibGU8L3RleHQ+PC9zdmc+';
  }

  /**
   * Verifica si una imagen está cargada
   */
  isImageLoaded(productId: string): boolean {
    return this.imagesLoaded.has(productId);
  }

  /**
   * Trackby function para optimizar ngFor
   */
  trackByProductId(index: number, product: ProductPair): string {
    return product.id;
  }
}