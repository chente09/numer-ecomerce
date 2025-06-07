import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { Subject, takeUntil, finalize, take } from 'rxjs';

import { ProductService } from '../../services/admin/product/product.service';
import { Product } from '../../models/models';

@Component({
  selector: 'app-models-section',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NzSkeletonModule,
    NzEmptyModule,
    NzIconModule,
    NzButtonModule
  ],
  templateUrl: './models-section.component.html',
  styleUrl: './models-section.component.css'
})
export class ModelsSectionComponent implements OnInit, OnDestroy, AfterViewInit {
  // 🎯 Estado del componente
  models: Product[] = [];
  loading = false;
  error: string | null = null;
  private destroy$ = new Subject<void>();

  // 📊 Configuración
  maxModelsToShow = 12; // ✅ Más modelos para scroll horizontal
  sectionTitle = 'Explora Nuestros Modelos';
  sectionSubtitle = 'Cada modelo único con sus propias características';

  // 📱 Control de scroll
  canScrollLeftState = false;
  canScrollRightState = false;

  constructor(
    private productService: ProductService,
    private router: Router,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.loadUniqueModels();
  }

  ngAfterViewInit(): void {
    // Configurar listeners para actualizar estado de botones
    setTimeout(() => {
      this.setupScrollListeners();
      this.updateScrollButtons();
    }, 100);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // 🚀 CARGAR MODELOS ÚNICOS
  private loadUniqueModels(): void {
    this.loading = true;
    this.error = null;

    console.log('🎯 ModelsSectionComponent: Cargando modelos únicos...');

    this.productService.getUniqueModels()
      .pipe(
        take(1),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
          // Actualizar botones después de cargar
          setTimeout(() => this.updateScrollButtons(), 200);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (models) => {
          console.log(`📦 ModelsSectionComponent: ${models.length} modelos únicos recibidos`);
          this.models = models.slice(0, this.maxModelsToShow);
          console.log(`✅ ModelsSectionComponent: ${this.models.length} modelos listos para mostrar`);
        },
        error: (error) => {
          console.error('❌ ModelsSectionComponent: Error cargando modelos:', error);
          this.error = 'Error al cargar los modelos. Intente nuevamente.';
          this.models = [];
        }
      });
  }

  // 📱 SCROLL HORIZONTAL
  scrollModels(direction: 'left' | 'right'): void {
    const container = document.querySelector('.models-scroll-container') as HTMLElement;
    if (!container) return;

    const cardWidth = 300; // Ancho de card + gap
    const scrollAmount = cardWidth * 2; // Scroll de 2 cards a la vez
    
    const newScrollLeft = direction === 'left'
      ? container.scrollLeft - scrollAmount
      : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth'
    });

    // Actualizar botones después del scroll
    setTimeout(() => this.updateScrollButtons(), 300);
  }

  // 🎛️ CONTROL DE BOTONES DE SCROLL
  private setupScrollListeners(): void {
    const container = document.querySelector('.models-scroll-container') as HTMLElement;
    if (!container) return;

    container.addEventListener('scroll', () => {
      this.updateScrollButtons();
    });

    // Listener para redimensionamiento
    window.addEventListener('resize', () => {
      this.updateScrollButtons();
    });
  }

  private updateScrollButtons(): void {
    const container = document.querySelector('.models-scroll-container') as HTMLElement;
    if (!container) return;

    this.canScrollLeftState = container.scrollLeft > 0;
    this.canScrollRightState = container.scrollLeft < (container.scrollWidth - container.clientWidth - 5);
    
    this.cdr.detectChanges();
  }

  // 🖼️ GESTIÓN DE IMÁGENES
  getDisplayImageUrl(model: Product): string {
    return model.imageUrl || '';
  }

  // 🧭 NAVEGACIÓN
  navigateToModel(model: Product): void {
    console.log(`🧭 Navegando al modelo: ${model.model || model.name}`);
    this.router.navigate(['/products', model.id]);
  }

  navigateToShop(): void {
    console.log('🛍️ Navegando a la tienda completa');
    this.router.navigate(['/shop']);
  }

  // 🔄 MÉTODOS DE UTILIDAD
  trackByModelId(index: number, model: Product): string {
    return model.id;
  }

  refreshModels(): void {
    console.log('🔄 ModelsSectionComponent: Recargando modelos...');
    this.loadUniqueModels();
  }

  // 📊 MÉTODOS PARA DEBUG
  getAvailableModels(): Product[] {
    return this.models.filter(model => model.totalStock > 0);
  }

  getUniqueCategories(): string[] {
    const categories = new Set<string>();
    this.models.forEach(model => {
      if (model.category) {
        categories.add(model.category);
      }
    });
    return Array.from(categories);
  }

  debugModels(): void {
    console.group('🔍 [MODELS SECTION DEBUG]');
    console.log('📊 Estado actual:', {
      loading: this.loading,
      error: this.error,
      modelsCount: this.models.length,
      canScrollLeft: this.canScrollLeftState,
      canScrollRight: this.canScrollRightState
    });

    if (this.models.length > 0) {
      console.log('🎯 Modelos cargados:');
      this.models.forEach((model, index) => {
        console.log(`  ${index + 1}. ${model.name} (Modelo: ${model.model || 'N/A'}) - Stock: ${model.totalStock}`);
      });
    }

    console.groupEnd();
  }
}