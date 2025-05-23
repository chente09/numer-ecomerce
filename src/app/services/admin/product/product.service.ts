import { Injectable } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, getDoc, where, query,
  updateDoc, deleteDoc, setDoc, getDocs,
  writeBatch
} from '@angular/fire/firestore';
import { Observable, from, of, forkJoin, throwError, firstValueFrom } from 'rxjs';
import { map, catchError, switchMap, tap, take, shareReplay } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

// Servicios de productos
import { ProductInventoryService, SaleItem, StockTransfer, StockUpdate, LowStockProduct, InventorySummary } from '../inventario/product-inventory.service';
import { ProductPriceService } from '../price/product-price.service';
import { ProductVariantService } from '../productVariante/product-variant.service';
import { ProductImageService } from '../image/product-image.service';

// Utilidades
import { ErrorUtil } from '../../../utils/error-util';
import { CacheService } from '../cache/cache.service';

// Modelos
import { Product, ProductVariant, Color, Size, Review, Promotion } from '../../../models/models';

// Interfaces para estrategias de invalidación
interface CacheInvalidationStrategy {
  productId?: string;
  categoryId?: string;
  affectsAll?: boolean;
  patterns?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private productsCollection = 'products';
  private readonly productsCacheKey = 'products';

  constructor(
    private firestore: Firestore,
    private inventoryService: ProductInventoryService,
    private priceService: ProductPriceService,
    private variantService: ProductVariantService,
    private imageService: ProductImageService,
    private cacheService: CacheService
  ) { }

  // -------------------- MÉTODOS DE CONSULTA --------------------

  /**
   * Obtiene todos los productos con caché optimizado
   */
  getProducts(): Observable<Product[]> {
    return this.cacheService.getCached<Product[]>(this.productsCacheKey, () => {
      const productsRef = collection(this.firestore, this.productsCollection);
      return collectionData(productsRef, { idField: 'id' }).pipe(
        map(data => data as Product[]),
        switchMap(products => this.enrichProductsWithRealTimeStock(products)),
        shareReplay(1), // Evitar múltiples ejecuciones
        catchError(error => ErrorUtil.handleError(error, 'getProducts'))
      );
    });
  }

  /**
 * Obtiene todos los productos SIN caché cuando se force
 */
  getProductsNoCache(): Observable<Product[]> {
    console.log('🔄 [PRODUCT SERVICE] Obteniendo productos SIN caché...');

    const productsRef = collection(this.firestore, this.productsCollection);
    return collectionData(productsRef, { idField: 'id' }).pipe(
      map(data => data as Product[]),
      switchMap(products => this.enrichProductsWithRealTimeStock(products)),
      tap(products => {
        console.log('✅ [PRODUCT SERVICE] Productos obtenidos sin caché:', products.length);
      }),
      catchError(error => ErrorUtil.handleError(error, 'getProductsNoCache'))
    );
  }

  /**
 * Obtiene un producto por ID SIN caché
 */
  getProductByIdNoCache(productId: string): Observable<Product | null> {
    if (!productId) {
      return of(null);
    }

    console.log(`🔄 [PRODUCT SERVICE] Obteniendo producto SIN caché: ${productId}`);

    return from((async () => {
      try {
        const productDoc = doc(this.firestore, this.productsCollection, productId);
        const productSnap = await getDoc(productDoc);

        if (!productSnap.exists()) {
          return null;
        }

        const product = {
          id: productSnap.id,
          ...productSnap.data()
        } as Product;

        // Enriquecer con stock en tiempo real
        const enrichedProduct = await firstValueFrom(
          this.enrichSingleProductWithRealTimeStock(product)
        );

        console.log(`✅ [PRODUCT SERVICE] Producto obtenido sin caché:`, {
          id: enrichedProduct.id,
          name: enrichedProduct.name,
          totalStock: enrichedProduct.totalStock
        });

        return enrichedProduct;
      } catch (error) {
        console.error(`❌ [PRODUCT SERVICE] Error al obtener producto ${productId}:`, error);
        throw error;
      }
    })()).pipe(
      catchError(error => ErrorUtil.handleError(error, `getProductByIdNoCache(${productId})`))
    );
  }

  /**
   * Fuerza la actualización de un producto específico
   */
  forceRefreshProduct(productId: string): Observable<Product | null> {
    console.log(`🔄 [PRODUCT SERVICE] Forzando actualización del producto: ${productId}`);

    // Invalidar TODOS los cachés relacionados con este producto
    this.cacheService.invalidateProductCache(productId);

    // Obtener producto fresco del servidor
    return this.getProductByIdNoCache(productId);
  }

  /**
   * Invalidación de caché mejorada con estrategias específicas
   */
  private invalidateProductCacheWithStrategy(strategy: CacheInvalidationStrategy): void {
    const { productId, categoryId, affectsAll, patterns } = strategy;

    console.log('🔄 [PRODUCT SERVICE] Invalidando caché con estrategia:', strategy);

    // 🧹 LIMPIEZA AGRESIVA
    if (affectsAll) {
      console.log('🧼 [PRODUCT SERVICE] Limpieza completa de caché...');
      this.cacheService.clearCache();
      return;
    }

    // Invalidar caché específico del producto
    if (productId) {
      this.cacheService.invalidateProductCache(productId);
    }

    // Invalidar cachés de categoría específica
    if (categoryId) {
      this.cacheService.invalidate(`${this.productsCacheKey}_category_${categoryId}`);
    }

    // Invalidar patrones específicos
    if (patterns) {
      patterns.forEach(pattern => {
        this.cacheService.invalidatePattern(`${this.productsCacheKey}_${pattern}`);
      });
    }

    // Siempre invalidar caché principal
    this.cacheService.invalidate(this.productsCacheKey);

    console.log('✅ [PRODUCT SERVICE] Caché invalidado correctamente');
  }

  /**
   * Método público para forzar recarga completa
   */
  forceReloadAllProducts(): Observable<Product[]> {
    console.log('🔄 [PRODUCT SERVICE] Forzando recarga completa de productos...');

    // Limpiar completamente el caché
    this.cacheService.clearCache();

    // Obtener productos frescos
    return this.getProductsNoCache();
  }

  /**
   * Verifica si un producto ha sido actualizado recientemente
   */
  verifyProductUpdated(productId: string, expectedChanges: Partial<Product>): Observable<boolean> {
    console.log(`🔍 [PRODUCT SERVICE] Verificando actualización del producto: ${productId}`);

    return this.forceRefreshProduct(productId).pipe(
      map(product => {
        if (!product) {
          console.warn(`⚠️ [PRODUCT SERVICE] Producto no encontrado: ${productId}`);
          return false;
        }

        // Verificar cambios esperados
        const hasExpectedChanges = Object.keys(expectedChanges).every(key => {
          const expectedValue = expectedChanges[key as keyof Product];
          const actualValue = product[key as keyof Product];

          const matches = expectedValue === actualValue;

          if (!matches) {
            console.log(`🔍 [PRODUCT SERVICE] Diferencia en ${key}:`, {
              expected: expectedValue,
              actual: actualValue
            });
          }

          return matches;
        });

        console.log(`${hasExpectedChanges ? '✅' : '❌'} [PRODUCT SERVICE] Verificación completada:`, {
          productId,
          hasExpectedChanges,
          productName: product.name
        });

        return hasExpectedChanges;
      }),
      catchError(error => {
        console.error(`❌ [PRODUCT SERVICE] Error en verificación:`, error);
        return of(false);
      })
    );
  }

  /**
   * Obtiene un producto por su ID
   */
  getProductById(productId: string): Observable<Product | null> {
    if (!productId) {
      return of(null);
    }

    const cacheKey = `${this.productsCacheKey}_${productId}`;

    return this.cacheService.getCached<Product | null>(cacheKey, () => {
      return from((async () => {
        try {
          const productDoc = doc(this.firestore, this.productsCollection, productId);
          const productSnap = await getDoc(productDoc);

          if (!productSnap.exists()) {
            return null;
          }

          const product = {
            id: productSnap.id,
            ...productSnap.data()
          } as Product;

          // Enriquecer con stock en tiempo real
          const enrichedProduct = await firstValueFrom(
            this.enrichSingleProductWithRealTimeStock(product)
          );

          // Registrar vista en segundo plano (sin esperar)
          this.incrementProductView(productId);

          return enrichedProduct;
        } catch (error) {
          console.error(`Error al obtener producto ${productId}:`, error);
          throw error;
        }
      })()).pipe(
        catchError(error => ErrorUtil.handleError(error, `getProductById(${productId})`))
      );
    });
  }

  // ==================== MÉTODOS PARA CALCULAR STOCK EN TIEMPO REAL ====================

  /**
   * Enriquece múltiples productos con stock calculado en tiempo real (OPTIMIZADO)
   */
  private enrichProductsWithRealTimeStock(products: Product[]): Observable<Product[]> {
    if (!products || products.length === 0) {
      return of([]);
    }

    // OPTIMIZACIÓN: Obtener todas las variantes en una sola operación
    const productIds = products.map(p => p.id);

    return this.getVariantsByProductIds(productIds).pipe(
      map(allVariants => {
        // Agrupar variantes por producto
        const variantsByProduct = new Map<string, ProductVariant[]>();
        allVariants.forEach(variant => {
          if (!variantsByProduct.has(variant.productId)) {
            variantsByProduct.set(variant.productId, []);
          }
          variantsByProduct.get(variant.productId)!.push(variant);
        });

        // Enriquecer cada producto
        const enrichedProducts = products.map(product => {
          const variants = variantsByProduct.get(product.id) || [];
          return this.enrichProductWithVariants(product, variants);
        });

        return enrichedProducts;
      }),
      catchError(error => {
        console.error('❌ [PRODUCT SERVICE] Error al enriquecer productos:', error);
        return of(products); // Retornar productos originales en caso de error
      })
    );
  }

  /**
   * Enriquece un solo producto con stock en tiempo real (UNIFICADO)
   */
  private enrichSingleProductWithRealTimeStock(product: Product): Observable<Product> {
    return this.inventoryService.getVariantsByProductId(product.id).pipe(
      map(variants => this.enrichProductWithVariants(product, variants)),
      catchError(error => {
        console.error(`❌ [PRODUCT SERVICE] Error al calcular stock para ${product.id}:`, error);
        return of(product);
      })
    );
  }

  /**
   * Método auxiliar para enriquecer un producto con sus variantes (CENTRALIZADO)
   */
  private enrichProductWithVariants(product: Product, variants: ProductVariant[]): Product {
    // Calcular stock total
    const totalStock = variants.reduce((total, variant) => total + (variant.stock || 0), 0);

    // Actualizar colores y tallas con stock de variantes
    const updatedColors = this.updateColorsWithVariantStock(product.colors, variants);
    const updatedSizes = this.updateSizesWithVariantStock(product.sizes, variants);

    return {
      ...product,
      totalStock,
      colors: updatedColors,
      sizes: updatedSizes,
      variants: variants
    };
  }

  /**
   * Obtiene variantes para múltiples productos (NUEVO - OPTIMIZACIÓN)
   */
  private getVariantsByProductIds(productIds: string[]): Observable<ProductVariant[]> {
    if (!productIds || productIds.length === 0) {
      return of([]);
    }

    // Usar el inventoryService para obtener todas las variantes
    // Si no existe este método, usar forkJoin como fallback
    const variantObservables = productIds.map(id =>
      this.inventoryService.getVariantsByProductId(id)
    );

    return forkJoin(variantObservables).pipe(
      map(variantArrays => variantArrays.flat()),
      catchError(error => {
        console.error('Error al obtener variantes múltiples:', error);
        return of([]);
      })
    );
  }

  /**
   * Actualiza colores con stock de variantes (MEJORADO)
   */
  private updateColorsWithVariantStock(colors: Color[], variants: ProductVariant[]): Color[] {
    if (!colors || !variants) return colors || [];

    return colors.map(color => {
      // Calcular stock total para este color
      const colorStock = variants
        .filter(variant => variant.colorName === color.name)
        .reduce((total, variant) => total + (variant.stock || 0), 0);

      return {
        ...color,
        stock: colorStock
      } as Color; // Asumir que Color tiene propiedad stock o extenderla
    });
  }

  /**
   * Actualiza tallas con stock de variantes (MEJORADO)
   */
  private updateSizesWithVariantStock(sizes: Size[], variants: ProductVariant[]): Size[] {
    if (!sizes || !variants) return sizes || [];

    return sizes.map(size => {
      // Calcular stock total para esta talla
      const sizeStock = variants
        .filter(variant => variant.sizeName === size.name)
        .reduce((total, variant) => total + (variant.stock || 0), 0);

      // Actualizar colorStocks con datos reales de variantes
      const colorStocks = variants
        .filter(variant => variant.sizeName === size.name && variant.stock > 0)
        .map(variant => ({
          colorName: variant.colorName,
          quantity: variant.stock || 0
        }));

      return {
        ...size,
        stock: sizeStock,
        colorStocks: colorStocks
      };
    });
  }

  /**
   * Obtiene producto completo con variantes, precios y promociones
   */
  getCompleteProduct(productId: string): Observable<Product | null> {
    if (!productId) {
      return of(null);
    }

    const cacheKey = `${this.productsCacheKey}_complete_${productId}`;

    return this.cacheService.getCached<Product | null>(cacheKey, () => {
      return this.getProductById(productId).pipe(
        switchMap(product => {
          if (!product) {
            return of(null);
          }

          // Obtener variantes del producto
          return this.getProductVariants(productId).pipe(
            switchMap(variants => {
              // Aplicar promociones y cálculo de precios
              return from(this.priceService.addPromotionsToProduct(product)).pipe(
                map(productWithPromotions => {
                  // Calcular precio con descuento
                  const productWithPricing = this.priceService.calculateDiscountedPrice(productWithPromotions);

                  // Agregar variantes
                  return {
                    ...productWithPricing,
                    variants
                  };
                })
              );
            })
          );
        }),
        catchError(error => ErrorUtil.handleError(error, `getCompleteProduct(${productId})`))
      );
    });
  }

  /**
   * Obtiene productos por categoría
   */
  getProductsByCategory(categoryId: string): Observable<Product[]> {
    if (!categoryId) {
      return of([]);
    }

    const cacheKey = `${this.productsCacheKey}_category_${categoryId}`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {
      const productsRef = collection(this.firestore, this.productsCollection);
      const q = query(productsRef, where('category', '==', categoryId));

      return collectionData(q, { idField: 'id' }).pipe(
        map(products => products as Product[]),
        switchMap(products => this.enrichProductsWithRealTimeStock(products)),
        switchMap(products => this.priceService.calculateDiscountedPrices(products)),
        catchError(error => ErrorUtil.handleError(error, `getProductsByCategory(${categoryId})`))
      );
    });
  }

  /**
   * Obtiene productos destacados
   */
  getFeaturedProducts(limit: number = 8): Observable<Product[]> {
    const cacheKey = `${this.productsCacheKey}_featured_${limit}`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {
      const productsRef = collection(this.firestore, this.productsCollection);
      const q = query(productsRef, where('isFeatured', '==', true));

      return collectionData(q, { idField: 'id' }).pipe(
        map(products => (products as Product[]).slice(0, limit)),
        switchMap(products => this.enrichProductsWithRealTimeStock(products)),
        switchMap(products => this.priceService.calculateDiscountedPrices(products)),
        catchError(error => ErrorUtil.handleError(error, 'getFeaturedProducts'))
      );
    });
  }

  /**
   * Obtiene productos más vendidos
   */
  getBestSellingProducts(limit: number = 8): Observable<Product[]> {
    const cacheKey = `${this.productsCacheKey}_bestselling_${limit}`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {
      const productsRef = collection(this.firestore, this.productsCollection);
      const q = query(productsRef, where('isBestSeller', '==', true));

      return collectionData(q, { idField: 'id' }).pipe(
        map(products => (products as Product[]).slice(0, limit)),
        switchMap(products => this.enrichProductsWithRealTimeStock(products)),
        switchMap(products => this.priceService.calculateDiscountedPrices(products)),
        catchError(error => ErrorUtil.handleError(error, 'getBestSellingProducts'))
      );
    });
  }

  /**
   * Obtiene productos nuevos
   */
  getNewProducts(limit: number = 8): Observable<Product[]> {
    const cacheKey = `${this.productsCacheKey}_new_${limit}`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {
      const productsRef = collection(this.firestore, this.productsCollection);
      const q = query(productsRef, where('isNew', '==', true));

      return collectionData(q, { idField: 'id' }).pipe(
        map(products => (products as Product[]).slice(0, limit)),
        switchMap(products => this.enrichProductsWithRealTimeStock(products)),
        switchMap(products => this.priceService.calculateDiscountedPrices(products)),
        catchError(error => ErrorUtil.handleError(error, 'getNewProducts'))
      );
    });
  }

  /**
   * Obtiene los productos en oferta
   */
  getDiscountedProducts(limit: number = 8): Observable<Product[]> {
    const cacheKey = `${this.productsCacheKey}_discounted_${limit}`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {
      return this.getProducts().pipe(
        switchMap(products => this.priceService.calculateDiscountedPrices(products)),
        map(products => products.filter(product =>
          (product.discountPercentage && product.discountPercentage > 0) ||
          product.activePromotion
        )),
        map(discountedProducts => discountedProducts.slice(0, limit)),
        catchError(error => ErrorUtil.handleError(error, 'getDiscountedProducts'))
      );
    });
  }

  /**
   * Busca productos por texto
   */
  searchProducts(searchTerm: string): Observable<Product[]> {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return of([]);
    }

    const term = searchTerm.toLowerCase().trim();

    return this.getProducts().pipe(
      map(products => {
        return products.filter(product => {
          return (
            (product.name && product.name.toLowerCase().includes(term)) ||
            (product.description && product.description.toLowerCase().includes(term)) ||
            (product.sku && product.sku.toLowerCase().includes(term)) ||
            (product.tags && product.tags.some(tag => tag.toLowerCase().includes(term)))
          );
        });
      }),
      switchMap(filteredProducts => this.priceService.calculateDiscountedPrices(filteredProducts)),
      catchError(error => ErrorUtil.handleError(error, `searchProducts(${searchTerm})`))
    );
  }

  /**
   * Obtiene variantes de un producto
   */
  getProductVariants(productId: string): Observable<ProductVariant[]> {
    return this.inventoryService.getVariantsByProductId(productId);
  }

  /**
   * Obtiene una variante específica
   */
  getVariantById(variantId: string): Observable<ProductVariant | undefined> {
    return this.inventoryService.getVariantById(variantId);
  }

  /**
   * Obtiene productos relacionados (misma categoría)
   */
  getRelatedProducts(product: Product, limit: number = 4): Observable<Product[]> {
    if (!product || !product.category) {
      return of([]);
    }

    const cacheKey = `${this.productsCacheKey}_related_${product.id}_${limit}`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {
      return this.getProductsByCategory(product.category).pipe(
        map(products => {
          const filtered = products.filter(p => p.id !== product.id);
          return filtered.slice(0, limit);
        }),
        catchError(error => ErrorUtil.handleError(error, `getRelatedProducts(${product.id})`))
      );
    });
  }

  // -------------------- MÉTODOS DE ACTUALIZACIÓN --------------------

  /**
   * Crea un nuevo producto completo con variantes (CORREGIDO)
   */
  createProduct(
    productData: Omit<Product, 'id'>,
    colors: Color[],
    sizes: Size[],
    mainImage: File,
    colorImages?: Map<string, File>,
    sizeImages?: Map<string, File>,
    variantImages?: Map<string, File>,
    additionalImages?: File[]
  ): Observable<string> {
    const productId = uuidv4();

    // 🧹 INVALIDAR CACHÉ ANTES DE CREAR
    console.log(`🧹 [PRODUCT SERVICE] Invalidando caché antes de crear producto`);
    this.cacheService.clearCache();

    return from(this.createProductInternal(
      productId, productData, colors, sizes, mainImage,
      colorImages, sizeImages, variantImages, additionalImages
    )).pipe(
      tap(() => {
        // 🧹 INVALIDAR CACHÉ DESPUÉS DE CREAR
        console.log(`🧹 [PRODUCT SERVICE] Invalidando caché después de crear: ${productId}`);
        this.cacheService.clearCache(); // Limpieza completa para nuevos productos
      }),
      catchError(error => {
        console.error('💥 Error al crear producto:', error);
        // Cleanup asíncrono para no bloquear la respuesta
        this.cleanupFailedProduct(productId).catch(cleanupError =>
          console.error('Error en limpieza:', cleanupError)
        );
        return throwError(() => new Error(`Error al crear producto: ${error.message}`));
      })
    );
  }


  /**
   * Lógica interna de creación de producto (SEPARADA para mejor manejo de errores)
   */
  private async createProductInternal(
    productId: string,
    productData: Omit<Product, 'id'>,
    colors: Color[],
    sizes: Size[],
    mainImage: File,
    colorImages?: Map<string, File>,
    sizeImages?: Map<string, File>,
    variantImages?: Map<string, File>,
    additionalImages?: File[]
  ): Promise<string> {
    try {
      console.log('🚀 [PRODUCT SERVICE] Iniciando creación de producto:', productId);

      // Validar datos antes de proceder
      this.validateProductData({ ...productData, colors, sizes });

      // 1. Subir imagen principal
      console.log('📤 Subiendo imagen principal...');
      const imageUrl = await this.imageService.uploadProductImage(productId, mainImage);
      console.log('✅ Imagen principal subida:', imageUrl);

      // 2. Subir imágenes adicionales si existen
      let additionalImageUrls: string[] = [];
      if (additionalImages && additionalImages.length > 0) {
        console.log('📤 Subiendo imágenes adicionales...');
        additionalImageUrls = await this.imageService.uploadAdditionalImages(productId, additionalImages);
        console.log('✅ Imágenes adicionales subidas:', additionalImageUrls.length);
      }

      // 3. Procesar imágenes de colores y tallas
      console.log('🎨 Procesando imágenes de colores y tallas...');
      const { colors: updatedColors, sizes: updatedSizes } =
        await this.variantService.processProductImages(
          productId,
          colors,
          sizes,
          colorImages,
          sizeImages
        );

      console.log('✅ Colores actualizados:', updatedColors.map(c => ({
        name: c.name,
        imageUrl: c.imageUrl
      })));

      // 4. Crear datos base del producto
      const productBaseData = {
        ...productData,
        imageUrl,
        additionalImages: additionalImageUrls,
        colors: updatedColors,
        sizes: updatedSizes,
        totalStock: 0, // Se actualizará en createProductVariants
        popularityScore: 0,
        views: 0,
        sales: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // 5. Crear el producto base
      console.log('💾 Creando producto base...');
      await this.variantService.createProductBase(productId, productBaseData);

      // 6. Crear variantes del producto
      console.log('🔧 Creando variantes...');
      await this.variantService.createProductVariants(
        productId,
        updatedColors,
        updatedSizes,
        variantImages,
        productData.sku
      );

      console.log('🎉 Producto creado exitosamente:', productId);
      return productId;
    } catch (error) {
      console.error('💥 Error en createProductInternal:', error);
      throw error;
    }
  }

  /**
   * Actualiza un producto existente (CORREGIDO)
   */
  updateProduct(
    productId: string,
    productData: Partial<Product>,
    mainImage?: File,
    additionalImages?: File[],
    colorImages?: Map<string, File>,
    sizeImages?: Map<string, File>,
    variantImages?: Map<string, File>
  ): Observable<void> {
    if (!productId) {
      return throwError(() => new Error('ID de producto no proporcionado'));
    }

    // 🧹 INVALIDAR CACHÉ INMEDIATAMENTE ANTES DE LA OPERACIÓN
    console.log(`🧹 [PRODUCT SERVICE] Invalidando caché antes de actualizar: ${productId}`);
    this.invalidateProductCacheWithStrategy({
      productId,
      categoryId: productData.category,
      patterns: ['featured', 'new', 'bestselling', 'discounted']
    });

    return from(this.updateProductInternal(
      productId, productData, mainImage, additionalImages,
      colorImages, sizeImages, variantImages
    )).pipe(
      tap(() => {
        // 🧹 INVALIDAR CACHÉ NUEVAMENTE DESPUÉS DE LA OPERACIÓN
        console.log(`🧹 [PRODUCT SERVICE] Invalidando caché después de actualizar: ${productId}`);
        this.invalidateProductCacheWithStrategy({
          productId,
          categoryId: productData.category,
          patterns: ['featured', 'new', 'bestselling', 'discounted']
        });
      }),
      catchError(error => ErrorUtil.handleError(error, `updateProduct(${productId})`))
    );
  }

  /**
   * Lógica interna de actualización de producto (CORREGIDA)
   */
  private async updateProductInternal(
    productId: string,
    productData: Partial<Product>,
    mainImage?: File,
    additionalImages?: File[],
    colorImages?: Map<string, File>,
    sizeImages?: Map<string, File>,
    variantImages?: Map<string, File>
  ): Promise<void> {
    console.log('🔄 [PRODUCT SERVICE] Iniciando actualización de producto:', productId);

    const updateData: any = {
      ...productData,
      updatedAt: new Date()
    };

    // Validar datos antes de proceder
    this.validateProductData(updateData);

    // Procesar imagen principal
    if (mainImage) {
      console.log('📤 Subiendo nueva imagen principal...');
      const currentProduct = await firstValueFrom(this.getProductById(productId).pipe(take(1)));

      if (currentProduct?.imageUrl) {
        await this.imageService.deleteImageIfExists(currentProduct.imageUrl);
      }

      const imageUrl = await this.imageService.uploadProductImage(productId, mainImage);
      updateData.imageUrl = imageUrl;
      console.log('✅ Nueva imagen principal subida:', imageUrl);
    }

    // Procesar imágenes adicionales
    if (additionalImages && additionalImages.length > 0) {
      console.log('📤 Subiendo imágenes adicionales...');
      const additionalImageUrls = await this.imageService.uploadAdditionalImages(productId, additionalImages);

      const existingAdditionalImages = productData.additionalImages || [];
      updateData.additionalImages = [...existingAdditionalImages, ...additionalImageUrls];
      console.log('✅ Imágenes adicionales procesadas:', additionalImageUrls.length);
    }

    // Procesar imágenes de colores y tallas
    if ((colorImages && colorImages.size > 0) || (sizeImages && sizeImages.size > 0)) {
      console.log('🎨 Procesando imágenes de colores y tallas en actualización...');

      const colorsToProcess = updateData.colors || productData.colors || [];
      const sizesToProcess = updateData.sizes || productData.sizes || [];

      const { colors: updatedColors, sizes: updatedSizes } =
        await this.variantService.processProductImages(
          productId,
          colorsToProcess,
          sizesToProcess,
          colorImages,
          sizeImages
        );

      updateData.colors = updatedColors;
      updateData.sizes = updatedSizes;

      console.log('✅ Colores actualizados en updateProduct:', updatedColors.map(c => ({
        name: c.name,
        imageUrl: c.imageUrl
      })));
    }

    // Procesar imágenes de variantes
    if (variantImages && variantImages.size > 0) {
      await this.updateVariantImages(productId, variantImages);
    }

    // Actualizar variantes y recalcular stock si hay cambios en colores/tallas
    if (updateData.colors && updateData.sizes) {
      console.log('🔄 Actualizando variantes y recalculando stock...');
      const calculatedTotalStock = await this.updateProductVariantsWithStockCalculation(
        productId,
        updateData.colors,
        updateData.sizes
      );

      updateData.totalStock = calculatedTotalStock;
      console.log('✅ Stock total recalculado:', calculatedTotalStock);
    }

    // Actualizar datos del producto
    console.log('💾 Actualizando datos del producto...');
    await this.variantService.updateProductBase(productId, updateData);

    console.log('🎉 Producto actualizado exitosamente:', productId);
  }

  /**
   * Actualiza imágenes de variantes (NUEVO MÉTODO)
   */
  private async updateVariantImages(
    productId: string,
    variantImages: Map<string, File>
  ): Promise<void> {
    console.log('🎯 Procesando imágenes de variantes en actualización...');

    const existingVariants = await firstValueFrom(this.getProductVariants(productId).pipe(take(1)));

    if (existingVariants) {
      for (const [variantKey, imageFile] of variantImages.entries()) {
        const [colorName, sizeName] = variantKey.split('-');
        const variant = existingVariants.find(v =>
          v.colorName === colorName && v.sizeName === sizeName
        );

        if (variant) {
          try {
            const variantImageUrl = await this.imageService.uploadVariantImage(
              productId,
              variant.id,
              imageFile
            );

            await this.variantService.updateVariantImage(variant.id, variantImageUrl);
            console.log(`✅ Imagen de variante actualizada: ${variantKey} -> ${variantImageUrl}`);
          } catch (error) {
            console.error(`❌ Error al actualizar imagen de variante ${variantKey}:`, error);
          }
        }
      }
    }
  }

  /**
   * Actualiza variantes y calcula el stock total (CORREGIDO)
   */
  private async updateProductVariantsWithStockCalculation(
    productId: string,
    colors: Color[],
    sizes: Size[]
  ): Promise<number> {
    try {
      console.log('🔄 Actualizando variantes para producto:', productId);

      const existingVariants = await firstValueFrom(this.getProductVariants(productId));
      const batch = writeBatch(this.firestore);

      const variantMap = new Map<string, ProductVariant>();
      existingVariants.forEach(v => {
        const key = `${v.colorName}-${v.sizeName}`;
        variantMap.set(key, v);
      });

      let totalStock = 0;

      // Recorrer combinaciones de colores y tallas
      for (const color of colors) {
        for (const size of sizes) {
          const stockEntry = size.colorStocks?.find(cs => cs.colorName === color.name);
          const stock = stockEntry?.quantity || 0;
          totalStock += stock;

          const key = `${color.name}-${size.name}`;

          if (variantMap.has(key)) {
            // Actualizar variante existente
            const variant = variantMap.get(key)!;
            const variantRef = doc(this.firestore, 'productVariants', variant.id);

            batch.update(variantRef, {
              stock,
              colorCode: color.code,
              updatedAt: new Date()
            });

            console.log(`🔄 Actualizando variante existente: ${key}, stock: ${stock}`);
            variantMap.delete(key);
          } else if (stock > 0) {
            // Crear nueva variante si tiene stock
            const variantId = uuidv4();
            const variantRef = doc(this.firestore, 'productVariants', variantId);

            const newVariant = {
              id: variantId,
              productId,
              colorName: color.name,
              colorCode: color.code,
              sizeName: size.name,
              stock,
              sku: `${productId}-${color.name}-${size.name}`.toUpperCase(),
              imageUrl: color.imageUrl || '',
              createdAt: new Date(),
              updatedAt: new Date()
            };

            batch.set(variantRef, newVariant);
            console.log(`➕ Creando nueva variante: ${key}, stock: ${stock}`);
          }
        }
      }

      // Eliminar variantes obsoletas
      variantMap.forEach(variant => {
        const variantRef = doc(this.firestore, 'productVariants', variant.id);
        batch.delete(variantRef);
        console.log(`🗑️ Eliminando variante obsoleta: ${variant.colorName}-${variant.sizeName}`);
      });

      // CORRECCIÓN CRÍTICA: Actualizar el stock total en el producto
      const productRef = doc(this.firestore, this.productsCollection, productId);
      batch.update(productRef, {
        totalStock,
        updatedAt: new Date()
      });

      // Ejecutar todas las operaciones en una sola transacción
      await batch.commit();

      console.log(`✅ Variantes y producto actualizados. Stock total: ${totalStock}`);
      return totalStock;
    } catch (error) {
      console.error(`💥 Error al actualizar variantes del producto ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Elimina un producto y todos sus recursos asociados
   */
  deleteProduct(productId: string): Observable<void> {
    if (!productId) {
      return throwError(() => new Error('ID de producto no proporcionado'));
    }

    return from((async () => {
      // 1. Obtener datos del producto para eliminar imágenes
      const product = await firstValueFrom(this.getProductById(productId).pipe(take(1)));

      if (!product) {
        throw new Error(`Producto con ID ${productId} no encontrado`);
      }

      // 2. Obtener variantes para eliminar imágenes de variantes
      const variants = await firstValueFrom(this.getProductVariants(productId).pipe(take(1)));

      // 3. Recopilar todas las URLs de imágenes a eliminar
      const imageUrls: string[] = [];

      if (product.imageUrl) {
        imageUrls.push(product.imageUrl);
      }

      if (product.additionalImages) {
        imageUrls.push(...product.additionalImages);
      }

      variants.forEach(variant => {
        if (variant.imageUrl) {
          imageUrls.push(variant.imageUrl);
        }
      });

      // 4. Eliminar variantes
      await this.variantService.deleteProductVariants(productId);

      // 5. Eliminar el producto
      await this.variantService.deleteProduct(productId);

      // 6. Eliminar imágenes
      await this.imageService.deleteProductImages(productId, imageUrls);

      // 7. Invalidar caché
      this.invalidateProductCacheWithStrategy({
        productId,
        categoryId: product.category,
        affectsAll: true
      });
    })()).pipe(
      catchError(error => ErrorUtil.handleError(error, `deleteProduct(${productId})`))
    );
  }

  /**
   * Registra una venta
   */
  registerSale(productId: string, items: SaleItem[]): Observable<void> {
    return this.inventoryService.registerSale(productId, items).pipe(
      tap(() => this.invalidateProductCacheWithStrategy({ productId }))
    );
  }

  /**
   * Actualiza inventario
   */
  updateStock(update: StockUpdate): Observable<void> {
    return this.inventoryService.updateStock(update).pipe(
      tap(() => this.invalidateProductCacheWithStrategy({ productId: update.productId }))
    );
  }

  /**
   * Actualiza inventario en lote
   */
  updateStockBatch(updates: StockUpdate[]): Observable<void> {
    return this.inventoryService.updateStockBatch(updates).pipe(
      tap(() => {
        // Invalidar caché de productos afectados
        const productIds = new Set<string>();
        updates.forEach(update => {
          if (update.productId) {
            productIds.add(update.productId);
          }
        });

        // Invalidación optimizada
        this.invalidateProductCacheWithStrategy({
          affectsAll: true,
          patterns: ['featured', 'new', 'bestselling', 'discounted']
        });

        productIds.forEach(id => {
          this.invalidateProductCacheWithStrategy({ productId: id });
        });
      })
    );
  }

  /**
   * Transfiere stock entre variantes
   */
  transferStock(transfer: StockTransfer): Observable<void> {
    return this.inventoryService.transferStock(transfer).pipe(
      tap(() => {
        // Invalidar caché general ya que no conocemos los productIds específicos
        this.invalidateProductCacheWithStrategy({ affectsAll: true });
      }),
      catchError(error => ErrorUtil.handleError(error, 'transferStock'))
    );
  }

  /**
   * Incrementa contador de vistas (privado, uso interno)
   */
  private incrementProductView(productId: string): void {
    this.inventoryService.incrementProductViews(productId).subscribe({
      error: error => console.error(`Error al actualizar vistas del producto ${productId}:`, error)
    });
  }

  // -------------------- MÉTODOS DE INFORMES --------------------

  /**
   * Obtiene resumen de inventario
   */
  getInventorySummary(): Observable<InventorySummary> {
    return this.inventoryService.getInventorySummary();
  }

  /**
   * Obtiene productos con stock bajo
   */
  getLowStockProducts(threshold?: number): Observable<LowStockProduct[]> {
    return this.inventoryService.getLowStockProducts(threshold);
  }

  /**
   * Obtiene variantes sin stock
   */
  getOutOfStockVariants(): Observable<ProductVariant[]> {
    return this.inventoryService.getOutOfStockVariants();
  }

  /**
   * Verifica disponibilidad de stock para compra
   */
  checkVariantsAvailability(items: SaleItem[]): Observable<{
    available: boolean;
    unavailableItems: {
      variantId: string;
      requested: number;
      available: number;
    }[];
  }> {
    return this.inventoryService.checkVariantsAvailability(items);
  }

  // -------------------- MÉTODOS DE UTILIDAD --------------------

  /**
   * Valida datos del producto antes de crear/actualizar (NUEVO)
   */
  private validateProductData(productData: Partial<Product>): void {
    const errors: string[] = [];

    // Validar estructura básica
    if (productData.name && productData.name.trim().length === 0) {
      errors.push('El nombre del producto no puede estar vacío');
    }

    if (productData.price && productData.price <= 0) {
      errors.push('El precio debe ser mayor a 0');
    }

    if (productData.colors && productData.sizes) {
      // Validar que todas las combinaciones de colorStocks existan
      productData.sizes.forEach(size => {
        if (size.colorStocks) {
          size.colorStocks.forEach(colorStock => {
            const colorExists = productData.colors!.some(c => c.name === colorStock.colorName);
            if (!colorExists) {
              errors.push(`Color '${colorStock.colorName}' en colorStocks no existe en la lista de colores`);
            }

            if (colorStock.quantity < 0) {
              errors.push(`La cantidad para color '${colorStock.colorName}' no puede ser negativa`);
            }
          });
        }
      });

      // Validar códigos de color únicos
      const colorCodes = productData.colors.map(c => c.code).filter(Boolean);
      const uniqueColorCodes = new Set(colorCodes);
      if (colorCodes.length !== uniqueColorCodes.size) {
        errors.push('Los códigos de color deben ser únicos');
      }

      // Validar nombres de color únicos
      const colorNames = productData.colors.map(c => c.name);
      const uniqueColorNames = new Set(colorNames);
      if (colorNames.length !== uniqueColorNames.size) {
        errors.push('Los nombres de color deben ser únicos');
      }

      // Validar nombres de talla únicos
      const sizeNames = productData.sizes.map(s => s.name);
      const uniqueSizeNames = new Set(sizeNames);
      if (sizeNames.length !== uniqueSizeNames.size) {
        errors.push('Los nombres de talla deben ser únicos');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Errores de validación: ${errors.join(', ')}`);
    }
  }

  /**
   * Limpia recursos parciales si la creación de un producto falla
   */
  private async cleanupFailedProduct(productId: string): Promise<void> {
    try {
      console.log(`🧹 Iniciando limpieza para producto fallido ${productId}`);

      // Intentar eliminar documento del producto si existe
      const productDoc = doc(this.firestore, this.productsCollection, productId);
      const productSnap = await getDoc(productDoc);

      if (productSnap.exists()) {
        await deleteDoc(productDoc);
        console.log(`✅ Documento de producto eliminado: ${productId}`);
      }

      // Eliminar variantes si existen
      await this.variantService.deleteProductVariants(productId);
      console.log(`✅ Variantes eliminadas para producto: ${productId}`);

      // Eliminar imágenes (esto elimina todo el directorio del producto)
      await this.imageService.deleteProductImages(productId, []);
      console.log(`✅ Imágenes eliminadas para producto: ${productId}`);

      console.log(`🎉 Limpieza exitosa para producto fallido ${productId}`);
    } catch (error) {
      console.error(`❌ Error durante limpieza de producto fallido ${productId}:`, error);
    }
  }

  /**
   * Método de compatibilidad con la implementación anterior (DEPRECATED)
   * @deprecated Usar invalidateProductCacheWithStrategy en su lugar
   */
  private invalidateProductCache(productId?: string): void {
    console.warn('⚠️ Método invalidateProductCache está deprecado, usar invalidateProductCacheWithStrategy');

    this.invalidateProductCacheWithStrategy({
      productId,
      affectsAll: !productId,
      patterns: ['featured', 'bestselling', 'new', 'discounted']
    });
  }
}