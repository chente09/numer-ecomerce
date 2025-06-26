import { Component, OnDestroy, OnInit } from '@angular/core';
import { ProductService } from '../../../services/admin/product/product.service';
import { CategoryService } from '../../../services/admin/category/category.service';
import { SeoService } from '../../../services/seo/seo.service';
import { CartService } from '../../../pasarela-pago/services/cart/cart.service';
import { Product, Color, Size, ProductVariant } from '../../../models/models';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { FormsModule } from '@angular/forms';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { ProductInventoryService } from '../../../services/admin/inventario/product-inventory.service';
import { Observable, Subject, catchError, debounceTime, distinctUntilChanged, filter, finalize, forkJoin, map, of, switchMap, take, takeUntil } from 'rxjs';
import { CacheService } from '../../../services/admin/cache/cache.service';
import { StockUpdate, StockUpdateService } from '../../../services/admin/stockUpdate/stock-update.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ProductCardComponent } from "../../../components/product-card/product-card.component";
import { PromotionStateService } from '../../../services/admin/promotionState/promotion-state.service';
import { ChangeDetectorRef } from '@angular/core';

// 🆕 Interfaces para las nuevas funcionalidades
interface TechnicalSpec {
  name: string;
  value: string;
}

interface ProductHighlight {
  type: string;
  text: string;
}

interface SizeMeasurement {
  part: string;
  value: string;
}

interface ExtendedSize extends Size {
  measurements?: SizeMeasurement[];
}

interface ExtendedProduct extends Product {
  durabilityFeatures?: string[];
  recommendedActivities?: string[];
  weatherConditions?: string[];
  highlights?: ProductHighlight[];
  story?: string;
  technicalSpecs?: TechnicalSpec[];
  sizes: ExtendedSize[];
}

@Component({
  selector: 'app-detalle-producto',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NzRateModule,
    NzSpinModule,
    NzModalModule,
    FormsModule,
    NzToolTipModule,
    NzIconModule,
    ProductCardComponent
  ],
  templateUrl: './detalle-producto-component.component.html',
  styleUrl: './detalle-producto-component.component.css'
})
export class DetalleProductoComponent implements OnInit, OnDestroy {
  // Propiedades principales
  product: ExtendedProduct | null = null;
  relatedProducts: Product[] = [];
  relatedLoading = false;
  selectedColor: Color | undefined;
  selectedSize: ExtendedSize | undefined;
  selectedVariant: ProductVariant | undefined;
  quantity: number = 1;
  productsLoading: boolean = true;

  private destroy$ = new Subject<void>();
  private promotionNamesCache = new Map<string, string>();

  // Categoría
  categoryName: string = '';
  categoryDescription: string = '';

  // Tallas
  showSizeGuide: boolean = false;
  showSizeLegend: boolean = true;
  showImageModal: boolean = false;
  previewImageUrl: string = '';
  standardSizes: string[] = ['XS', 'S', 'M', 'L', 'XL'];

  // Estado adicional
  activeTab: string = 'description';
  isInWishlist: boolean = false;
  currentImageUrl: string = '';

  // 🆕 Nuevas propiedades para funcionalidades ecuatorianas
  userLocation: string = 'Tu ciudad'; // Detectar o configurar ubicación del usuario
  private readonly COMPONENT_NAME = 'DetalleProductoComponent';
  private _cachedVariantPrice: any = null;
  private _lastVariantId: string | null = null;


  constructor(
    private route: ActivatedRoute,
    private productService: ProductService,
    private categoryService: CategoryService,
    private stockUpdateService: StockUpdateService,
    private inventoryService: ProductInventoryService,
    private promotionStateService: PromotionStateService,
    private modalService: NzModalService,
    private cartService: CartService,
    private cacheService: CacheService,
    private message: NzMessageService,
    private seoService: SeoService,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.promotionStateService.registerComponent(this.COMPONENT_NAME);

    this.detectUserLocation();

    // 🆕 ACTUALIZAR SUSCRIPCIÓN A PARÁMETROS
    this.route.paramMap.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      const productId = params.get('id');
      if (productId) {
        // 🚀 LLAMAR CON PARÁMETRO forceRefresh
        this.loadProduct(productId, false); // false = carga normal inicial
      } else {
        console.error('ID de producto no proporcionado');
        this.productsLoading = false;
      }
    });
    this.setupStockUpdateListener();
    this.setupPromotionUpdateListener();
  }

  ngOnDestroy(): void {
    this.promotionStateService.unregisterComponent(this.COMPONENT_NAME);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // 🆕 NUEVO: Configurar escucha de actualizaciones de promociones
  private setupPromotionUpdateListener(): void {
    

    // 📡 Listener para updates globales
    this.promotionStateService.onGlobalUpdate()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (globalUpdate) => {

          // Verificar si es relevante
          const isRelevant = this.isPromotionUpdateRelevant(globalUpdate);

          if (isRelevant) {
            this.handlePromotionUpdate(globalUpdate);
          }
        },
        error: (error) => {
          console.error('❌ [DETALLE] Error en listener global:', error);
        }
      });

    // 📡 También escuchar el listener normal de promociones
    this.promotionStateService.onPromotionChange()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {

          if (this.product && event.affectedProducts?.includes(this.product.id)) {
            this.forceReloadProduct();
          }
        },
        error: (error) => {
          console.error('❌ [DETALLE] Error en listener de promociones:', error);
        }
      });
  }

  // 🆕 NUEVO: Verificar si la actualización es relevante para este producto
  private isPromotionUpdateRelevant(globalUpdate: any): boolean {
    if (!this.product) return false;

    const event = globalUpdate.data;

    // 🟢 AGREGAR: Verificar si afecta a variantes específicas
    if (event.targetType === 'variant' && this.selectedVariant) {
      return event.targetId === this.selectedVariant.id;
    }

    // Tu lógica existente
    if (event.affectedProducts && Array.isArray(event.affectedProducts)) {
      return event.affectedProducts.includes(this.product.id);
    }

    return true;
  }

  // 🆕 NUEVO: Manejar actualizaciones de promociones
  private handlePromotionUpdate(globalUpdate: any): void {
    if (!this.product) return;

    const event = globalUpdate.data;

    // 🟢 AGREGAR: Manejar actualizaciones de variantes específicas
    if (event.targetType === 'variant') {
      this.reloadVariantData(event);
    } else {
      // Tu lógica existente
      this.reloadProductData();
    }

    this.showClientPromotionMessage(event);
  }

  private reloadVariantData(event: any): void {
    const currentProductId = this.route.snapshot.paramMap.get('id');
    if (!currentProductId) return;


    // Mostrar indicador de carga
    this.message.loading('Actualizando precios...', { nzDuration: 1000 });

    // 🚀 FORZAR RECARGA COMPLETA DEL PRODUCTO (más agresivo)
    this.loadProduct(currentProductId, true);
  }

  /**
   * 🆕 NUEVO: Recargar datos completos del producto
   */
  private reloadProductData(): void {
    const currentProductId = this.route.snapshot.paramMap.get('id');
    if (!currentProductId) return;

    // Mostrar indicador de carga
    this.message.loading('Actualizando promociones...', { nzDuration: 1500 });

    // Delay pequeño para asegurar que el caché del backend se limpió
    setTimeout(() => {
      // 🚀 RECARGAR CON FORCE REFRESH = TRUE
      this.loadProduct(currentProductId, true);
    }, 100);
  }

  // 🆕 NUEVO: Mostrar mensajes amigables al cliente
  private showClientPromotionMessage(event: any): void {
    switch (event.type) {
      case 'deactivated':
      case 'removed':
      case 'deleted':
        this.message.warning('🏷️ La promoción de este producto ya no está disponible');
        break;

      case 'activated':
      case 'applied':
        this.message.success('🎉 ¡Nueva promoción disponible para este producto!');
        break;

      case 'updated':
        this.message.info('🔄 Se ha actualizado la promoción de este producto');
        break;

      default:
        this.message.info('🔄 Se ha actualizado la información del producto');
    }
  }

  // 🚀 NUEVO MÉTODO: Configurar escucha de actualizaciones de stock
  private setupStockUpdateListener(): void {
    this.route.paramMap.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      const productId = params.get('id');
      if (!productId) return;

      this.stockUpdateService.onProductStockUpdate(productId)
        .pipe(
          takeUntil(this.destroy$),
          debounceTime(300),
          distinctUntilChanged((prev, curr) =>
            prev.variantId === curr.variantId && prev.newStock === curr.newStock
          )
        )
        .subscribe(update => {
          this.handleStockUpdate(update);
        });
    });
  }

  // 🔄 NUEVO MÉTODO: Manejar actualizaciones de stock con mensajes ecuatorianos
  private handleStockUpdate(update: StockUpdate): void {
    if (!this.product || !this.product.variants) {
      return;
    }

    const variantIndex = this.product.variants.findIndex(v => v.id === update.variantId);

    if (variantIndex === -1) {
      return;
    }

    const oldStock = this.product.variants[variantIndex].stock;
    this.product.variants[variantIndex].stock = update.newStock;

    const newTotalStock = this.product.variants.reduce((sum, v) => sum + v.stock, 0);
    this.product.totalStock = newTotalStock;

    if (this.selectedVariant?.id === update.variantId) {
      this.selectedVariant.stock = update.newStock;

      if (this.quantity > update.newStock) {
        this.quantity = Math.max(1, update.newStock);
      }
    }

    this.showStockUpdateNotification(update, oldStock);
  }

  // 🎉 NUEVO MÉTODO: Notificaciones ecuatorianas para stock
  private showStockUpdateNotification(update: StockUpdate, oldStock: number): void {
    const stockChange = update.newStock - oldStock;
    const colorSize = update.metadata?.colorName && update.metadata?.sizeName
      ? `${update.metadata.colorName} - ${update.metadata.sizeName}`
      : 'esta variante';

    if (update.source === 'admin' && stockChange > 0) {
      this.message.success(`¡Chevere! Se agregaron ${stockChange} unidades a ${colorSize} 🎒`);
    } else if (update.source === 'admin' && stockChange < 0) {
      this.message.info(`Stock actualizado, loco: ${update.newStock} unidades disponibles para ${colorSize}`);
    } else if (update.source === 'purchase' && stockChange < 0) {
      if (update.newStock === 0) {
        this.message.warning(`¡Uy! ${colorSize} se acabó al toque 😱`);
      } else if (update.newStock <= 3) {
        this.message.warning(`¡Apúrate! Solo quedan ${update.newStock} de ${colorSize} 🏃‍♂️`);
      }
    } else if (update.source === 'restock' && stockChange > 0) {
      this.message.success(`¡Llegó más! Ahora hay ${update.newStock} unidades de ${colorSize} 📦`);
    }
  }


  // 🚀 MÉTODO ACTUALIZADO: loadProduct con soporte para forceRefresh
loadProduct(productId: string, forceRefresh: boolean = false): void {
  this.productsLoading = true;

  // ✅ SOLUCIÓN: Usar el método correcto del ProductService según forceRefresh
  const productObservable = forceRefresh 
    ? this.productService.forceRefreshProduct(productId)
    : this.productService.getCompleteProduct(productId);

  productObservable
    .pipe(
      take(1),
      finalize(() => this.productsLoading = false)
    )
    .subscribe({
      next: (product) => {
        if (!product) {
          this.handleProductNotFound();
          return;
        }
        

        this.product = product as ExtendedProduct;
        this.currentImageUrl = product.imageUrl;
        this.continueProductSetup(product, productId);
        this.loadRelatedProducts(product, forceRefresh);
      },
      error: (error) => {
        console.error('❌ [DETALLE] Error cargando producto:', error);
        this.handleProductError();
      }
    });
}

  /**
 * 🏷️ Verifica si el producto tiene descuento
 */
  hasDiscount(product: ExtendedProduct): boolean {
    return !!(product.discountPercentage && product.discountPercentage > 0);
  }

  /**
   * 🎯 Verifica si el producto tiene promociones activas
   */
  hasActivePromotions(product: ExtendedProduct): boolean {
    // Verificar por descuento calculado
    if (this.hasDiscount(product)) {
      return true;
    }

    // Verificar por currentPrice vs price
    if (product.currentPrice && product.currentPrice < product.price) {
      return true;
    }

    return false;
  }

  /**
   * 🏷️ Obtiene el texto de la promoción para mostrar
   */
  getPromotionText(product: ExtendedProduct): string {
    if (!this.hasActivePromotions(product)) {
      return '';
    }

    if (product.discountPercentage && product.discountPercentage > 0) {
      return `${product.discountPercentage}% OFF`;
    }

    if (product.currentPrice && product.currentPrice < product.price) {
      const discount = Math.round(((product.price - product.currentPrice) / product.price) * 100);
      return `${discount}% OFF`;
    }

    return 'OFERTA ESPECIAL';
  }

  /**
   * 🔥 Obtiene el nombre de la promoción activa
   */
  getActivePromotionName(product: ExtendedProduct): string {
    if (!this.hasActivePromotions(product)) {
      return '';
    }

    // Verificar cache primero
    const cacheKey = `${product.id}_promotion_name`;
    if (this.promotionNamesCache.has(cacheKey)) {
      return this.promotionNamesCache.get(cacheKey)!;
    }

    let promotionName = '';

    // Lógica basada en descuentos
    if (product.discountPercentage && product.discountPercentage > 0) {
      if (product.discountPercentage >= 50) {
        promotionName = 'MEGA DESCUENTO';
      } else if (product.discountPercentage >= 30) {
        promotionName = 'GRAN OFERTA';
      } else if (product.discountPercentage >= 20) {
        promotionName = 'DESCUENTO ESPECIAL';
      } else {
        promotionName = 'PRECIO REBAJADO';
      }
    } else if (product.currentPrice && product.currentPrice < product.price) {
      promotionName = 'OFERTA LIMITADA';
    } else {
      promotionName = 'PROMOCIÓN ACTIVA';
    }

    // Personalizar según categoría ecuatoriana
    if (product.category) {
      const categoryPromotions: { [key: string]: string } = {
        'outdoor': 'AVENTURA ESPECIAL',
        'running': 'OFERTA RUNNING',
        'casual': 'DESCUENTO CASUAL',
        'deportivo': 'PROMO DEPORTIVA',
        'trekking': 'OFERTA MONTAÑERA'
      };

      if (categoryPromotions[product.category.toLowerCase()]) {
        promotionName = categoryPromotions[product.category.toLowerCase()];
      }
    }

    // Guardar en cache por 5 minutos
    this.promotionNamesCache.set(cacheKey, promotionName);
    setTimeout(() => {
      this.promotionNamesCache.delete(cacheKey);
    }, 5 * 60 * 1000);

    return promotionName;
  }

  /**
   * 🏷️ Verifica si la variante seleccionada tiene promoción
   */
  hasVariantPromotion(): boolean {
    if (!this.selectedVariant) return false;

    return !!(this.selectedVariant.promotionId &&
      this.selectedVariant.discountType &&
      this.selectedVariant.discountValue);
  }

  /**
   * 💰 Obtiene el precio de la variante seleccionada (con promoción si aplica)
   */
  getVariantPrice(): {
    originalPrice: number;
    currentPrice: number;
    hasDiscount: boolean;
    discountPercentage?: number;
    savings?: number;
  } {
    if (!this.selectedVariant || !this.product) {
      return {
        originalPrice: this.product?.price || 0,
        currentPrice: this.product?.price || 0,
        hasDiscount: false
      };
    }

    // 🔥 PRIORIDAD 1: Precio específico de variante con promoción
    if (this.hasVariantPromotion()) {
      const originalPrice = this.selectedVariant.originalPrice ||
        this.selectedVariant.price ||
        this.product.price;

      const currentPrice = this.selectedVariant.discountedPrice || originalPrice;
      const savings = Math.max(0, originalPrice - currentPrice);
      const discountPercentage = originalPrice > 0 ? (savings / originalPrice) * 100 : 0;

      return {
        originalPrice,
        currentPrice,
        hasDiscount: savings > 0,
        discountPercentage: Math.round(discountPercentage),
        savings
      };
    }

    // 🔥 PRIORIDAD 2: Precio específico de variante sin promoción
    if (this.selectedVariant.price && this.selectedVariant.price > 0) {
      return {
        originalPrice: this.selectedVariant.price,
        currentPrice: this.selectedVariant.price,
        hasDiscount: false
      };
    }

    // 🔥 PRIORIDAD 3: Precio del producto (con promoción del producto si aplica)
    const productPrice = this.product.currentPrice || this.product.price;
    const hasProductDiscount = this.hasActivePromotions(this.product);

    return {
      originalPrice: this.product.originalPrice || this.product.price,
      currentPrice: productPrice,
      hasDiscount: hasProductDiscount,
      discountPercentage: this.product.discountPercentage,
      savings: hasProductDiscount ? (this.product.originalPrice || this.product.price) - productPrice : 0
    };
  }

  /**
   * 🏷️ Obtiene el texto de promoción para la variante
   */
  getVariantPromotionText(): string {
    if (!this.hasVariantPromotion() || !this.selectedVariant) {
      return '';
    }

    if (this.selectedVariant.discountType === 'percentage') {
      return `${this.selectedVariant.discountValue}% OFF EN ESTA VARIANTE`;
    } else if (this.selectedVariant.discountType === 'fixed') {
      return `$${this.selectedVariant.discountValue} OFF EN ESTA VARIANTE`;
    }

    return 'PROMOCIÓN EN VARIANTE';
  }

  /**
   * 🔍 Obtiene nombre de la promoción aplicada a la variante
   */
  getVariantPromotionName(): string {
    if (!this.hasVariantPromotion() || !this.selectedVariant) {
      return '';
    }

    // Usar cache si existe
    const cacheKey = `${this.selectedVariant.id}_promotion_name`;
    if (this.promotionNamesCache.has(cacheKey)) {
      return this.promotionNamesCache.get(cacheKey)!;
    }

    let promotionName = 'OFERTA ESPECIAL EN VARIANTE';

    if (this.selectedVariant.discountValue) {
      if (this.selectedVariant.discountValue >= 50) {
        promotionName = 'MEGA DESCUENTO EN COLOR/TALLA';
      } else if (this.selectedVariant.discountValue >= 30) {
        promotionName = 'GRAN OFERTA EN VARIANTE';
      } else if (this.selectedVariant.discountValue >= 20) {
        promotionName = 'DESCUENTO ESPECIAL';
      } else {
        promotionName = 'PRECIO REBAJADO';
      }
    }

    // Guardar en cache
    this.promotionNamesCache.set(cacheKey, promotionName);
    setTimeout(() => {
      this.promotionNamesCache.delete(cacheKey);
    }, 5 * 60 * 1000);

    return promotionName;
  }

  /**
   * 🎯 Verifica si mostrar promoción de variante o producto
   */
  shouldShowVariantPromotion(): boolean {
    // Mostrar promoción de variante si existe, sino la del producto
    return this.hasVariantPromotion();
  }
  private handleProductNotFound(): void {
    this.modalService.error({
      nzTitle: 'Producto no encontrado',
      nzContent: 'El producto que buscas no existe o no está disponible.'
    });
  }

  private handleProductError(): void {
    this.modalService.error({
      nzTitle: 'Error',
      nzContent: 'No se pudo cargar el producto. Por favor, intenta nuevamente.'
    });
  }

  // 🆕 NUEVOS MÉTODOS para las funcionalidades de aventura

  getTechnologyLabel(value: string): string {
    const technologiesMap: { [key: string]: string } = {
      'secado_rapido': 'Secado Rápido',
      'proteccion_uv': 'Protección UV',
      'anti_transpirante': 'Anti-transpirante',
      'impermeable': 'Impermeable',
      'transpirable': 'Transpirable',
      'anti_bacterial': 'Anti-bacterial',
      'termico': 'Térmico',
      'elastico': 'Elástico',
      'resistente_viento': 'Resistente al viento',
      'sin_costuras': 'Sin costuras',
      'repelente_agua': 'Repelente al agua',
      'anti_olor': 'Anti-olor',
      'reflectivo': 'Reflectivo'
    };

    return technologiesMap[value] || value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  getTechnologyDescription(tech: string): string {
    const descriptions: { [key: string]: string } = {
      'secado_rapido': 'Se seca rapidito, perfecto para aventuras largas',
      'proteccion_uv': 'Te protege del sol intenso de la sierra',
      'impermeable': 'Ni una gota pasa, ideal para el invierno',
      'transpirable': 'Tu piel respira, no te sofoques',
      'anti_bacterial': 'Evita los malos olores en viajes largos',
      'termico': 'Te mantiene calentito en el páramo',
      'resistente_viento': 'El viento de la cordillera no te afecta'
    };
    return descriptions[tech] || 'Tecnología avanzada para tu aventura';
  }

  getDurabilityIcon(feature: string): string {
    const icons: { [key: string]: string } = {
      'resistente_agua': 'cloud',
      'anti_desgarro': 'safety',
      'reforzado': 'tool',
      'alta_durabilidad': 'star',
      'resistente_abrasion': 'shield'
    };
    return icons[feature] || 'check-circle';
  }

  getActivityIcon(activity: string): string {
    const icons: { [key: string]: string } = {
      'trekking': 'rise',
      'camping': 'home',
      'escalada': 'up',
      'ciclismo': 'car',
      'running': 'thunderbolt',
      'montañismo': 'fire',
      'aventura_urbana': 'environment'
    };
    return icons[activity] || 'compass';
  }

  getWeatherIcon(condition: string): string {
    const icons: { [key: string]: string } = {
      'lluvia': 'cloud',
      'sol_intenso': 'sun',
      'viento': 'deployment-unit',
      'frio': 'snow',
      'calor': 'fire',
      'clima_variable': 'sync'
    };
    return icons[condition] || 'cloud';
  }

  getHighlightIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'eco_friendly': 'leaf',
      'made_in_ecuador': 'flag',
      'award': 'trophy',
      'new_technology': 'rocket',
      'bestseller': 'star',
      'limited_edition': 'gift'
    };
    return icons[type] || 'check-circle';
  }

  // 🚀 MÉTODO ACTUALIZADO: loadRelatedProducts con soporte para forceRefresh
  private loadRelatedProducts(product: ExtendedProduct, forceRefresh: boolean = false): void {
    this.relatedLoading = true;


    // ✅ NOTA: getRelatedProducts no tiene versión NoCache, pero usa forceReloadProducts internamente
    this.productService.getRelatedProducts(product, 4)
      .pipe(
        take(1),
        finalize(() => this.relatedLoading = false)
      )
      .subscribe({
        next: (products) => {
          this.relatedProducts = products;
        },
        error: (error) => {
          console.error('❌ Error cargando relacionados:', error);
          this.relatedProducts = [];
        }
      });
  }

  forceReloadProduct(): void {
    const productId = this.route.snapshot.paramMap.get('id');
    if (!productId) {
      console.warn('🛍️ [DETALLE] No se pudo obtener ID para forzar recarga');
      return;
    }

    // 🆕 USAR EL NUEVO PATRÓN CON forceRefresh = true
    this.loadProduct(productId, true);
  }


  loadCategoryInfo(categoryId: string): void {
    this.categoryService.getCategoryById(categoryId)
      .pipe(take(1))
      .subscribe({
        next: (category) => {
          if (category) {
            this.categoryName = category.name;
            this.categoryDescription = category.description;
          }
        },
        error: (error) => {
          console.error('Error al cargar la categoría:', error);
        }
      });
  }

  selectColor(color: Color): void {
    this.selectedColor = color;

    if (color.imageUrl) {
      this.currentImageUrl = color.imageUrl;
    } else if (this.product) {
      this.currentImageUrl = this.product.imageUrl;
    }

    this.updateSelectedVariant();
  }

  selectSize(size: ExtendedSize): void {
    if (!this.hasStockForSize(size)) {
      return;
    }

    this.selectedSize = size;

    if (!this.selectedColor) {
      const availableColors = this.getAvailableColorsForSize(size);
      if (availableColors.length === 1) {
        this.selectColor(availableColors[0]);
      }
    }

    this.updateSelectedVariant();
  }

  isSizeAvailable(sizeName: string): boolean {
    if (!this.product || !this.product.sizes) return false;
    return this.product.sizes.some(size => size.name === sizeName);
  }

  handleSizeClick(sizeName: string): void {
    if (this.isSizeAvailable(sizeName) && this.hasStockForSizeName(sizeName)) {
      const size = this.product!.sizes.find(s => s.name === sizeName);
      if (size) {
        this.selectSize(size);
      }
    }
  }

  hasStockForSizeName(sizeName: string): boolean {
    if (!this.product) return false;

    if (this.selectedColor) {
      return this.product.variants.some(variant =>
        variant.sizeName === sizeName &&
        variant.colorName === this.selectedColor?.name &&
        variant.stock > 0
      );
    }

    return this.product.variants.some(variant =>
      variant.sizeName === sizeName &&
      variant.stock > 0
    );
  }

  hasLowStockForSizeName(sizeName: string): boolean {
    if (!this.product) return false;

    const variants = this.selectedColor
      ? this.product.variants.filter(v =>
        v.sizeName === sizeName &&
        v.colorName === this.selectedColor?.name
      )
      : this.product.variants.filter(v => v.sizeName === sizeName);

    if (variants.length === 0) return false;

    // Considerar stock bajo si alguna variante tiene stock > 0 pero <= 5
    return variants.some(variant => variant.stock > 0 && variant.stock <= 5);
  }

  getCurrentVariantStock(): number {
    if (!this.selectedVariant) return 0;
    return this.selectedVariant.stock;
  }

  getStockForColorSize(colorName: string, sizeName: string): number {
    if (!this.product?.variants) return 0;

    const variant = this.product.variants.find(v =>
      v.colorName === colorName && v.sizeName === sizeName
    );

    return variant?.stock || 0;
  }

  getMaxQuantityAvailable(): number {
    return this.selectedVariant?.stock || 0;
  }

  showImagePreview(imageUrl: string): void {
    this.previewImageUrl = imageUrl;
    this.showImageModal = true;
  }

  closeImagePreview(): void {
    this.showImageModal = false;
    this.previewImageUrl = '';
  }

  openSizeGuide(): void {
    this.showSizeGuide = true;
  }

  getAvailableColorsForSize(size: ExtendedSize): Color[] {
    if (!this.product || !size) return [];

    const colorNames = this.product.variants
      .filter(v => v.sizeName === size.name && v.stock > 0)
      .map(v => v.colorName);

    return this.product.colors.filter(c => colorNames.includes(c.name));
  }

  /**
 * 💰 Propiedad computed para el precio de variante (evita múltiples llamadas)
 */
  get currentVariantPrice(): {
    originalPrice: number;
    currentPrice: number;
    hasDiscount: boolean;
    discountPercentage?: number;
    savings?: number;
  } {
    // Cache manual para evitar recálculos innecesarios
    const currentVariantId = this.selectedVariant?.id || null;

    if (this._lastVariantId !== currentVariantId || !this._cachedVariantPrice) {
      this._cachedVariantPrice = this.getVariantPrice();
      this._lastVariantId = currentVariantId;
    }

    return this._cachedVariantPrice;
  }

  updateSelectedVariant(): void {
    if (!this.product || !this.selectedColor || !this.selectedSize) {
      this.selectedVariant = undefined;
      this._cachedVariantPrice = null; // 🆕 Limpiar cache
      this._lastVariantId = null;
      return;
    }

    this.selectedVariant = this.product.variants.find(variant =>
      variant.colorName === this.selectedColor?.name &&
      variant.sizeName === this.selectedSize?.name
    );

    if (this.selectedVariant && this.selectedVariant.stock < this.quantity) {
      this.quantity = Math.max(1, this.selectedVariant.stock);
    }

    // 🆕 Limpiar cache cuando cambia la variante
    this._cachedVariantPrice = null;
    this._lastVariantId = null;

    // 🆕 Forzar actualización de la vista cuando cambia la variante
    this.cdr.detectChanges();
  }

  increaseQuantity(): void {
    if (this.canIncreaseQuantity()) {
      this.quantity++;
    }
  }

  decreaseQuantity(): void {
    if (this.quantity > 1) {
      this.quantity--;
    }
  }

  canIncreaseQuantity(): boolean {
    if (!this.selectedVariant) return false;
    return this.quantity < this.selectedVariant.stock;
  }

  hasStockForColor(color: Color): boolean {
    if (!this.product) return false;

    return this.product.variants.some(variant =>
      variant.colorName === color.name &&
      variant.stock > 0
    );
  }

  hasStockForSize(size: ExtendedSize): boolean {
    if (!this.product) return false;

    if (this.selectedColor) {
      return this.product.variants.some(variant =>
        variant.sizeName === size.name &&
        variant.colorName === this.selectedColor?.name &&
        variant.stock > 0
      );
    }

    return this.product.variants.some(variant =>
      variant.sizeName === size.name &&
      variant.stock > 0
    );
  }

  hasLowStockForSize(size: ExtendedSize): boolean {
    if (!this.product) return false;

    const variant = this.product.variants.find(v =>
      v.sizeName === size.name &&
      (!this.selectedColor || v.colorName === this.selectedColor.name)
    );

    return !!variant && variant.stock > 0 && variant.stock <= 5;
  }

  setActiveTab(tabName: string): void {
    this.activeTab = tabName;
  }

  // 🆕 Método mejorado para agregar al carrito con mensajes ecuatorianos
  addToCart(): void {
    if (!this.product || !this.selectedVariant) {
      this.modalService.warning({
        nzTitle: '¡Ey, mi loco!',
        nzContent: 'Primero escoge una talla y un color antes de agregar a tu mochila.'
      });
      return;
    }

    // 🆕 VALIDAR STOCK EN TIEMPO REAL
    this.validateStockBeforeAddToCart().pipe(
      take(1),
      switchMap(hasStock => {
        if (!hasStock) {
          this.modalService.warning({
            nzTitle: 'No hay suficiente stock',
            nzContent: `Solo hay ${this.selectedVariant!.stock} unidades disponibles. ¡Apúrate que se acaba!`
          });
          return of(false);
        }

        return this.cartService.addToCart(
          this.product!.id,
          this.selectedVariant!.id,
          this.quantity,
          this.product!,
          this.selectedVariant!
        );
      })
    ).subscribe({
      next: (success: boolean) => {
        if (success) {
          this.trackAddToCart(); // 🆕 AGREGAR ANALYTICS
          this.message.success(`${this.product!.name} agregado al carrito`);
          this.quantity = 1;
        }
      },
      error: (error: unknown) => {
        console.error('Error al agregar al carrito:', error);
        this.modalService.error({
          nzTitle: 'Error',
          nzContent: 'Algo salió mal. Inténtalo de nuevo, porfa.'
        });
      }
    });
  }

  toggleWishlist(): void {
    this.isInWishlist = !this.isInWishlist;
    this.saveToWishlist();

    if (this.isInWishlist) {
      this.message.success('¡Guardado en favoritos! 💝');
    } else {
      this.message.info('Eliminado de favoritos');
    }
  }

  private checkIfInWishlist(): void {
    if (!this.product) return;

    const wishlist = this.getWishlistFromStorage();
    this.isInWishlist = wishlist.includes(this.product.id);
  }

  private saveToWishlist(): void {
    if (!this.product) return;

    let wishlist = this.getWishlistFromStorage();

    if (this.isInWishlist) {
      // Agregar a favoritos
      if (!wishlist.includes(this.product.id)) {
        wishlist.push(this.product.id);
      }
    } else {
      // Quitar de favoritos
      if (this.product) {
        wishlist = wishlist.filter(id => id !== this.product!.id);
      }
    }

    localStorage.setItem('wishlist', JSON.stringify(wishlist));
  }

  private getWishlistFromStorage(): string[] {
    try {
      const wishlist = localStorage.getItem('wishlist');
      return wishlist ? JSON.parse(wishlist) : [];
    } catch {
      return [];
    }
  }

  getColorsList(): string {
    if (!this.product) return '';
    return this.product.colors.map(color => color.name).join(', ');
  }

  getSizesList(): string {
    if (!this.product) return '';
    return this.product.sizes.map(size => size.name).join(', ');
  }

  private continueProductSetup(product: ExtendedProduct, productId: string): void {
    this.loadCategoryInfo(product.category);
    this.checkIfInWishlist();
    this.trackProductView(); // Solo analytics locales
    this.seoService.updateProductSEO(product);

    if (product.colors?.length > 0) {
      this.selectColor(product.colors[0]);
    }

    if (product.sizes?.length > 0) {
      this.selectSize(product.sizes[0]);
    }

  }

  onRelatedProductColorChange(event: { product: Product, color: Color, index: number }): void {
    console.log('Color cambiado en producto relacionado:', event);
  }

  trackByProductId(index: number, product: Product): string {
    return product?.id || `product-${index}`;
  }

  private detectUserLocation(): void {
    // Primero intentar geolocalización
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.getUserLocationFromCoords(position.coords.latitude, position.coords.longitude);
        },
        () => {
          // Si falla, usar IP detection como fallback
          this.getUserLocationFromIP();
        }
      );
    } else {
      this.getUserLocationFromIP();
    }
  }

  private getUserLocationFromCoords(lat: number, lng: number): void {
    // Usar servicio de geocoding reverso (opcional)
    // Por ahora, detectar si está en Ecuador
    if (lat >= -5 && lat <= 2 && lng >= -81 && lng <= -75) {
      this.userLocation = 'Ecuador';
    } else {
      this.userLocation = 'Tu ubicación';
    }
  }

  private getUserLocationFromIP(): void {
    // Usar un servicio como ipapi.co (gratis)
    fetch('https://ipapi.co/json/')
      .then(response => response.json())
      .then(data => {
        if (data.country_code === 'EC') {
          this.userLocation = data.city || 'Ecuador';
        } else {
          this.userLocation = data.country_name || 'Tu ubicación';
        }
      })
      .catch(() => {
        this.userLocation = 'Tu ciudad';
      });
  }

  // ✅ 3. VALIDACIÓN DE STOCK EN TIEMPO REAL
  private validateStockBeforeAddToCart(): Observable<boolean> {
    if (!this.selectedVariant) {
      return of(false);
    }

    // Verificar stock actualizado en el servidor
    return this.inventoryService.getVariantById(this.selectedVariant.id).pipe(
      take(1),
      map(variant => {
        if (!variant) return false;

        // Actualizar stock local si es diferente
        if (variant.stock !== this.selectedVariant!.stock) {
          this.selectedVariant!.stock = variant.stock;

          // Ajustar cantidad si es necesario
          if (this.quantity > variant.stock) {
            this.quantity = Math.max(1, variant.stock);
          }
        }

        return variant.stock >= this.quantity;
      }),
      catchError(() => of(false))
    );
  }

  // 🎨 4. COLORES DISPONIBLES PARA TALLA SELECCIONADA
  getAvailableColorsForSelectedSize(): Color[] {
    if (!this.product || !this.selectedSize) {
      return this.product?.colors || [];
    }

    // Filtrar colores que tienen stock para la talla seleccionada
    const availableColorNames = this.product.variants
      .filter(v => v.sizeName === this.selectedSize!.name && v.stock > 0)
      .map(v => v.colorName);

    return this.product.colors.filter(color =>
      availableColorNames.includes(color.name)
    );
  }

  // 🚚 5. CÁLCULO DE ENVÍO
  calculateShippingEstimate(): string {
    if (!this.userLocation) return 'Calculando envío...';

    const location = this.userLocation.toLowerCase();

    if (location.includes('quito') || location.includes('ecuador')) {
      return 'Llega mañana o pasado';
    } else if (location.includes('guayaquil') || location.includes('cuenca')) {
      return 'Llega en 2-3 días';
    } else {
      return 'Llega en 2-5 días';
    }
  }

  private trackProductView(): void {
    if (!this.product) return;

    // Almacenar en localStorage para analytics
    const viewData = {
      productId: this.product.id,
      productName: this.product.name,
      category: this.product.category,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    const views = this.getStoredViews();
    views.push(viewData);

    // Mantener solo los últimos 50 views
    const recentViews = views.slice(-50);
    localStorage.setItem('product_views', JSON.stringify(recentViews));
  }

  private trackAddToCart(): void {
    if (!this.product || !this.selectedVariant) return;

    const cartData = {
      productId: this.product.id,
      variantId: this.selectedVariant.id,
      quantity: this.quantity,
      price: this.product.price,
      timestamp: new Date().toISOString()
    };

    const cartEvents = this.getStoredCartEvents();
    cartEvents.push(cartData);

    localStorage.setItem('cart_events', JSON.stringify(cartEvents.slice(-20)));
  }

  private getStoredViews(): any[] {
    try {
      const views = localStorage.getItem('product_views');
      return views ? JSON.parse(views) : [];
    } catch {
      return [];
    }
  }

  private getStoredCartEvents(): any[] {
    try {
      const events = localStorage.getItem('cart_events');
      return events ? JSON.parse(events) : [];
    } catch {
      return [];
    }
  }

}