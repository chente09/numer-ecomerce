// models-section.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { Subject, takeUntil, finalize, take, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { ModelImageService, ModelImage } from '../../services/admin/modelImage/model-image.service';
import { ProductService } from '../../services/admin/product/product.service';
import { Product } from '../../models/models';
import { ActionButtonComponent } from "../action-button/action-button.component";
import { NzCardModule } from "ng-zorro-antd/card";

// 🎯 INTERFAZ PARA MODELO CON PRODUCTOS
interface ModelWithProducts extends ModelImage {
  products: Product[];
  productCount: number;
  availableStock: number;
  hasStock: boolean;
}

@Component({
  selector: 'app-models-section',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NzSkeletonModule,
    NzEmptyModule,
    NzIconModule,
    NzButtonModule,
    NzBadgeModule,
    ActionButtonComponent,
    NzCardModule
],
  templateUrl: './models-section.component.html',
  styleUrl: './models-section.component.css'
})
export class ModelsSectionComponent implements OnInit, OnDestroy, AfterViewInit {
  // 🎯 Estado del componente - REFACTORIZADO
  models: ModelWithProducts[] = [];
  loading = false;
  error: string | null = null;
  private destroy$ = new Subject<void>();

  // 📊 Configuración
  maxModelsToShow = 12;
  sectionTitle = 'Explora Nuestros Modelos';
  sectionSubtitle = 'Cada modelo único con sus propias características';

  // 📱 Control de scroll
  canScrollLeftState = false;
  canScrollRightState = false;

  constructor(
    private modelImageService: ModelImageService, // 🆕 AGREGAR
    private productService: ProductService,
    private router: Router,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.loadModelsWithProducts(); // 🔄 CAMBIAR
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.setupScrollListeners();
      this.updateScrollButtons();
    }, 100);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // 🚀 CARGAR MODELOS CON PRODUCTOS ASOCIADOS
  private loadModelsWithProducts(): void {
    this.loading = true;
    this.error = null;

    // 🔄 COMBINAR MODELOS E IMÁGENES CON PRODUCTOS
    combineLatest([
      this.modelImageService.getActiveModelImages(),
      this.productService.getProducts()
    ]).pipe(
      take(1),
      map(([modelImages, products]) => {
        return this.processModelsWithProducts(modelImages, products);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
        setTimeout(() => this.updateScrollButtons(), 200);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (modelsWithProducts) => {
        this.models = modelsWithProducts.slice(0, this.maxModelsToShow);
      },
      error: (error) => {
        console.error('❌ ModelsSectionComponent: Error cargando modelos:', error);
        this.error = 'Error al cargar los modelos. Intente nuevamente.';
        this.models = [];
      }
    });
  }

  // 🔄 PROCESAR MODELOS CON SUS PRODUCTOS
  private processModelsWithProducts(modelImages: ModelImage[], products: Product[]): ModelWithProducts[] {

    const modelsWithProducts = modelImages.map(modelImage => {
      // 🔍 BUSCAR PRODUCTOS QUE COINCIDAN CON EL MODELO
      const matchingProducts = products.filter(product => 
        this.matchesModel(product, modelImage.modelName)
      );

      // 📊 CALCULAR ESTADÍSTICAS
      const availableStock = matchingProducts.reduce((total, product) => 
        total + (product.totalStock || 0), 0
      );

      const modelWithProducts: ModelWithProducts = {
        ...modelImage,
        products: matchingProducts,
        productCount: matchingProducts.length,
        availableStock,
        hasStock: availableStock > 0
      };


      return modelWithProducts;
    });

    // 🎯 FILTRAR SOLO MODELOS CON PRODUCTOS Y ORDENAR
    return modelsWithProducts
      .filter(model => model.productCount > 0) // Solo modelos con productos
      .sort((a, b) => {
        // Priorizar modelos con stock disponible
        if (a.hasStock && !b.hasStock) return -1;
        if (!a.hasStock && b.hasStock) return 1;
        // Luego por cantidad de productos
        return b.productCount - a.productCount;
      });
  }

  // 🔍 VERIFICAR SI PRODUCTO COINCIDE CON MODELO
  private matchesModel(product: Product, modelName: string): boolean {
    const normalizedModelName = modelName.toLowerCase().trim();
    
    return (
      (!!product.model && product.model.toLowerCase().trim() === normalizedModelName) ||
      (!!product.collection && product.collection.toLowerCase().trim() === normalizedModelName) ||
      (!!product.name && product.name.toLowerCase().includes(normalizedModelName))
    );
  }

  // 📱 SCROLL HORIZONTAL - SIN CAMBIOS
  scrollModels(direction: 'left' | 'right'): void {
    const container = document.querySelector('.models-scroll-container') as HTMLElement;
    if (!container) return;

    const cardWidth = 300;
    const scrollAmount = cardWidth * 2;
    
    const newScrollLeft = direction === 'left'
      ? container.scrollLeft - scrollAmount
      : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth'
    });

    setTimeout(() => this.updateScrollButtons(), 300);
  }

  private setupScrollListeners(): void {
    const container = document.querySelector('.models-scroll-container') as HTMLElement;
    if (!container) return;

    container.addEventListener('scroll', () => {
      this.updateScrollButtons();
    });

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

  // 🖼️ GESTIÓN DE IMÁGENES - REFACTORIZADO
  getDisplayImageUrl(model: ModelWithProducts): string {
    // 📱 RESPONSIVE: Usar imagen móvil en dispositivos pequeños
    if (window.innerWidth < 768 && model.mobileImageUrl) {
      return model.mobileImageUrl;
    }
    return model.imageUrl || '';
  }

  // 🧭 NAVEGACIÓN - REFACTORIZADO
  navigateToModel(model: ModelWithProducts): void {
    
    // 🎯 NAVEGAR AL CATÁLOGO FILTRADO POR MODELO
    this.router.navigate(['/shop'], { 
      queryParams: { 
        model: model.modelName,
        // 🆕 PARÁMETROS ADICIONALES PARA MEJOR UX
        source: 'models-section'
      }
    });
  }

  // 🔄 MÉTODOS DE UTILIDAD - REFACTORIZADOS
  trackByModelId(index: number, model: ModelWithProducts): string {
    return model.id;
  }

  refreshModels(): void {
    this.loadModelsWithProducts(); // 🔄 CAMBIAR
  }

  // 📊 MÉTODOS PARA DEBUG - REFACTORIZADOS
  getAvailableModels(): ModelWithProducts[] {
    return this.models.filter(model => model.hasStock);
  }

  getUniqueCategories(): string[] {
    const categories = new Set<string>();
    this.models.forEach(model => {
      model.products.forEach(product => {
        if (product.category) {
          categories.add(product.category);
        }
      });
    });
    return Array.from(categories);
  }

  // 🆕 MÉTODOS ADICIONALES PARA MEJOR UX
  getModelDescription(model: ModelWithProducts): string {
    return model.description || `${model.productCount} productos disponibles`;
  }

  getStockBadgeText(model: ModelWithProducts): string {
    if (!model.hasStock) return 'Sin stock';
    if (model.availableStock < 10) return 'Pocas unidades';
    return `${model.availableStock} disponibles`;
  }

  getStockBadgeStatus(model: ModelWithProducts): string {
    if (!model.hasStock) return 'default';
    if (model.availableStock < 10) return 'warning';
    return 'success';
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
        console.log(`  ${index + 1}. ${model.modelName} - ${model.productCount} productos - Stock: ${model.availableStock}`);
      });
    }

    console.groupEnd();
  }
}