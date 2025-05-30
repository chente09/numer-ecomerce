import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ProductService } from '../../../../services/admin/product/product.service';
import { CategoryService, Category } from '../../../../services/admin/category/category.service';
import { ProductVariantService } from '../../../../services/admin/productVariante/product-variant.service';
import { CartService } from '../../../../pasarela-pago/services/cart/cart.service';
import { Product, Color, Size, ProductVariant } from '../../../../models/models';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { FormsModule } from '@angular/forms';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { ProductPriceService } from '../../../../services/admin/price/product-price.service';
import { ProductInventoryService } from '../../../../services/admin/inventario/product-inventory.service';
import { Observable, Subject, catchError, debounceTime, distinctUntilChanged, finalize, forkJoin, map, of, switchMap, take, takeUntil } from 'rxjs';
import { CacheService } from '../../../../services/admin/cache/cache.service';
import { StockUpdate, StockUpdateService } from '../../../../services/admin/stockUpdate/stock-update.service';
import { NzMessageService } from 'ng-zorro-antd/message';

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
    NzIconModule
  ],
  templateUrl: './detalle-producto.component.html',
  styleUrl: './detalle-producto.component.css'
})
export class DetalleProductoComponent implements OnInit, OnDestroy {
  // Propiedades principales
  product: Product | undefined;
  selectedColor: Color | undefined;
  selectedSize: Size | undefined;
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
  relatedProducts: Product[] = [];
  currentImageUrl: string = '';

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
  // ✅ REEMPLAZAR loadProductFromRoute() con:
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

    // 👂 ESCUCHAR actualizaciones de stock para este producto
    this.stockUpdateService.onProductStockUpdate(productId)
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300), // Evitar actualizaciones muy frecuentes
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

// 🔄 NUEVO MÉTODO: Manejar actualizaciones de stock en tiempo real
private handleStockUpdate(update: StockUpdate): void {
  if (!this.product || !this.product.variants) {
    console.log('⚠️ [DETALLE] Producto no cargado, ignorando actualización');
    return;
  }

  // 🎯 Encontrar y actualizar la variante específica
  const variantIndex = this.product.variants.findIndex(v => v.id === update.variantId);
  
  if (variantIndex === -1) {
    console.log('⚠️ [DETALLE] Variante no encontrada:', update.variantId);
    return;
  }

  // 📊 Actualizar stock de la variante
  const oldStock = this.product.variants[variantIndex].stock;
  this.product.variants[variantIndex].stock = update.newStock;

  // 🧮 Recalcular stock total del producto
  const newTotalStock = this.product.variants.reduce((sum, v) => sum + v.stock, 0);
  this.product.totalStock = newTotalStock;

  // 🎯 Actualizar variante seleccionada si coincide
  if (this.selectedVariant?.id === update.variantId) {
    this.selectedVariant.stock = update.newStock;
    
    // 🔄 Ajustar cantidad si excede el nuevo stock
    if (this.quantity > update.newStock) {
      this.quantity = Math.max(1, update.newStock);
    }
  }

  // 🎉 Mostrar notificación amigable al usuario
  this.showStockUpdateNotification(update, oldStock);

  console.log('✅ [DETALLE] Stock actualizado localmente:', {
    variantId: update.variantId,
    oldStock,
    newStock: update.newStock,
    newTotalStock,
    source: update.source
  });
}

// 🎉 NUEVO MÉTODO: Mostrar notificaciones amigables de stock
private showStockUpdateNotification(update: StockUpdate, oldStock: number): void {
  const stockChange = update.newStock - oldStock;
  const colorSize = update.metadata?.colorName && update.metadata?.sizeName 
    ? `${update.metadata.colorName} - ${update.metadata.sizeName}` 
    : 'esta variante';

  if (update.source === 'admin' && stockChange > 0) {
    // Administrador aumentó stock
    this.message.success(`¡Buenas noticias! Se agregaron ${stockChange} unidades a ${colorSize}`);
  } else if (update.source === 'admin' && stockChange < 0) {
    // Administrador redujo stock
    this.message.info(`Stock actualizado: ${update.newStock} unidades disponibles para ${colorSize}`);
  } else if (update.source === 'purchase' && stockChange < 0) {
    // Otra persona compró
    if (update.newStock === 0) {
      this.message.warning(`¡Atención! ${colorSize} se agotó recientemente`);
    } else if (update.newStock <= 3) {
      this.message.warning(`¡Pocas unidades! Solo quedan ${update.newStock} de ${colorSize}`);
    }
  } else if (update.source === 'restock' && stockChange > 0) {
    // Reabastecimiento
    this.message.success(`¡Reabastecido! Ahora hay ${update.newStock} unidades de ${colorSize}`);
  }
}

  private setupCacheNotifications(): void {
  this.route.paramMap.pipe(
    takeUntil(this.destroy$)
  ).subscribe(params => {
    const productId = params.get('id');
    if (!productId) return;

    // 🚀 ESCUCHAR invalidaciones de producto específico
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

    // 🚀 ESCUCHAR invalidaciones generales de productos
    this.cacheService.getInvalidationNotifier('products')
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(1000), // Más tiempo para evitar bucles
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

  // 🚀 INVALIDAR CACHÉ ANTES DE CARGAR
  this.cacheService.invalidate(`products_${productId}`);
  this.cacheService.invalidate(`product_variants_product_${productId}`);

  // USAR getProductByIdNoCache en lugar de getProductById
  const productObservable = this.productService.getProductByIdNoCache(productId).pipe(take(1));
  const variantsObservable = this.inventoryService.getVariantsByProductId(productId).pipe(take(1));

  forkJoin({ product: productObservable, variants: variantsObservable })
    .pipe(
      map(({ product, variants }) => {
        if (!product) return null;

        // 🧮 FORZAR RECÁLCULO DEL STOCK
        const realTotalStock = variants.reduce((sum, v) => sum + v.stock, 0);
        
        return {
          ...product,
          variants: variants,
          totalStock: realTotalStock, // ✅ USAR STOCK REAL
        };
      }),
      finalize(() => this.productsLoading = false)
    )
    .subscribe({
      next: (product) => {
        if (!product) return;
        
        this.product = product;
        this.currentImageUrl = product.imageUrl;
        this.continueProductSetup(product, productId);
      },
      error: (error) => {
        console.error('❌ Error:', error);
        this.modalService.error({
          nzTitle: 'Error',
          nzContent: 'No se pudo cargar el producto.'
        });
      }
    });
}

forceReloadProduct(): void {
  const productId = this.route.snapshot.paramMap.get('id');
  if (!productId) return;

  // 🧹 LIMPIAR TODO EL CACHÉ RELACIONADO
  this.cacheService.clearCache();
  
  // 🔄 RECARGAR
  this.loadProduct(productId);
}


  // Incrementar vistas del producto
  incrementProductViews(productId: string): void {
    this.inventoryService.incrementProductViews(productId)
      .pipe(take(1))
      .subscribe({
        next: () => {
          // ✅ SOLO actualizar local, NO invalidar caché
          if (this.product) {
            this.product.views = (this.product.views || 0) + 1;
          }
          // ✅ NO hacer esto: this.cacheService.invalidate(...)
        },
        error: (error) => {
          console.error('Error al incrementar vistas:', error);
        }
      });
  }




  // Cargar información de la categoría usando el servicio
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

  // Método para cargar productos relacionados
  loadRelatedProducts(category: string, currentProductId: string): void {
    this.productService.getRelatedProducts({ category, id: currentProductId } as Product, 4)
      .subscribe({
        next: (products) => {
          this.relatedProducts = products;
        },
        error: (error) => {
          console.error('Error al cargar productos relacionados:', error);
        }
      });
  }

  // Métodos para manejar selecciones
  selectColor(color: Color): void {
    this.selectedColor = color;

    // Actualizar la imagen del producto 
    if (color.imageUrl) {
      this.currentImageUrl = color.imageUrl;
    } else if (this.product) {
      this.currentImageUrl = this.product.imageUrl;
    }

    this.updateSelectedVariant();

  }

  // Versión mejorada para seleccionar una talla con validación de stock
  selectSize(size: Size): void {
    // No permitir seleccionar tallas sin stock
    if (!this.hasStockForSize(size)) {
      return;
    }

    this.selectedSize = size;

    // Si no hay color seleccionado y esta talla solo está disponible en un color, seleccionarlo automáticamente
    if (!this.selectedColor) {
      const availableColors = this.getAvailableColorsForSize(size);
      if (availableColors.length === 1) {
        this.selectColor(availableColors[0]);
      }
    }

    // Actualizar la variante seleccionada
    this.updateSelectedVariant();
  }

  // Verifica si una talla está disponible en el producto
  isSizeAvailable(sizeName: string): boolean {
    if (!this.product || !this.product.sizes) return false;
    return this.product.sizes.some(size => size.name === sizeName);
  }

  // Maneja el clic en una talla
  handleSizeClick(sizeName: string): void {
    // Solo procesar el clic si la talla está disponible y tiene stock
    if (this.isSizeAvailable(sizeName) && this.hasStockForSizeName(sizeName)) {
      const size = this.product!.sizes.find(s => s.name === sizeName);
      if (size) {
        this.selectSize(size);
      }
    }
  }

  // Verifica si hay stock para una talla por nombre
  hasStockForSizeName(sizeName: string): boolean {
    if (!this.product) return false;

    const size = this.product.sizes.find(s => s.name === sizeName);
    if (!size) return false;

    return this.hasStockForSize(size);
  }

  // Verifica si hay poco stock para una talla por nombre
  hasLowStockForSizeName(sizeName: string): boolean {
    if (!this.product) return false;

    const size = this.product.sizes.find(s => s.name === sizeName);
    if (!size) return false;

    return this.hasLowStockForSize(size);
  }

  // ✅ CORREGIR estos métodos para usar stock de variantes
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

  // ✅ ACTUALIZAR el método de stock para talla
  getTotalStockForSize(sizeName: string): number {
    if (!this.product?.variants) return 0;

    return this.product.variants
      .filter(v => v.sizeName === sizeName)
      .reduce((total, variant) => total + variant.stock, 0);
  }

  // ✅ MÉTODO para obtener stock disponible para agregar al carrito
  getMaxQuantityAvailable(): number {
    return this.selectedVariant?.stock || 0;
  }

  

  // Método para mostrar la previsualización de imagen
  showImagePreview(imageUrl: string): void {
    this.previewImageUrl = imageUrl;
    this.showImageModal = true;
  }

  // Método para cerrar la previsualización
  closeImagePreview(): void {
    this.showImageModal = false;
    this.previewImageUrl = '';
  }

  

  // Método para abrir el modal de tallas
  openSizeGuide(): void {
    this.showSizeGuide = true; 
  }

  // Método auxiliar para obtener los colores disponibles para una talla
  getAvailableColorsForSize(size: Size): Color[] {
    if (!this.product || !size) return [];

    // Obtener nombres de colores que tienen stock para esta talla
    const colorNames = this.product.variants
      .filter(v => v.sizeName === size.name && v.stock > 0)
      .map(v => v.colorName);

    // Devolver los objetos de color correspondientes
    return this.product.colors.filter(c => colorNames.includes(c.name));
  }

  // Actualiza la variante seleccionada basada en color y talla
  updateSelectedVariant(): void {
    if (!this.product || !this.selectedColor || !this.selectedSize) {
      this.selectedVariant = undefined;
      return;
    }

    // Buscar la variante que coincide con el color y talla seleccionados
    this.selectedVariant = this.product.variants.find(variant =>
      variant.colorName === this.selectedColor?.name &&
      variant.sizeName === this.selectedSize?.name
    );

    // Resetear la cantidad si cambiamos a una variante con menos stock que la cantidad actual
    if (this.selectedVariant && this.selectedVariant.stock < this.quantity) {
      this.quantity = Math.max(1, this.selectedVariant.stock);
    }
  }

  // Métodos para la cantidad
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
    // Verificar si hay suficiente stock
    if (!this.selectedVariant) return false;
    return this.quantity < this.selectedVariant.stock;
  }

  // Verificar disponibilidad de stock para un color
  hasStockForColor(color: Color): boolean {
    if (!this.product) return false;

    return this.product.variants.some(variant =>
      variant.colorName === color.name &&
      variant.stock > 0
    );
  }

  // Método mejorado para verificar stock para una talla
  hasStockForSize(size: Size): boolean {
    if (!this.product) return false;

    // Con color seleccionado, verifica stock para esa combinación
    if (this.selectedColor) {
      return this.product.variants.some(variant =>
        variant.sizeName === size.name &&
        variant.colorName === this.selectedColor?.name &&
        variant.stock > 0
      );
    }

    // Sin color seleccionado, verifica si hay stock en cualquier color para esa talla
    return this.product.variants.some(variant =>
      variant.sizeName === size.name &&
      variant.stock > 0
    );
  }

  // Nuevo método para verificar si hay poco stock para una talla específica
  hasLowStockForSize(size: Size): boolean {
    if (!this.product) return false;

    // Busca la variante con la talla seleccionada y el color seleccionado (si existe)
    const variant = this.product.variants.find(v =>
      v.sizeName === size.name &&
      (!this.selectedColor || v.colorName === this.selectedColor.name)
    );

    // Retorna true si hay stock pero es bajo (entre 1 y 5 unidades)
    return !!variant && variant.stock > 0 && variant.stock <= 5;
  }

  // Métodos para los tabs
  setActiveTab(tabName: string): void {
    this.activeTab = tabName;
  }

  // Mostrar guía de tallas
  openSizeGuideModal(): void {
    // Preparar un HTML con imágenes de tallas dinámicas
    let sizesHtml = '';

    if (this.product && this.product.sizes && this.product.sizes.length > 0) {
      // Crear una tabla con las imágenes y nombres de las tallas
      sizesHtml = `
      <div class="size-guide-grid">
        ${this.product.sizes.map(size => `
          <div class="size-guide-item">
            ${size.imageUrl ?
          `<img src="${size.imageUrl}" alt="Talla ${size.name}" class="size-guide-image">` :
          '<div class="size-guide-no-image"></div>'
        }
            <div class="size-guide-size-name">${size.name}</div>
          </div>
        `).join('')}
      </div>
    `;
    }

    this.modalService.create({
      nzTitle: 'Guía de Tallas',
      nzContent: `
      <div class="size-guide-modal">
        <div class="size-guide-content">
          <h4>Cómo elegir tu talla correcta</h4>
          <p>1. Mide la circunferencia de tu pecho, cintura y cadera.</p>
          <p>2. Consulta la tabla para encontrar tu talla ideal.</p>
          <p>3. Si estás entre dos tallas, elige la mayor para un ajuste más cómodo.</p>
          
          <h4 class="size-guide-subtitle">Nuestras tallas disponibles</h4>
          ${sizesHtml}
        </div>
      </div>
    `,
      nzWidth: 700,
      nzFooter: null,
      nzCentered: true,
      nzBodyStyle: { padding: '20px' },
      nzClassName: 'size-guide-modal-container'
    });
  }

  // Agregar al carrito
  addToCart(): void {
    if (!this.product || !this.selectedVariant) {
      this.modalService.warning({
        nzTitle: 'No se pudo agregar el producto',
        nzContent: 'Por favor selecciona una talla y un color antes de agregar al carrito.'
      });
      return;
    }

     // ✅ Verificar stock actual antes de proceder
  if (this.selectedVariant.stock < this.quantity) {
    this.modalService.warning({
      nzTitle: 'Stock insuficiente',
      nzContent: `Solo hay ${this.selectedVariant.stock} unidades disponibles de ${this.selectedVariant.colorName} - ${this.selectedVariant.sizeName}`
    });
    return;
  }

    // ✅ CORRECCIÓN: Usar el método correcto del CartService
    this.cartService.addToCart(
      this.product.id,
      this.selectedVariant.id,
      this.quantity,
      this.product,
      this.selectedVariant
    ).pipe(
      take(1)
    ).subscribe({
      next: (success: boolean) => {
        if (success) {
          
          this.modalService.success({
            nzTitle: 'Producto añadido al carrito',
            nzContent: `Has agregado ${this.quantity} unidad(es) de ${this.product!.name} a tu carrito.`,
            nzOkText: 'Ir al carrito',
            nzCancelText: 'Continuar comprando',
            nzOnOk: () => {
              this.router.navigate(['/carrito']);
            }
          });// 🔄 Resetear cantidad a 1 después de agregar
        this.quantity = 1;
        } else {
          this.modalService.error({
            nzTitle: 'Error',
            nzContent: 'No se pudo agregar el producto al carrito. Puede que no haya suficiente stock disponible.'
          });
        }
      },
      error: (error: unknown) => {
        console.error('Error al agregar al carrito:', error);
        this.modalService.error({
          nzTitle: 'Error',
          nzContent: 'Ocurrió un error al procesar tu solicitud. Por favor, intenta nuevamente.'
        });
      }
    });
  }

  // Toggle wishlist
  toggleWishlist(): void {
    this.isInWishlist = !this.isInWishlist;

    // Aquí implementarías la lógica para agregar/quitar de la lista de deseos
    if (this.isInWishlist) {
      console.log('Producto agregado a favoritos:', this.product?.id);
    } else {
      console.log('Producto eliminado de favoritos:', this.product?.id);
    }
  }

  // Métodos para mostrar información
  getColorsList(): string {
    if (!this.product) return '';
    return this.product.colors.map(color => color.name).join(', ');
  }

  getSizesList(): string {
    if (!this.product) return '';
    return this.product.sizes.map(size => size.name).join(', ');
  }

  // Método para generar array para mostrar las estrellas de rating
  getStarsArray(rating: number): number[] {
    return Array(5).fill(0).map((_, i) => i < Math.floor(rating) ? 1 : 0);
  }

  // ✅ AGREGAR ESTE MÉTODO NUEVO AL FINAL DE TU COMPONENTE
  private continueProductSetup(product: Product, productId: string): void {
    this.loadCategoryInfo(product.category);

    if (product.colors?.length > 0) {
      this.selectColor(product.colors[0]);
    }

    if (product.sizes?.length > 0) {
      this.selectSize(product.sizes[0]);
    }

    this.loadRelatedProducts(product.category, productId);
    this.incrementProductViews(productId);
  }

  // ✅ TAMBIÉN AGREGAR ESTE MÉTODO PARA LIMPIAR CACHÉ CORRUPTO
  clearProblematicCache(): void {
    this.cacheService.clearCache();
    console.log('🧹 Caché limpiado - recarga la página');
  }

}