import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
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
import { Observable, catchError, finalize, map, of, switchMap, take } from 'rxjs';
import { CacheService } from '../../../../services/admin/cache/cache.service';

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
export class DetalleProductoComponent implements OnInit {
  // Propiedades principales
  product: Product | undefined;
  selectedColor: Color | undefined;
  selectedSize: Size | undefined;
  selectedVariant: ProductVariant | undefined;
  quantity: number = 1;
  productsLoading: boolean = true;

  // Categoría
  categoryName: string = '';
  categoryDescription: string = '';

  // Tallas
  showSizeGuide: boolean = false;
  showSizeLegend: boolean = true;
  showImageModal: boolean = false;
  previewImageUrl: string = '';
  standardSizes: string[] = ['XS', 'S', 'M', 'L', 'XL'];
  @ViewChild('tableContainer') tableContainer!: ElementRef;

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
    private productVariantService: ProductVariantService,
    private productPriceService: ProductPriceService,
    private inventoryService: ProductInventoryService,
    private modalService: NzModalService,
    private cartService: CartService,
    private cacheService: CacheService
  ) { }

  ngOnInit(): void {
    this.loadProductFromRoute();
  }

  loadProductFromRoute(): void {
    this.route.paramMap.subscribe(params => {
      const productId = params.get('id');

      if (productId) {
        this.loadProduct(productId);
      } else {
        console.error('ID de producto no proporcionado');
        this.productsLoading = false;
      }
    });
  }

  loadProduct(productId: string): void {
    this.productsLoading = true;

    this.productService.getCompleteProduct(productId)
      .pipe(
        take(1),
        map(product => {

          if (product?.variants) {
            if (Array.isArray(product.variants) && product.variants.length > 0) {

              if (typeof product.variants[0] === 'string') {
                console.warn('⚠️ COMPONENTE: Variantes son IDs, cargando objetos completos...');
                return { ...product, needsVariantLoad: true };
              }
            }
          }

          return product;
        }),
        switchMap(product => {
          if (!product) return of(null);

          if ((product as any).needsVariantLoad) {
            console.log('🔧 COMPONENTE: Cargando variantes correctamente...');

            return this.inventoryService.getVariantsByProductId(productId).pipe(
              take(1),
              map(variants => {
                console.log('✅ COMPONENTE: Variantes cargadas:', variants.length);
                return {
                  ...product,
                  variants: variants,
                  needsVariantLoad: undefined
                };
              }),
              switchMap(productWithVariants => {
                return this.productPriceService.calculateDiscountedPriceAsync(productId)
                  .pipe(
                    take(1),
                    catchError(error => {
                      console.error('Error al obtener precios con descuento:', error);
                      return of(productWithVariants);
                    })
                  );
              })
            );
          }

          return this.productPriceService.calculateDiscountedPriceAsync(productId)
            .pipe(
              take(1),
              catchError(error => {
                console.error('Error al obtener precios con descuento:', error);
                return of(product);
              })
            );
        }),
        finalize(() => {
          this.productsLoading = false;
        })
      )
      .subscribe({
        // 🎯 AQUÍ VA LA CORRECCIÓN 3 - REEMPLAZAR TODO EL BLOQUE NEXT
        next: (product) => {
          if (!product) {
            console.error('Producto no encontrado');
            return;
          }

          // ✅ VERIFICACIÓN CRÍTICA: Si las variantes son strings, cargar manualmente
          if (product.variants && Array.isArray(product.variants) &&
            product.variants.length > 0 && typeof product.variants[0] === 'string') {

            console.warn('⚠️ COMPONENTE: Variantes son IDs, cargando objetos...');

            // Cargar variantes correctas manualmente
            this.inventoryService.getVariantsByProductId(productId)
              .pipe(take(1))
              .subscribe(variants => {
                this.product = { ...product, variants };
                this.currentImageUrl = product.imageUrl;
                this.continueProductSetup(product, productId);
              });

            return; // Salir temprano para evitar duplicación
          }

          // ✅ FLUJO NORMAL SI LAS VARIANTES SON CORRECTAS
          this.product = product;
          this.currentImageUrl = product.imageUrl;
          this.continueProductSetup(product, productId);
        },
        error: (error) => {
          console.error('Error al cargar el producto:', error);
          this.productsLoading = false;
          this.modalService.error({
            nzTitle: 'Error',
            nzContent: 'No se pudo cargar el producto. Por favor, inténtelo de nuevo más tarde.'
          });
        }
      });
  }


  // Incrementar vistas del producto
  incrementProductViews(productId: string): void {
    this.inventoryService.incrementProductViews(productId)
      .pipe(take(1))
      .subscribe({
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

  ngAfterViewInit(): void {
    // Verificar si se necesita scroll en la tabla
    this.checkTableScroll();
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

  // Verificar si la tabla necesita scroll horizontal
  checkTableScroll(): void {
    if (this.tableContainer) {
      const container = this.tableContainer.nativeElement;
      const hasScroll = container.scrollWidth > container.clientWidth;

      if (hasScroll) {
        container.classList.remove('no-scroll');
      } else {
        container.classList.add('no-scroll');
      }
    }
  }

  // Método para abrir el modal de tallas
  openSizeGuide(): void {
    this.showSizeGuide = true;
    // Programar verificación de scroll después de que se renderice el modal
    setTimeout(() => {
      this.checkTableScroll();
    }, 300);
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
          });
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