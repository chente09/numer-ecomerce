import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ProductService } from '../../../services/admin/product/product.service';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { ProductVariantService } from '../../../services/admin/productVariante/product-variant.service';
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
import { Observable, Subject, catchError, debounceTime, distinctUntilChanged, finalize, forkJoin, map, of, switchMap, take, takeUntil } from 'rxjs';
import { CacheService } from '../../../services/admin/cache/cache.service';
import { StockUpdate, StockUpdateService } from '../../../services/admin/stockUpdate/stock-update.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ProductCardComponent } from "../../../components/product-card/product-card.component";

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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private productService: ProductService,
    private categoryService: CategoryService,
    private stockUpdateService: StockUpdateService,
    private inventoryService: ProductInventoryService,
    private modalService: NzModalService,
    private cartService: CartService,
    private cacheService: CacheService,
    private message: NzMessageService
  ) { }

  ngOnInit(): void {

    this.detectUserLocation();

    this.route.paramMap.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      const productId = params.get('id');
      if (productId) {
        this.loadProduct(productId);
      } else {
        console.error('ID de producto no proporcionado');
        this.productsLoading = false;
      }
    });

    this.setupCacheNotifications();
    this.setupStockUpdateListener();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
          console.log('🔄 [DETALLE] Recibida actualización de stock:', update);
          this.handleStockUpdate(update);
        });
    });
  }

  // 🔄 NUEVO MÉTODO: Manejar actualizaciones de stock con mensajes ecuatorianos
  private handleStockUpdate(update: StockUpdate): void {
    if (!this.product || !this.product.variants) {
      console.log('⚠️ [DETALLE] Producto no cargado, ignorando actualización');
      return;
    }

    const variantIndex = this.product.variants.findIndex(v => v.id === update.variantId);

    if (variantIndex === -1) {
      console.log('⚠️ [DETALLE] Variante no encontrada:', update.variantId);
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

    console.log('✅ [DETALLE] Stock actualizado localmente:', {
      variantId: update.variantId,
      oldStock,
      newStock: update.newStock,
      newTotalStock,
      source: update.source
    });
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

  private setupCacheNotifications(): void {
    this.route.paramMap.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      const productId = params.get('id');
      if (!productId) return;

      this.cacheService.getInvalidationNotifier(`products_${productId}`)
        .pipe(
          takeUntil(this.destroy$),
          debounceTime(500),
          distinctUntilChanged()
        )
        .subscribe(() => {
          console.log('🔄 Producto invalidado, recargando con datos frescos...');
          this.loadProduct(productId);
        });

      this.cacheService.getInvalidationNotifier('products')
        .pipe(
          takeUntil(this.destroy$),
          debounceTime(1000),
          distinctUntilChanged()
        )
        .subscribe(() => {
          console.log('🔄 Caché de productos invalidado, recargando...');
          this.loadProduct(productId);
        });
    });
  }

  loadProduct(productId: string): void {
    this.productsLoading = true;
    console.log('🔄 Cargando producto:', productId);

    this.cacheService.invalidate(`products_${productId}`);
    this.cacheService.invalidate(`product_variants_product_${productId}`);

    const productObservable = this.productService.getProductByIdNoCache(productId).pipe(take(1));
    const variantsObservable = this.inventoryService.getVariantsByProductId(productId).pipe(take(1));

    forkJoin({ product: productObservable, variants: variantsObservable })
      .pipe(
        map(({ product, variants }) => {
          if (!product) return null;

          const realTotalStock = variants.reduce((sum, v) => sum + v.stock, 0);

          return {
            ...product,
            variants: variants,
            totalStock: realTotalStock,
          } as ExtendedProduct;
        }),
        finalize(() => this.productsLoading = false)
      )
      .subscribe({
        next: (product) => {
          if (!product) return;

          this.product = product;
          this.currentImageUrl = product.imageUrl;
          this.continueProductSetup(product, productId);
          this.loadRelatedProducts(product);
        },
        error: (error) => {
          console.error('❌ Error:', error);
          this.modalService.error({
            nzTitle: 'Error',
            nzContent: 'No se pudo cargar el producto, mi loco.'
          });
        }
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

  private loadRelatedProducts(product: ExtendedProduct): void {
    this.relatedLoading = true;

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
          console.error('Error cargando relacionados:', error);
          this.relatedProducts = [];
        }
      });
  }

  forceReloadProduct(): void {
    const productId = this.route.snapshot.paramMap.get('id');
    if (!productId) return;

    this.cacheService.clearCache();
    this.loadProduct(productId);
  }

  incrementProductViews(productId: string): void {
    this.inventoryService.incrementProductViews(productId)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (this.product) {
            this.product.views = (this.product.views || 0) + 1;
          }
        },
        error: () => {
          // Error manejado silenciosamente
        }
      });
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

  updateSelectedVariant(): void {
    if (!this.product || !this.selectedColor || !this.selectedSize) {
      this.selectedVariant = undefined;
      return;
    }

    this.selectedVariant = this.product.variants.find(variant =>
      variant.colorName === this.selectedColor?.name &&
      variant.sizeName === this.selectedSize?.name
    );

    if (this.selectedVariant && this.selectedVariant.stock < this.quantity) {
      this.quantity = Math.max(1, this.selectedVariant.stock);
    }
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
    this.trackProductView();

    if (product.colors?.length > 0) {
      this.selectColor(product.colors[0]);
    }

    if (product.sizes?.length > 0) {
      this.selectSize(product.sizes[0]);
    }

    this.incrementProductViews(productId);
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

  clearProblematicCache(): void {
    this.cacheService.clearCache();
    this.message.success('Caché limpiado, loco. Recarga la página');
    console.log('🧹 Caché limpiado - recarga la página');
  }
}