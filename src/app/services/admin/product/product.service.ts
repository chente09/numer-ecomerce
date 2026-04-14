import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, getDoc, where, query, deleteDoc, getDocs,
  writeBatch, Timestamp,
  increment,
  updateDoc, FieldValue // Importar FieldValue
} from '@angular/fire/firestore';

import { Observable, from, of, forkJoin, throwError, firstValueFrom } from 'rxjs';
import { map, catchError, switchMap, tap, take, shareReplay, finalize } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

// Servicios de productos
import { ProductInventoryService, StockTransfer, StockUpdate, LowStockProduct, InventorySummary, InventoryMovement } from '../inventario/product-inventory.service'; // Importar InventoryMovement
import { ProductPriceService } from '../price/product-price.service';
import { ProductVariantService } from '../productVariante/product-variant.service';
import { ProductImageService } from '../image/product-image.service';
import { ActivityLogService } from '../activityLog/activity-log.service';

// Utilidades
import { ErrorUtil } from '../../../utils/error-util';
import { CacheService } from '../cache/cache.service';

// Modelos
import { Product, ProductVariant, Color, Size, Review, Promotion, SaleItem } from '../../../models/models'; // Importar SaleItem
import { Auth, signInAnonymously } from '@angular/fire/auth';

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
  private firestore = inject(Firestore);
  private productsCollection = 'products';
  private readonly productsCacheKey = 'products';
  private viewedInSession = new Set<string>();

  constructor(
    private inventoryService: ProductInventoryService,
    private priceService: ProductPriceService,
    private variantService: ProductVariantService,
    private imageService: ProductImageService,
    private cacheService: CacheService,
    private activityLogService: ActivityLogService
  ) {
  }


  // -------------------- MÉTODOS DE CONSULTA --------------------

  /**
   * 🚀 CORREGIDO: Obtiene todos los productos con caché optimizado
   */
  getProducts(): Observable<Product[]> {
    return this.cacheService.getCached<Product[]>(this.productsCacheKey, () => {
      const productsRef = collection(this.firestore, this.productsCollection);
      return collectionData(productsRef, { idField: 'id' }).pipe(
        take(1), // ✅ CRÍTICO: Forzar completar
        map(data => data as Product[]),
        switchMap(products => this.enrichProductsWithRealTimeStock(products)),
        catchError(error => {
          console.error('❌ ProductService: Error en getProducts:', error);
          return ErrorUtil.handleError(error, 'getProducts');
        }),
        shareReplay({ bufferSize: 1, refCount: false }) // ✅ refCount: false
      );
    });
  }

  // ✅ AGREGAR en ProductService
  forceReloadProducts(): Observable<Product[]> {
    // Invalidar caché para otras partes de la app
    this.cacheService.invalidate(this.productsCacheKey);

    // ✅ Usar internamente el método que no usa caché
    return this.getProductsNoCache().pipe(
      tap(products => {
        // Opcional: Actualizar el caché con los datos frescos para que
        // otras partes de la app (ej. la tienda pública) se beneficien,
        // pero la carga inicial siempre será fresca.
        this.cacheService.getCached(this.productsCacheKey, () => of(products));
      }),
      catchError(error => ErrorUtil.handleError(error, 'forceReloadProducts'))
    );
  }


  /**
   * 🚀 OBTIENE TODOS LOS PRODUCTOS SIN CACHÉ (VERSIÓN FINAL Y CORREGIDA)
   * Obtiene todos los productos directamente desde Firestore y los enriquece
   * con los datos completos de sus variantes para asegurar que la UI
   * siempre muestre la información de promociones correctamente.
   */
  getProductsNoCache(): Observable<Product[]> {
    const productsRef = collection(this.firestore, this.productsCollection);
    return from(getDocs(productsRef)).pipe(
      map(querySnapshot => querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product))),
      switchMap(products => this.enrichProductsWithRealTimeStock(products)),
      // ✅ PASO CLAVE Y CONSISTENTE: Siempre calcular precios antes de devolver.
      switchMap(enrichedProducts => this.priceService.calculateDiscountedPrices(enrichedProducts)),
      catchError(error => {
        console.error('❌ Error en getProductsNoCache:', error);
        return throwError(() => new Error('Error al obtener los productos sin caché.'));
      })
    );
  }

  /**
   * 🚀 CORREGIDO: Obtiene un producto por ID SIN caché
   */
  getProductByIdNoCache(productId: string): Observable<Product | null> {
    if (!productId) return of(null);
    const productDoc = doc(this.firestore, this.productsCollection, productId);
    return from(getDoc(productDoc)).pipe(
      switchMap(productSnap => {
        if (!productSnap.exists()) return of(null);
        const product = { id: productSnap.id, ...productSnap.data() } as Product;
        return this.enrichSingleProductWithRealTimeStock(product);
      }),
      // ✅ PASO CLAVE Y CONSISTENTE: Calcular precio para el producto individual.
      switchMap(enrichedProduct => {
        if (!enrichedProduct) return of(null);
        // Usamos la versión singular del servicio de precios
        const pricedProduct = this.priceService.calculateDiscountedPrice(enrichedProduct);
        return of(pricedProduct);
      }),
      catchError(error => {
        console.error(`❌ Error al obtener producto ${productId}:`, error);
        throw error;
      })
    );
  }

  /**
   * Fuerza la actualización de un producto específico
   */
  forceRefreshProduct(productId: string): Observable<Product | null> {
    this.cacheService.invalidateProductCache(productId);
    this.inventoryService.invalidateVariantCache(productId);
    // Ahora simplemente llama a getProductByIdNoCache, que ya hace todo el trabajo.
    return this.getProductByIdNoCache(productId);
  }

  /**
   * Invalidación de caché mejorada con estrategias específicas
   */
  private invalidateProductCacheWithStrategy(strategy: CacheInvalidationStrategy): void {
    const { productId, categoryId, affectsAll, patterns } = strategy;

    // 🧹 LIMPIEZA AGRESIVA
    if (affectsAll) {
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

  }

  /**
   * Método público para forzar recarga completa
   */
  forceReloadAllProducts(): Observable<Product[]> {

    // Limpiar completamente el caché
    this.cacheService.clearCache();

    // Obtener productos frescos
    return this.getProductsNoCache();
  }

  /**
   * Verifica si un producto ha sido actualizado recientemente
   */
  verifyProductUpdated(productId: string, expectedChanges: Partial<Product>): Observable<boolean> {

    return this.forceRefreshProduct(productId).pipe(
      map(product => {
        if (!product) {
          return false;
        }

        // Verificar cambios esperados
        const hasExpectedChanges = Object.keys(expectedChanges).every(key => {
          const expectedValue = expectedChanges[key as keyof Product];
          const actualValue = product[key as keyof Product];

          const matches = expectedValue === actualValue;

          return matches;
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
   * 🚀 CORREGIDO: Obtiene un producto por su ID
   */
  getProductById(productId: string): Observable<Product | null> {
    if (!productId) {
      return of(null);
    }

    // ✅ CAMBIO: Eliminar cache para datos frescos siempre
    const productDoc = doc(this.firestore, this.productsCollection, productId);

    return from(getDoc(productDoc)).pipe(
      take(1),
      map(productSnap => {
        if (!productSnap.exists()) {
          return null;
        }

        const productData = productSnap.data();
        const product = { id: productSnap.id, ...productData } as Product;
        return product;
      }),
      switchMap(product => {
        if (!product) return of(null);

        return this.enrichSingleProductWithRealTimeStock(product).pipe(
          switchMap(enrichedProduct =>
            from(this.trackProductView(productId, enrichedProduct?.name)).pipe(
              catchError(viewError => {
                console.warn('Vista no registrada:', viewError);
                return of(null);
              }),
              map(() => enrichedProduct)
            )
          )
        );
      }),
      catchError(error =>
        ErrorUtil.handleError(error, `getProductById(${productId})`)
      )
    );
  }

  /**
* 👁️ Registra vista de producto (NUEVO MÉTODO)
*/
  private async trackProductView(productId: string, productName?: string): Promise<void> {
    try {
      // Throttling mejorado
      const viewKey = `view_${productId}`;
      const lastView = this.viewedInSession.has(productId);

      if (lastView) {
        return; // Ya visto en esta sesión
      }

      this.viewedInSession.add(productId);

      // 1. Incrementar contador en el producto
      await firstValueFrom(
        this.inventoryService.incrementProductViews(productId).pipe(take(1))
      );

      // 2. ✅ NUEVO: Registrar en user_activity_logs
      await this.activityLogService.logProductView(productId, productName);

    } catch (error) {
      console.warn('❌ Error registrando vista:', error);
    }
  }


  // ==================== MÉTODOS PARA CALCULAR STOCK EN TIEMPO REAL ====================

  /**
   * 🚀 CORREGIDO: Enriquece múltiples productos con stock calculado en tiempo real (OPTIMIZADO)
   */

  private enrichProductsWithRealTimeStock(products: Product[]): Observable<Product[]> {
    if (!products || products.length === 0) {
      return of([]);
    }

    const productIds = products.map(p => p.id);

    return this.getVariantsByProductIds(productIds).pipe(
      take(1),
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
          const enriched = this.enrichProductWithVariants(product, variants);


          return enriched;
        });

        return enrichedProducts;
      }),
      catchError(error => {
        console.error('❌ [PRODUCT SERVICE] Error al enriquecer productos:', error);
        return of(products);
      })
    );
  }

  /**
   * 🚀 CORREGIDO: Enriquece un solo producto con stock en tiempo real (UNIFICADO)
   */
  private enrichSingleProductWithRealTimeStock(product: Product): Observable<Product> {
    return this.inventoryService.getVariantsByProductId(product.id).pipe(
      take(1), // ✅ NUEVO: Forzar completar
      map(variants => {
        return this.enrichProductWithVariants(product, variants);
      }),
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

    const enrichedProduct = {
      ...product,
      totalStock,
      colors: updatedColors,
      sizes: updatedSizes,
      variants: variants // ✅ CRÍTICO: Asignar array de objetos, NO IDs
    };

    return enrichedProduct;
  }

  /**
   * 🚀 CORREGIDO: Obtiene variantes para múltiples productos (NUEVO - OPTIMIZACIÓN)
   */
  private getVariantsByProductIds(productIds: string[]): Observable<ProductVariant[]> {
    if (!productIds || productIds.length === 0) {
      return of([]);
    }

    // ✅ VALIDAR IDs antes de procesar
    const validIds = productIds.filter(id => id && id.trim().length > 0);
    if (validIds.length === 0) {
      console.warn('No hay IDs válidos para obtener variantes');
      return of([]);
    }

    const variantObservables = validIds.map(id =>
      this.inventoryService.getVariantsByProductId(id).pipe(
        take(1),
        catchError(error => {
          console.warn(`Error obteniendo variantes para producto ${id}:`, error);
          return of([]);
        })
      )
    );

    return forkJoin(variantObservables).pipe(
      map(variantArrays => {
        const allVariants = variantArrays.flat();
        return allVariants;
      }),
      catchError(error => {
        console.error('❌ Error al obtener variantes múltiples:', error);
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
   * 🚀 CORREGIDO: Obtiene producto completo con variantes, precios y promociones
   */
  getCompleteProduct(productId: string): Observable<Product | null> {
    if (!productId) {
      return of(null);
    }

    const cacheKey = `${this.productsCacheKey}_complete_${productId}`;

    return this.cacheService.getCached<Product | null>(cacheKey, () => {
      return this.getProductById(productId).pipe(
        take(1),
        switchMap(product => {
          if (!product) {
            return of(null);
          }

          // ✅ USAR INVENTORYSERVICE DIRECTAMENTE (más confiable)
          return this.inventoryService.getVariantsByProductId(productId).pipe(
            take(1),
            map(variants => {
              // ✅ VERIFICACIÓN CRÍTICA: Asegurar que son objetos
              if (!variants || !Array.isArray(variants)) {
                return product; // Devolver producto sin variantes si fallan
              }

              // ✅ VERIFICAR QUE EL PRIMER ELEMENTO SEA UN OBJETO VÁLIDO
              if (variants.length > 0 && typeof variants[0] === 'string') {
                return product; // Devolver producto original sin sobreescribir
              }

              // ✅ ENRIQUECER SOLO SI LAS VARIANTES SON VÁLIDAS
              const enrichedProduct = this.enrichProductWithVariants(product, variants);

              // ✅ CALCULAR PRECIO DIRECTAMENTE (sin promociones externas)
              const productWithPricing = this.priceService.calculateDiscountedPrice(enrichedProduct);

              return productWithPricing;
            }),
            catchError(error => {
              console.error('❌ Error enriqueciendo producto:', error);
              return of(product); // Fallback
            })
          );
        }),
        catchError(error => {
          console.error(`❌ ProductService: Error en getCompleteProduct:`, error);
          return ErrorUtil.handleError(error, `getCompleteProduct(${productId})`);
        })
      );
    });
  }


  /**
   * 🚀 CORREGIDO: Obtiene productos por categoría
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
        take(1),
        map(products => {
          return products as Product[];
        }),
        switchMap(products => this.enrichProductsWithRealTimeStock(products)),
        switchMap(products => this.priceService.calculateDiscountedPrices(products).pipe(take(1))),
        catchError(error => ErrorUtil.handleError(error, `getProductsByCategory(${categoryId})`))
      );
    });
  }

  /**
   * 🚀 CORREGIDO: Obtiene productos destacados
   */
  getFeaturedProducts(limit: number = 8, forceRefresh: boolean = false): Observable<Product[]> {
    const cacheKey = `${this.productsCacheKey}_featured_${limit}`;

    if (forceRefresh) {
      this.cacheService.invalidate(cacheKey);
    }

    return this.cacheService.getCached<Product[]>(cacheKey, () => {

      const productsRef = collection(this.firestore, this.productsCollection);
      const q = query(productsRef, where('isFeatured', '==', true));

      return collectionData(q, { idField: 'id' }).pipe(
        take(1), // ✅ CRÍTICO: Forzar completar
        map(products => {
          const limited = (products as Product[]).slice(0, limit);
          return limited;
        }),
        switchMap(products => this.enrichProductsWithRealTimeStock(products)),
        switchMap(products => this.priceService.calculateDiscountedPrices(products).pipe(take(1))),
        catchError(error => ErrorUtil.handleError(error, 'getFeaturedProducts'))
      );
    });
  }

  /**
   * 🚀 CORREGIDO: Obtiene productos más vendidos
   */
  getBestSellingProducts(limit: number = 8, forceRefresh: boolean = false): Observable<Product[]> {
    const cacheKey = `${this.productsCacheKey}_bestselling_${limit}`;

    if (forceRefresh) {
      this.cacheService.invalidate(cacheKey);
    }

    return this.cacheService.getCached<Product[]>(cacheKey, () => {

      const productsRef = collection(this.firestore, this.productsCollection);
      const q = query(productsRef, where('isBestSeller', '==', true));

      return collectionData(q, { idField: 'id' }).pipe(
        take(1), // ✅ CRÍTICO: Forzar completar
        map(products => {
          const limited = (products as Product[]).slice(0, limit);
          return limited;
        }),
        switchMap(products => this.enrichProductsWithRealTimeStock(products)),
        switchMap(products => this.priceService.calculateDiscountedPrices(products).pipe(take(1))),
        catchError(error => ErrorUtil.handleError(error, 'getBestSellingProducts'))
      );
    });
  }

  /**
   * 🚀 CORREGIDO: Obtiene productos nuevos
   */
  getNewProducts(limit: number = 8, forceRefresh: boolean = false): Observable<Product[]> {
    const cacheKey = `${this.productsCacheKey}_new_${limit}`;

    if (forceRefresh) {
      this.cacheService.invalidate(cacheKey);
    }

    return this.cacheService.getCached<Product[]>(cacheKey, () => {

      const productsRef = collection(this.firestore, this.productsCollection);
      const q = query(productsRef, where('isNew', '==', true));

      return collectionData(q, { idField: 'id' }).pipe(
        take(1), // ✅ CRÍTICO: Forzar completar
        map(products => {
          const limited = (products as Product[]).slice(0, limit);
          return limited;
        }),
        switchMap(products => this.enrichProductsWithRealTimeStock(products)),
        switchMap(products => this.priceService.calculateDiscountedPrices(products).pipe(take(1))),
        catchError(error => ErrorUtil.handleError(error, 'getNewProducts'))
      );
    });
  }

  /**
   * 🚀 CORREGIDO: Obtiene los productos en oferta
   */
  getDiscountedProducts(limit: number = 8, forceRefresh: boolean = false): Observable<Product[]> {
    const cacheKey = `${this.productsCacheKey}_discounted_${limit}`;

    // Si forceRefresh es true, NO usar caché en absoluto
    if (forceRefresh) {

      // Limpiar caché para futuras llamadas
      this.cacheService.invalidate(cacheKey);
      this.cacheService.invalidate(this.productsCacheKey);

      // Usar getProductsNoCache directamente
      return this.getProductsNoCache().pipe(
        take(1),
        switchMap(products => {
          return this.priceService.calculateDiscountedPrices(products).pipe(take(1));
        }),
        map(products => {
          const discounted = products.filter(product => {
            const hasDirectDiscount = product.discountPercentage && product.discountPercentage > 0;
            const hasPriceReduction = product.currentPrice &&
              product.originalPrice &&
              product.currentPrice < product.originalPrice;
            const hasVariantPromotion = product.variants && product.variants.some(variant =>
              variant.promotionId ||
              (variant.discountedPrice && variant.originalPrice &&
                variant.discountedPrice < variant.originalPrice)
            );

            return hasDirectDiscount || hasPriceReduction || hasVariantPromotion;
          });

          const sorted = discounted.sort((a, b) => {
            const getDiscountPercent = (product: Product) => {
              if (product.discountPercentage) return product.discountPercentage;
              if (product.originalPrice && product.currentPrice) {
                return ((product.originalPrice - product.currentPrice) / product.originalPrice) * 100;
              }
              return 0;
            };

            return getDiscountPercent(b) - getDiscountPercent(a);
          });

          return sorted.slice(0, limit);
        }),
        catchError(error => ErrorUtil.handleError(error, 'getDiscountedProducts'))
      );
    }

    // Si no es forceRefresh, usar caché normal
    return this.cacheService.getCached<Product[]>(cacheKey, () => {
      return this.getProducts().pipe(
        take(1),
        switchMap(products => this.priceService.calculateDiscountedPrices(products).pipe(take(1))),
        map(products => {
          const discounted = products.filter(product => {
            const hasDirectDiscount = product.discountPercentage && product.discountPercentage > 0;
            const hasPriceReduction = product.currentPrice &&
              product.originalPrice &&
              product.currentPrice < product.originalPrice;
            const hasVariantPromotion = product.variants && product.variants.some(variant =>
              variant.promotionId ||
              (variant.discountedPrice && variant.originalPrice &&
                variant.discountedPrice < variant.originalPrice)
            );

            return hasDirectDiscount || hasPriceReduction || hasVariantPromotion;
          });

          const sorted = discounted.sort((a, b) => {
            const getDiscountPercent = (product: Product) => {
              if (product.discountPercentage) return product.discountPercentage;
              if (product.originalPrice && product.currentPrice) {
                return ((product.originalPrice - product.currentPrice) / product.originalPrice) * 100;
              }
              return 0;
            };

            return getDiscountPercent(b) - getDiscountPercent(a);
          });

          return sorted.slice(0, limit);
        }),
        catchError(error => ErrorUtil.handleError(error, 'getDiscountedProducts'))
      );
    });
  }

  // En ProductService, agrega este método:
  getDiscountedProductsForceRefresh(limit: number = 8): Observable<Product[]> {

    // Limpiar caché específico
    this.cacheService.invalidate(`${this.productsCacheKey}_discounted_${limit}`);
    this.cacheService.invalidate(this.productsCacheKey);

    // Obtener productos frescos directamente
    return this.getProductsNoCache().pipe(
      take(1),
      switchMap(products => {
        return this.priceService.calculateDiscountedPrices(products).pipe(take(1));
      }),
      map(products => {
        const discounted = products.filter(product => {
          const hasDirectDiscount = product.discountPercentage && product.discountPercentage > 0;
          const hasPriceReduction = product.currentPrice &&
            product.originalPrice &&
            product.currentPrice < product.originalPrice;
          const hasVariantPromotion = product.variants && product.variants.some(variant =>
            variant.promotionId ||
            (variant.discountedPrice && variant.originalPrice &&
              variant.discountedPrice < variant.originalPrice)
          );

          const includeProduct = hasDirectDiscount || hasPriceReduction || hasVariantPromotion;

          return includeProduct;
        });

        return discounted.slice(0, limit);
      }),
      catchError(error => {
        console.error('❌ Error en getDiscountedProductsForceRefresh:', error);
        return of([]);
      })
    );
  }

  /**
   * 🚀 CORREGIDO: Busca productos por texto
   */
  searchProducts(searchTerm: string): Observable<Product[]> {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return of([]);
    }

    const term = searchTerm.toLowerCase().trim();

    return this.getProducts().pipe(
      take(1), // ✅ NUEVO: Forzar completar
      map(products => {
        const filtered = products.filter(product => {
          return (
            (product.name && product.name.toLowerCase().includes(term)) ||
            (product.description && product.description.toLowerCase().includes(term)) ||
            (product.sku && product.sku.toLowerCase().includes(term)) ||
            (product.tags && product.tags.some(tag => tag.toLowerCase().includes(term)))
          );
        });
        return filtered;
      }),
      switchMap(filteredProducts => this.priceService.calculateDiscountedPrices(filteredProducts).pipe(take(1))),
      catchError(error => ErrorUtil.handleError(error, `searchProducts(${searchTerm})`)),
    );
  }

  /**
   * 🚀 CORREGIDO: Obtiene variantes de un producto
   */
  getProductVariants(productId: string): Observable<ProductVariant[]> {
    return this.inventoryService.getVariantsByProductId(productId).pipe(
      take(1), // ✅ NUEVO: Forzar completar
    );
  }

  /**
   * 🚀 CORREGIDO: Obtiene una variante específica
   */
  getVariantById(variantId: string): Observable<ProductVariant | undefined> {
    return this.inventoryService.getVariantById(variantId).pipe(
      take(1), // ✅ NUEVO: Forzar completar
    );
  }

  /**
   * 🚀 CORREGIDO: Obtiene productos relacionados (misma categoría)
   */
  getRelatedProducts(product: Product, limit: number = 4): Observable<Product[]> {
    if (!product) {
      return of([]);
    }

    const cacheKey = `${this.productsCacheKey}_related_${product.id}_${limit}`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {

      // 🆕 USAR forceReloadProducts en lugar de getProducts()
      return this.forceReloadProducts().pipe(
        take(1),
        map(allProducts => {
          const scored = allProducts
            .filter(p => p.id !== product.id && p.totalStock > 0)
            .map(p => ({
              product: p,
              score: this.calculateProductSimilarity(product, p)
            }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => item.product);

          return scored;
        }),
        catchError(error => {
          console.error('❌ ProductService: Error en getRelatedProducts:', error);
          return of([]);
        })
      );
    });
  }

  private calculateProductSimilarity(baseProduct: Product, compareProduct: Product): number {
    let score = 0;
    const reasons: string[] = []; // Para debugging

    // 🎯 1. Misma categoría (peso alto)
    if (baseProduct.category === compareProduct.category) {
      score += 10;
      reasons.push('misma categoría (+10)');
    }

    // 🎯 2. Mismo género (peso medio)
    if (baseProduct.gender && compareProduct.gender && baseProduct.gender === compareProduct.gender) {
      score += 5;
      reasons.push('mismo género (+5)');
    }

    // 🎯 3. Tags en común (peso alto)
    if (baseProduct.tags && compareProduct.tags && baseProduct.tags.length > 0 && compareProduct.tags.length > 0) {
      const commonTags = baseProduct.tags.filter(tag =>
        compareProduct.tags?.includes(tag)
      );
      if (commonTags.length > 0) {
        const tagScore = commonTags.length * 3;
        score += tagScore;
        reasons.push(`tags comunes: ${commonTags.join(', ')} (+${tagScore})`);
      }
    }

    // 🎯 4. Tecnologías en común (peso medio)
    if (baseProduct.technologies && compareProduct.technologies &&
      baseProduct.technologies.length > 0 && compareProduct.technologies.length > 0) {
      const commonTech = baseProduct.technologies.filter(tech =>
        compareProduct.technologies?.includes(tech)
      );
      if (commonTech.length > 0) {
        const techScore = commonTech.length * 2;
        score += techScore;
        reasons.push(`tecnologías comunes: ${commonTech.join(', ')} (+${techScore})`);
      }
    }

    // 🎯 5. Rango de precio similar (peso bajo)
    const priceDiff = Math.abs(baseProduct.price - compareProduct.price);
    const priceThreshold = baseProduct.price * 0.5; // ±50%
    if (priceDiff <= priceThreshold) {
      score += 2;
      reasons.push('precio similar (+2)');
    }

    // 🎯 6. Misma temporada/colección (peso medio)
    if (baseProduct.season && compareProduct.season && baseProduct.season === compareProduct.season) {
      score += 3;
      reasons.push('misma temporada (+3)');
    }
    if (baseProduct.collection && compareProduct.collection && baseProduct.collection === compareProduct.collection) {
      score += 3;
      reasons.push('misma colección (+3)');
    }

    // 🎯 7. Productos nuevos o bestsellers (boost)
    if (compareProduct.isNew || compareProduct.isBestSeller) {
      score += 1;
      reasons.push(`producto ${compareProduct.isNew ? 'nuevo' : 'bestseller'} (+1)`);
    }


    return score;
  }

  // -------------------- MÉTODOS DE ACTUALIZACIÓN --------------------

  /**
   * 🚀 CORREGIDO: Crea un nuevo producto completo con variantes
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
    this.cacheService.clearCache();

    return from(this.createProductInternal(
      productId, productData, colors, sizes, mainImage,
      colorImages, sizeImages, variantImages, additionalImages
    )).pipe(
      tap(() => {
        // 🧹 INVALIDAR CACHÉ DESPUÉS DE CREAR
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
      // Validar datos antes de proceder
      this.validateProductData({ ...productData, colors, sizes });

      // 1. Subir imagen principal
      const imageUrl = await this.imageService.uploadProductImage(productId, mainImage);

      // 2. Subir imágenes adicionales si existen
      let additionalImageUrls: string[] = [];
      if (additionalImages && additionalImages.length > 0) {
        additionalImageUrls = await this.imageService.uploadAdditionalImages(productId, additionalImages);
      }

      // 3. Procesar imágenes de colores y tallas
      const { colors: updatedColors, sizes: updatedSizes } =
        await this.variantService.processProductImages(
          productId,
          colors,
          sizes,
          colorImages,
          sizeImages
        );

      // 4. Crear datos base del producto
      const productBaseData = {
        ...productData,
        // ✅ CRÍTICO: Asegurar que distributorCost se incluya explícitamente
        distributorCost: productData.distributorCost || 0,
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

      // 🔍 DEBUG: Verificar que distributorCost se esté guardando
      console.log('💰 [CREATE] Creando producto con distributorCost:', {
        productId,
        name: productBaseData.name,
        price: productBaseData.price,
        distributorCost: productBaseData.distributorCost,
        hasDistributorCost: productBaseData.distributorCost !== undefined
      });

      // 5. Crear el producto base
      await this.variantService.createProductBase(productId, productBaseData);

      // 6. Crear variantes del producto
      await this.variantService.createProductVariants(
        productId,
        updatedColors,
        updatedSizes,
        variantImages,
        productData.sku,
        productData.price,           // ✅ Pasar precio del producto
        productData.distributorCost  // ✅ Pasar costo del distribuidor
      );

      return productId;
    } catch (error) {
      console.error('💥 Error en createProductInternal:', error);
      throw error;
    }
  }

  /**
   * 🚀 CORREGIDO: Actualiza un producto existente
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
* 🔧 NUEVO: Sanitiza datos para Firestore eliminando campos undefined
*/
  private sanitizeForFirestore(data: any): any {
    const sanitized: any = {};

    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined) return;

      // Eliminar base64 de campos imageUrl a nivel raíz
      if (key === 'imageUrl' && typeof value === 'string' && value.startsWith('data:')) {
        return; // No incluir base64 en Firestore
      }

      // Limpiar base64 en arrays de colors/sizes
      if ((key === 'colors' || key === 'sizes') && Array.isArray(value)) {
        sanitized[key] = value.map((item: any) => {
          const cleanItem = { ...item };
          if (cleanItem.imageUrl?.startsWith('data:')) {
            cleanItem.imageUrl = '';
          }
          return cleanItem;
        });
        return;
      }

      sanitized[key] = value;
    });

    return sanitized;
  }

  /**
* 🔧 NUEVO: Método público para sanitizar (uso desde componentes)
*/
  public sanitizeDataForFirestore(data: any): any {
    return this.sanitizeForFirestore(data);
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

    const updateData: any = {
      ...productData,
      updatedAt: new Date()
    };

    // Guard: si imageUrl del formulario es base64, eliminarlo aquí
    // Se asignará correctamente solo si se sube una nueva imagen (línea ~1143)
    if (updateData.imageUrl?.startsWith('data:')) {
      delete updateData.imageUrl;
    }

    // ✅ CRÍTICO: Preservar distributorCost explícitamente
    if (productData.distributorCost !== undefined) {
      updateData.distributorCost = productData.distributorCost;
    }

    // 🔍 DEBUG: Verificar que distributorCost se esté actualizando
    console.log('💰 [UPDATE] Actualizando producto con distributorCost:', {
      productId,
      name: updateData.name,
      price: updateData.price,
      distributorCost: updateData.distributorCost,
      hasDistributorCost: updateData.distributorCost !== undefined,
      isDistributorCostProvided: productData.distributorCost !== undefined
    });

    // Validar datos antes de proceder
    this.validateProductData(updateData);

    // Procesar imagen principal
    if (mainImage) {
      const currentProduct = await firstValueFrom(this.getProductById(productId).pipe(take(1)));

      if (currentProduct?.imageUrl) {
        await this.imageService.deleteImageIfExists(currentProduct.imageUrl);
      }

      const imageUrl = await this.imageService.uploadProductImage(productId, mainImage);
      updateData.imageUrl = imageUrl;
    }

    // Procesar imágenes adicionales
    if (additionalImages && additionalImages.length > 0) {
      const additionalImageUrls = await this.imageService.uploadAdditionalImages(productId, additionalImages);

      // 🔧 CORRECCIÓN: No concatenar, usar lo que viene en productData
      updateData.additionalImages = productData.additionalImages || [];

      // Solo agregar las nuevas URLs si no están ya incluidas
      const newUrls = additionalImageUrls.filter(url =>
        !updateData.additionalImages.includes(url)
      );
      updateData.additionalImages.push(...newUrls);
    }

    // Procesar imágenes de colores y tallas
    if ((colorImages && colorImages.size > 0) || (sizeImages && sizeImages.size > 0)) {
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
    }

    // Procesar imágenes de variantes
    if (variantImages && variantImages.size > 0) {
      await this.updateVariantImages(productId, variantImages);
    }

    // Actualizar variantes y recalcular stock si hay cambios en colores/tallas
    if (updateData.colors && updateData.sizes) {
      const calculatedTotalStock = await this.updateProductVariantsWithStockCalculation(
        productId,
        updateData.colors,
        updateData.sizes
      );

      updateData.totalStock = calculatedTotalStock;

      // ✅ NUEVO: Sincronizar variantes cuando cambian colores/tallas
      await this.syncVariantsWithColorStocks(productId, updateData.colors, updateData.sizes);
    }


    // ✅ NUEVO: Actualizar distributorCost en variantes si cambió
    if (updateData.distributorCost !== undefined || updateData.price !== undefined) {
      try {
        await this.variantService.updatePricingForProduct(
          productId,
          updateData.price,
          updateData.distributorCost
        );
        console.log('✅ ProductService: Precios actualizados en variantes');
      } catch (error) {
        console.error('❌ ProductService: Error actualizando precios en variantes:', error);
        // No lanzar error para no interrumpir la actualización del producto
      }
    }

    const sanitizedData = this.sanitizeForFirestore(updateData);

    // ✅ VERIFICACIÓN FINAL: Asegurar que distributorCost esté en datos sanitizados
    if (updateData.distributorCost !== undefined && !sanitizedData.distributorCost) {
      sanitizedData.distributorCost = updateData.distributorCost;
    }

    await this.variantService.updateProductBase(productId, sanitizedData);
  }

  private async syncVariantsWithColorStocks(
    productId: string,
    colors: Color[],
    sizes: Size[]
  ): Promise<void> {
    // Obtener variantes existentes
    const existingVariants = await firstValueFrom(this.getProductVariants(productId));

    const batch = writeBatch(this.firestore);
    let totalStock = 0;

    // Para cada variante, actualizar con el stock correcto de colorStocks
    existingVariants.forEach(variant => {
      const size = sizes.find(s => s.name === variant.sizeName);
      const colorStock = size?.colorStocks?.find(cs => cs.colorName === variant.colorName);
      const correctStock = colorStock?.quantity || 0;

      if (variant.stock !== correctStock) {

        const variantRef = doc(this.firestore, 'productVariants', variant.id);
        batch.update(variantRef, {
          stock: correctStock,
          updatedAt: new Date()
        });
      }

      totalStock += correctStock;
    });

    // Actualizar stock total del producto
    const productRef = doc(this.firestore, this.productsCollection, productId);
    batch.update(productRef, {
      totalStock,
      updatedAt: new Date()
    });

    await batch.commit();
  }

  /**
   * Elimina una imagen específica de Firebase Storage
   */
  deleteImage(imageUrl: string): Promise<void> {
    return this.imageService.deleteImageByUrl(imageUrl);
  }

  /**
   * Elimina múltiples imágenes específicas
   */
  async deleteImages(imageUrls: string[]): Promise<void> {
    const deletePromises = imageUrls.map(url => this.deleteImage(url));
    await Promise.allSettled(deletePromises); // Usar allSettled para no fallar si una imagen no existe
  }

  /**
   * Actualiza imágenes de variantes (NUEVO MÉTODO)
   */
  private async updateVariantImages(
    productId: string,
    variantImages: Map<string, File>
  ): Promise<void> {

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
      const existingVariants = await firstValueFrom(this.getProductVariants(productId));
      const batch = writeBatch(this.firestore);

      const variantMap = new Map<string, ProductVariant>();
      existingVariants.forEach(v => {
        const key = `${v.colorName}-${v.sizeName}`;
        variantMap.set(key, v);
      });

      let totalStock = 0;

      // Tu código existente...
      for (const color of colors) {
        for (const size of sizes) {
          const stockEntry = size.colorStocks?.find(cs => cs.colorName === color.name);
          const stock = stockEntry?.quantity || 0;
          totalStock += stock;

          const key = `${color.name}-${size.name}`;

          if (variantMap.has(key)) {
            const variant = variantMap.get(key)!;
            const variantRef = doc(this.firestore, 'productVariants', variant.id);

            batch.update(variantRef, {
              stock,
              colorCode: color.code,
              updatedAt: new Date()
            });

            variantMap.delete(key);
          } else if (stock > 0) {
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
          }
        }
      }

      // Eliminar variantes obsoletas
      variantMap.forEach(variant => {
        const variantRef = doc(this.firestore, 'productVariants', variant.id);
        batch.delete(variantRef);
      });

      // ✅ AGREGAR ESTA PARTE - Recalcular sizes correctamente
      const updatedSizes = sizes.map(size => {
        // Calcular stock total de la talla desde colorStocks
        const sizeStock = size.colorStocks?.reduce((sum, cs) => sum + (cs.quantity || 0), 0) || 0;

        return {
          ...size,
          stock: sizeStock, // ✅ Stock recalculado
          colorStocks: size.colorStocks?.filter(cs => (cs.quantity || 0) > 0) || []
        };
      });

      // ✅ MODIFICAR ESTA PARTE - Incluir sizes actualizados
      const productRef = doc(this.firestore, this.productsCollection, productId);
      batch.update(productRef, {
        totalStock,
        sizes: updatedSizes, // ✅ CRÍTICO: Actualizar sizes
        updatedAt: new Date()
      });

      await batch.commit();

      return totalStock;
    } catch (error) {
      console.error(`💥 Error al actualizar variantes del producto ${productId}:`, error);
      throw error;
    }
  }

  /**
   * 🚀 CORREGIDO: Elimina un producto y todos sus recursos asociados
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
      catchError(error => ErrorUtil.handleError(error, `deleteProduct(${productId})`)),
    );
  }

  /**
   * 🚀 CORREGIDO: Registra una venta
   */
  registerSale(productId: string, items: SaleItem[]): Observable<void> {
    return this.inventoryService.registerSale(productId, items).pipe(
      take(1), // ✅ NUEVO: Forzar completar
      tap(() => this.invalidateProductCacheWithStrategy({ productId })),
    );
  }

  /**
   * 🚀 CORREGIDO: Actualiza inventario
   */
  updateStock(update: StockUpdate): Observable<void> {
    return this.inventoryService.updateStock(update).pipe(
      take(1), // ✅ NUEVO: Forzar completar
      tap(() => this.invalidateProductCacheWithStrategy({ productId: update.productId })),
    );
  }

  /**
   * 🚀 CORREGIDO: Actualiza inventario en lote
   */
  updateStockBatch(updates: StockUpdate[]): Observable<void> {
    return this.inventoryService.updateStockBatch(updates).pipe(
      take(1), // ✅ NUEVO: Forzar completar
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
      }),
    );
  }

  /**
   * 🚀 CORREGIDO: Transfiere stock entre variantes
   */
  transferStock(transfer: StockTransfer): Observable<void> {
    return this.inventoryService.transferStock(transfer).pipe(
      take(1), // ✅ NUEVO: Forzar completar
      tap(() => {
        // Invalidar caché general ya que no conocemos los productIds específicos
        this.invalidateProductCacheWithStrategy({ affectsAll: true });
      }),
      catchError(error => ErrorUtil.handleError(error, 'transferStock')),
    );
  }


  // -------------------- MÉTODOS DE INFORMES --------------------

  /**
   * 🚀 CORREGIDO: Obtiene resumen de inventario
   */
  getInventorySummary(): Observable<InventorySummary> {
    return this.inventoryService.getInventorySummary().pipe(
      take(1), // ✅ NUEVO: Forzar completar
    );
  }

  /**
   * 🚀 CORREGIDO: Obtiene productos con stock bajo
   */
  getLowStockProducts(threshold?: number): Observable<LowStockProduct[]> {
    return this.inventoryService.getLowStockProducts(threshold).pipe(
      take(1), // ✅ NUEVO: Forzar completar
    );
  }

  /**
   * 🚀 CORREGIDO: Obtiene variantes sin stock
   */
  getOutOfStockVariants(): Observable<ProductVariant[]> {
    return this.inventoryService.getOutOfStockVariants().pipe(
      take(1), // ✅ NUEVO: Forzar completar
    );
  }

  /**
   * 🚀 CORREGIDO: Verifica disponibilidad de stock para compra
   */
  checkVariantsAvailability(items: SaleItem[]): Observable<{
    available: boolean;
    unavailableItems: {
      variantId: string;
      requested: number;
      available: number;
    }[];
  }> {
    return this.inventoryService.checkVariantsAvailability(items).pipe(
      take(1), // ✅ NUEVO: Forzar completar
    );
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

      // Intentar eliminar documento del producto si existe
      const productDoc = doc(this.firestore, this.productsCollection, productId);
      const productSnap = await getDoc(productDoc);

      if (productSnap.exists()) {
        await deleteDoc(productDoc);
      }

      // Eliminar variantes si existen
      await this.variantService.deleteProductVariants(productId);

      // Eliminar imágenes (esto elimina todo el directorio del producto)
      await this.imageService.deleteProductImages(productId, []);

    } catch (error) {
      console.error(`❌ Error durante limpieza de producto fallido ${productId}:`, error);
    }
  }

  // Agregar estos métodos a tu ProductService existente

  /**
   * 🆕 OBTIENE PRODUCTOS ÚNICOS POR MODELO
   * Retorna un producto representativo de cada modelo disponible
   */
  getUniqueModels(): Observable<Product[]> {
    const cacheKey = `${this.productsCacheKey}_unique_models`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {

      return this.getProducts().pipe(
        take(1),
        map(products => {

          // Crear mapa de modelos únicos
          const modelsMap = new Map<string, Product>();

          products.forEach(product => {
            const modelKey = product.model || product.name; // Fallback al name si no tiene model

            if (!modelsMap.has(modelKey)) {
              modelsMap.set(modelKey, product);
            } else {
              // Si ya existe, mantener el que tenga mejor puntuación/popularidad
              const existing = modelsMap.get(modelKey)!;
              if ((product.popularityScore || 0) > (existing.popularityScore || 0)) {
                modelsMap.set(modelKey, product);
              }
            }
          });

          const uniqueModels = Array.from(modelsMap.values());

          // Ordenar por popularidad y stock
          uniqueModels.sort((a, b) => {
            // Priorizar productos con stock
            if (a.totalStock > 0 && b.totalStock === 0) return -1;
            if (a.totalStock === 0 && b.totalStock > 0) return 1;

            // Luego por popularidad
            return (b.popularityScore || 0) - (a.popularityScore || 0);
          });

          return uniqueModels;
        }),
        catchError(error => {
          console.error('❌ ProductService: Error obteniendo modelos únicos:', error);
          return of([]);
        })
      );
    });
  }

  /**
   * 🆕 OBTIENE MODELOS POR CATEGORÍA
   */
  getUniqueModelsByCategory(categoryId: string): Observable<Product[]> {
    if (!categoryId) {
      return of([]);
    }

    const cacheKey = `${this.productsCacheKey}_models_category_${categoryId}`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {

      return this.getProductsByCategory(categoryId).pipe(
        take(1),
        map(products => {
          const modelsMap = new Map<string, Product>();

          products.forEach(product => {
            const modelKey = product.model || product.name;

            if (!modelsMap.has(modelKey)) {
              modelsMap.set(modelKey, product);
            } else {
              const existing = modelsMap.get(modelKey)!;
              if ((product.popularityScore || 0) > (existing.popularityScore || 0)) {
                modelsMap.set(modelKey, product);
              }
            }
          });

          const uniqueModels = Array.from(modelsMap.values())
            .filter(product => product.totalStock > 0) // Solo con stock
            .sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0));


          return uniqueModels;
        }),
        catchError(error => {
          console.error(`❌ ProductService: Error obteniendo modelos por categoría ${categoryId}:`, error);
          return of([]);
        })
      );
    });
  }

  /**
   * 🆕 OBTIENE PRODUCTOS DEL MISMO MODELO
   */
  getProductsByModel(model: string): Observable<Product[]> {
    if (!model) {
      return of([]);
    }

    const cacheKey = `${this.productsCacheKey}_model_${model}`;

    return this.cacheService.getCached<Product[]>(cacheKey, () => {

      return this.getProducts().pipe(
        take(1),
        map(products => {
          const modelProducts = products.filter(product =>
            (product.model === model) ||
            (product.name === model && !product.model) // Fallback
          );

          return modelProducts;
        }),
        catchError(error => {
          console.error(`❌ ProductService: Error obteniendo productos del modelo ${model}:`, error);
          return of([]);
        })
      );
    });
  }

  /**
   * 🆕 OBTIENE ESTADÍSTICAS DE MODELOS
   */
  getModelsStats(): Observable<{
    totalModels: number;
    modelsByCategory: { [category: string]: number };
    topModels: { model: string; productCount: number; totalStock: number }[];
  }> {
    return this.getProducts().pipe(
      take(1),
      map(products => {
        const modelsMap = new Map<string, Product[]>();
        const categoryStats: { [category: string]: Set<string> } = {};

        // Agrupar productos por modelo
        products.forEach(product => {
          const modelKey = product.model || product.name;

          if (!modelsMap.has(modelKey)) {
            modelsMap.set(modelKey, []);
          }
          modelsMap.get(modelKey)!.push(product);

          // Estadísticas por categoría
          if (!categoryStats[product.category]) {
            categoryStats[product.category] = new Set();
          }
          categoryStats[product.category].add(modelKey);
        });

        // Calcular top modelos
        const topModels = Array.from(modelsMap.entries())
          .map(([model, products]) => ({
            model,
            productCount: products.length,
            totalStock: products.reduce((sum, p) => sum + p.totalStock, 0)
          }))
          .sort((a, b) => b.totalStock - a.totalStock)
          .slice(0, 10);

        // Convertir Set a number para modelsByCategory
        const modelsByCategory: { [category: string]: number } = {};
        Object.entries(categoryStats).forEach(([category, modelsSet]) => {
          modelsByCategory[category] = modelsSet.size;
        });

        return {
          totalModels: modelsMap.size,
          modelsByCategory,
          topModels
        };
      }),
      catchError(error => {
        console.error('❌ ProductService: Error calculando estadísticas de modelos:', error);
        return of({
          totalModels: 0,
          modelsByCategory: {},
          topModels: []
        });
      })
    );
  }


  /**
* 🆕 MÉTODO: Forzar recarga después de transacción exitosa
*/
  forceReloadAfterPayment(): Observable<Product[]> {

    // Limpiar TODO el caché relacionado con productos
    this.cacheService.clearCache();

    // Obtener productos frescos desde Firestore
    const productsRef = collection(this.firestore, this.productsCollection);
    return collectionData(productsRef, { idField: 'id' }).pipe(
      take(1), // ✅ Una sola emisión
      map(data => {
        return data as Product[];
      }),
      switchMap(products => this.enrichProductsWithRealTimeStock(products)),
      tap(enrichedProducts => {

        // Actualizar el caché con los nuevos datos
        this.cacheService.getCached(this.productsCacheKey, () => of(enrichedProducts));
      }),
      catchError(error => {
        console.error('❌ ProductService: Error en forceReloadAfterPayment:', error);
        return ErrorUtil.handleError(error, 'forceReloadAfterPayment');
      })
    );
  }

  // ==================== MÉTODOS DE ESTADÍSTICAS REALES ====================

  /**
* 📊 Obtiene historial de ventas REAL desde inventoryMovements
*/

  getProductSalesHistory(productId: string, days: number = 30): Observable<{ date: Date, sales: number }[]> {
    const cacheKey = `products_sales_${productId}_${days}`;

    return this.cacheService.getCached<{ date: Date, sales: number }[]>(cacheKey, () => {
      console.log(`📊 [ANALYTICS] Obteniendo ventas reales para ${productId} (${days} días)`);

      // Calcular endDate al final del día de HOY en la zona horaria LOCAL
      const endDateLocal = new Date();
      endDateLocal.setHours(23, 59, 59, 999); // Fin del día actual, hora local

      // Calcular un startDate LOCAL inicial que sea lo suficientemente amplio
      // para capturar ventas de la ventana deseada y un poco más allá.
      // Por ejemplo, si 'days' es 30, retrocedemos 60 días para la base del historial.
      const initialStartDateLocal = new Date();
      // Retrocede el doble de días para el rango inicial de la consulta a Firestore.
      // Esto asegura que capturemos ventas que puedan estar ligeramente fuera de la ventana 'days'
      // debido a las zonas horarias o si el usuario espera ver ventas un poco más antiguas.
      initialStartDateLocal.setDate(initialStartDateLocal.getDate() - (days * 2));
      initialStartDateLocal.setHours(0, 0, 0, 0); // Inicio del día, hora local


      // Para la consulta de Firestore, necesitamos fechas UTC.
      // La consulta debe abarcar desde el inicio del día más antiguo (en UTC)
      // hasta el final del día más reciente (en UTC).
      const queryStartDate = new Date(initialStartDateLocal);
      queryStartDate.setHours(queryStartDate.getHours() - 24); // Retrocede un día completo en UTC para la consulta

      const queryEndDate = new Date(endDateLocal);
      queryEndDate.setHours(queryEndDate.getHours() + 24); // Avanza un día completo en UTC para la consulta


      // --- INICIO DE LOGS DE DEPURACIÓN DE FECHAS ---
      console.log(`DEBUG FECHAS (CONSULTA Firestore): startDate = ${queryStartDate.toISOString()}, endDate = ${queryEndDate.toISOString()}`);
      console.log(`DEBUG FECHAS (RANGO LOCAL INICIAL): startDateLocal = ${initialStartDateLocal.toLocaleString()}, endDateLocal = ${endDateLocal.toLocaleString()}`);
      // --- FIN DE LOGS DE DEPURACIÓN DE FECHAS ---

      const movementsRef = collection(this.firestore, 'inventoryMovements');

      const q = query(
        movementsRef,
        where('productId', '==', productId),
        where('type', '==', 'sale'),
        where('timestamp', '>=', Timestamp.fromDate(queryStartDate)),
        where('timestamp', '<=', Timestamp.fromDate(queryEndDate))
      );

      return from(getDocs(q)).pipe(
        map(querySnapshot => {
          console.log(`📊 [DEBUG] Documentos encontrados: ${querySnapshot.size} para getProductSalesHistory`);

          const salesByDate = new Map<string, number>();

          // Paso 1: Procesar todos los documentos recuperados por Firestore
          querySnapshot.forEach(doc => {
            const movement = doc.data();

            let movementDate: Date; // Esto será un objeto Date en la zona horaria LOCAL del navegador

            if (movement['timestamp'] && typeof movement['timestamp'].toDate === 'function') {
              movementDate = movement['timestamp'].toDate();
            } else if (movement['timestamp'] instanceof Date) {
              movementDate = movement['timestamp'];
            } else if (movement['timestamp'] && typeof movement['timestamp'].seconds === 'number') {
              movementDate = new Date(movement['timestamp'].seconds * 1000);
            } else {
              console.error('❌ Formato de timestamp no reconocido en getProductSalesHistory:', movement['timestamp']);
              return;
            }

            // Obtener la clave de fecha en base a la fecha LOCAL (día, mes, año)
            const year = movementDate.getFullYear();
            const month = (movementDate.getMonth() + 1).toString().padStart(2, '0'); // Mes como cadena 01-12
            const day = (movementDate.getDate()).toString().padStart(2, '0'); // Día como cadena 01-31
            const dateKey = `${year}-${month}-${day}`; // Clave 'YYYY-MM-DD' basada en la fecha LOCAL

            const quantity = Math.abs(movement['quantity'] || 0);

            // --- INICIO DE LOGS DE DEPURACIÓN DE DOCUMENTOS ---
            console.log(`DEBUG DOC: ID=${doc.id}, timestamp_raw=${JSON.stringify(movement['timestamp'])}, movementDate_LOCAL=${movementDate.toLocaleString()}, dateKey=${dateKey}, quantity=${quantity}`);
            // --- FIN DE LOGS DE DEPURACIÓN DE DOCUMENTOS ---

            const currentSales = salesByDate.get(dateKey) || 0;
            salesByDate.set(dateKey, currentSales + quantity);
          });

          // Paso 2: Determinar el rango FINAL de fechas para la visualización
          // Este rango debe ser los 'days' más recientes, pero asegurando que
          // se incluyan las ventas que ocurrieron en esos días.

          let finalStartDateLocal = new Date(endDateLocal);
          // Calcula el inicio de la ventana de 'days' días hacia atrás desde hoy.
          finalStartDateLocal.setDate(finalStartDateLocal.getDate() - (days - 1));
          finalStartDateLocal.setHours(0, 0, 0, 0);

          // Si hay ventas registradas, ajusta 'finalStartDateLocal' para incluir la venta más antigua
          // siempre y cuando esté dentro del rango amplio de la consulta inicial.
          let minDateInSales = new Date(endDateLocal); // Inicializar con la fecha más reciente posible
          let hasSalesData = false;

          salesByDate.forEach((sales, dateKey) => {
            if (sales > 0) { // Solo consideramos días con ventas reales
              const parts = dateKey.split('-').map(Number);
              // Crear la fecha al inicio del día en la zona horaria local
              const saleDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
              if (saleDate < minDateInSales) {
                minDateInSales = saleDate;
              }
              hasSalesData = true;
            }
          });

          // Si se encontraron ventas y la venta más antigua es anterior al 'finalStartDateLocal' calculado,
          // y esa venta más antigua no es excesivamente vieja (es decir, está dentro de initialStartDateLocal),
          // entonces ajustamos 'finalStartDateLocal' para que empiece en la fecha de esa venta.
          if (hasSalesData && minDateInSales < finalStartDateLocal && minDateInSales >= initialStartDateLocal) {
            finalStartDateLocal = minDateInSales;
          }


          // Paso 3: Construir el historial de ventas para la UI
          const salesHistory: { date: Date, sales: number }[] = [];
          for (let d = new Date(finalStartDateLocal); d <= endDateLocal; d.setDate(d.getDate() + 1)) {
            const year = d.getFullYear();
            const month = d.getMonth(); // Mes como índice (0-11)
            const day = d.getDate();

            // Crear la fecha al inicio del día en la zona horaria local
            salesHistory.push({ date: new Date(year, month, day, 0, 0, 0, 0), sales: salesByDate.get(`${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`) || 0 });
          }

          // Ordenar por fecha (más reciente primero)
          salesHistory.sort((a, b) => b.date.getTime() - a.date.getTime());

          console.log(`📊 [DEBUG] Días con ventas (filtrados por rango FINAL DINÁMICO): ${salesHistory.length}`);
          console.log(`DEBUG RANGO FINAL: startDate = ${finalStartDateLocal.toLocaleString()}, endDate = ${endDateLocal.toLocaleString()}`);


          return salesHistory;
        }),
        catchError(error => {
          console.error(`❌ Error obteniendo ventas reales:`, error);
          return of([]); // Retornar array vacío en caso de error
        })
      );
    });
  }


  // Método para sincronizar el contador de ventas
  async syncProductSalesCount(productId: string): Promise<void> {
    try {
      // Obtener todas las ventas del producto
      const movementsRef = collection(this.firestore, 'inventoryMovements');
      const q = query(
        movementsRef,
        where('productId', '==', productId),
        where('type', '==', 'sale')
      );

      // --- INICIO DE LOGS DE DEPURACIÓN DE SYNC ---
      console.log(`📊 [DEBUG] Sincronizando ventas para ${productId} (consulta sin filtro de fecha)`);
      // --- FIN DE LOGS DE DEPURACIÓN DE SYNC ---

      const snapshot = await getDocs(q);
      const totalSales = snapshot.docs.reduce((sum, doc) => {
        const quantity = Math.abs(doc.data()['quantity'] || 0);
        return sum + quantity;
      }, 0);

      // Actualizar el contador en el producto
      const productRef = doc(this.firestore, 'products', productId);
      await updateDoc(productRef, {
        sales: totalSales,
        updatedAt: new Date()
      });

      console.log(`✅ Contador de ventas actualizado: ${totalSales}`);
      // Invalidar caché específico del producto después de la sincronización
      this.cacheService.invalidateProductCache(productId);
      this.cacheService.invalidate(`products_sales_${productId}_30`); // Invalidar caché del historial de ventas
    } catch (error) {
      console.error('❌ Error sincronizando ventas:', error);
    }
  }

  /**
* 👁️ Obtiene datos de vistas REALES usando user_activity_logs
*/
  getProductViewsData(productId: string): Observable<{ period: string, count: number }[]> {
    const cacheKey = `products_views_${productId}`;

    return this.cacheService.getCached<{ period: string, count: number }[]>(cacheKey, () => {

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);

      const activityRef = collection(this.firestore, 'user_activity_logs');

      const queries = [
        // Hoy
        query(activityRef,
          where('action', '==', 'product_view'),
          where('metadata.productId', '==', productId),
          where('timestamp', '>=', this.getStartOfDay(today))
        ),
        // Ayer
        query(activityRef,
          where('action', '==', 'product_view'),
          where('metadata.productId', '==', productId),
          where('timestamp', '>=', this.getStartOfDay(yesterday)),
          where('timestamp', '<', this.getStartOfDay(today))
        ),
        // Última semana
        query(activityRef,
          where('action', '==', 'product_view'),
          where('metadata.productId', '==', productId),
          where('timestamp', '>=', this.getStartOfDay(weekAgo))
        ),
        // Último mes
        query(activityRef,
          where('action', '==', 'product_view'),
          where('metadata.productId', '==', productId),
          where('timestamp', '>=', this.getStartOfDay(monthAgo))
        )
      ];

      return forkJoin(queries.map(q => from(getDocs(q)))).pipe(
        map(([todaySnap, yesterdaySnap, weekSnap, monthSnap]) => {
          return [
            { period: 'Hoy', count: todaySnap.size },
            { period: 'Ayer', count: yesterdaySnap.size },
            { period: 'Última semana', count: weekSnap.size },
            { period: 'Último mes', count: monthSnap.size }
          ];
        }),
        catchError(error => {
          console.error(`❌ Error obteniendo vistas reales:`, error);
          return this.getFallbackViewsData(productId);
        })
      );
    });
  }

  /**
* 📈 Obtiene estadísticas completas usando tus colecciones reales
*/
  getProductCompleteStats(productId: string): Observable<{
    product: Product;
    salesHistory: { date: Date, sales: number }[];
    viewsData: { period: string, count: number }[];
    stockData: any;
    promotionData?: any;
  }> {
    return forkJoin({
      product: this.forceRefreshProduct(productId),
      salesHistory: this.getProductSalesHistory(productId),
      viewsData: this.getProductViewsData(productId),
      promotionData: this.getProductPromotionData(productId)
    }).pipe(
      take(1),
      map(({ product, salesHistory, viewsData, promotionData }) => {
        if (!product) {
          throw new Error('Producto no encontrado');
        }

        const stockData = {
          totalStock: product.totalStock || 0,
          variantsWithStock: product.variants?.filter(v => (v.stock || 0) > 0).length || 0,
          variantsWithoutStock: product.variants?.filter(v => (v.stock || 0) === 0).length || 0,
          totalVariants: product.variants?.length || 0
        };

        return {
          product,
          salesHistory,
          viewsData,
          stockData,
          promotionData
        };
      }),
      catchError(error => {
        console.error(`❌ Error obteniendo estadísticas para ${productId}:`, error);
        return throwError(() => error);
      })
    );
  }

  /**
   * 🏷️ Obtiene datos de promociones usando appliedPromotions
   */
  public getProductPromotionData(productId: string): Observable<any> {
    const promotionsRef = collection(this.firestore, 'appliedPromotions');
    const q = query(
      promotionsRef,
      where('targetId', '==', productId),
      where('target', '==', 'product')
    );

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const activePromotions: any[] = [];
        const now = new Date();

        querySnapshot.forEach(doc => {
          const promo = doc.data();
          const expiresAt = promo['expiresAt'].toDate();

          if (expiresAt > now) {
            activePromotions.push({
              id: doc.id,
              ...promo,
              expiresAt
            });
          }
        });

        return {
          hasActivePromotions: activePromotions.length > 0,
          activePromotions,
          count: activePromotions.length
        };
      }),
      catchError(error => {
        console.error(`❌ Error obteniendo promociones:`, error);
        return of({ hasActivePromotions: false, activePromotions: [], count: 0 });
      })
    );
  }

  // ==================== MÉTODOS AUXILIARES ====================

  private getStartOfDay(date: Date): Date {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private getFallbackSalesHistory(productId: string, days: number): Observable<{ date: Date, sales: number }[]> {
    return this.getProductById(productId).pipe(
      map(product => {
        const totalSales = product?.sales || 0;
        const salesHistory: { date: Date, sales: number }[] = [];
        const today = new Date();

        for (let i = days - 1; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);

          // Distribución más realista
          const dayWeight = i === 0 ? 0.3 : i <= 7 ? 0.5 : 0.2;
          const sales = Math.floor((totalSales / days) * dayWeight);

          salesHistory.push({ date, sales });
        }

        return salesHistory;
      })
    );
  }

  private getFallbackViewsData(productId: string): Observable<{ period: string, count: number }[]> {
    return this.getProductById(productId).pipe(
      map(product => {
        const totalViews = product?.views || 0;

        return [
          { period: 'Hoy', count: Math.floor(totalViews * 0.05) },
          { period: 'Ayer', count: Math.floor(totalViews * 0.03) },
          { period: 'Última semana', count: Math.floor(totalViews * 0.25) },
          { period: 'Último mes', count: totalViews }
        ];
      })
    );
  }

}
