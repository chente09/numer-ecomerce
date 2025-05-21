import { Injectable } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, getDoc, where, query,
  updateDoc, deleteDoc, setDoc, getDocs,
  writeBatch
} from '@angular/fire/firestore';
import { Observable, from, of, forkJoin, throwError, firstValueFrom } from 'rxjs';
import { map, catchError, switchMap, tap, take } from 'rxjs/operators';
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
    // Servicios no utilizados eliminados:
    // private categoryService: CategoryService,
    // private colorService: ColorService,
    // private sizeService: SizeService,
  ) { }

  // -------------------- MÉTODOS DE CONSULTA --------------------

  /**
   * Obtiene todos los productos con caché
   */
  getProducts(): Observable<Product[]> {
    return this.cacheService.getCached<Product[]>(this.productsCacheKey, () => {
      const productsRef = collection(this.firestore, this.productsCollection);
      return collectionData(productsRef, { idField: 'id' }).pipe(
        map(data => data as Product[]),
        catchError(error => ErrorUtil.handleError(error, 'getProducts'))
      );
    });
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
        const productDoc = doc(this.firestore, this.productsCollection, productId);
        const productSnap = await getDoc(productDoc);

        if (productSnap.exists()) {
          const product = {
            id: productSnap.id,
            ...productSnap.data()
          } as Product;

          // Registrar vista en segundo plano (no bloqueante)
          this.incrementProductView(productId);

          return product;
        }

        return null;
      })()).pipe(
        catchError(error => ErrorUtil.handleError(error, `getProductById(${productId})`))
      );
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
              return this.priceService.addPromotionsToProduct(product).pipe(
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
        // Aplicar precios con descuento y promociones a todos los productos
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
      // Primero obtener todos los productos
      return this.getProducts().pipe(
        // Aplicar precios y promociones
        switchMap(products => this.priceService.calculateDiscountedPrices(products)),
        // Filtrar solo los que tienen descuento
        map(products => products.filter(product =>
          (product.discountPercentage && product.discountPercentage > 0) ||
          product.activePromotion
        )),
        // Aplicar límite
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

    // Normalizar término de búsqueda
    const term = searchTerm.toLowerCase().trim();

    // Buscamos en caché primero para evitar consultas innecesarias
    return this.getProducts().pipe(
      map(products => {
        return products.filter(product => {
          // Verificar coincidencias en nombre, descripción, SKU y otras propiedades relevantes
          return (
            (product.name && product.name.toLowerCase().includes(term)) ||
            (product.description && product.description.toLowerCase().includes(term)) ||
            (product.sku && product.sku.toLowerCase().includes(term)) ||
            (product.tags && product.tags.some(tag => tag.toLowerCase().includes(term)))
          );
        });
      }),
      // Aplicar precios con descuento a los resultados
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
          // Excluir el producto actual
          const filtered = products.filter(p => p.id !== product.id);
          // Aplicar límite
          return filtered.slice(0, limit);
        }),
        catchError(error => ErrorUtil.handleError(error, `getRelatedProducts(${product.id})`))
      );
    });
  }

  // -------------------- MÉTODOS DE ACTUALIZACIÓN --------------------

  /**
   * Crea un nuevo producto completo con variantes
   */
  createProduct(
    productData: Omit<Product, 'id'>, colors: Color[], sizes: Size[], mainImage: File, colorImages?: Map<string, File>, sizeImages?: Map<string, File>, variantImages?: Map<string, File>, additionalImages?: File[]): Observable<string> {
    // Generar ID único para el producto
    const productId = uuidv4();

    return from((async () => {
      try {
        // 1. Subir imagen principal
        const imageUrl = await this.imageService.uploadProductImage(productId, mainImage);

        // 1.1 Subir imágenes adicionales si existen
        let additionalImageUrls: string[] = [];
        if (additionalImages && additionalImages.length > 0) {
          additionalImageUrls = await this.imageService.uploadAdditionalImages(productId, additionalImages);
        }

        // 2. Crear datos base del producto
        const productBaseData = {
          ...productData,
          imageUrl,
          additionalImages: additionalImageUrls,
          totalStock: 0, // Inicializar en 0, se actualizará después por createProductVariants
          popularityScore: 0,
          views: 0,
          sales: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // 3. Crear el producto base sin variantes
        await this.variantService.createProductBase(productId, productBaseData);

        // 4. Procesar imágenes de colores y tallas
        const { colors: updatedColors, sizes: updatedSizes } =
          await this.variantService.processProductImages(
            productId,
            colors,
            sizes,
            colorImages,
            sizeImages
          );

        // 5. Crear variantes del producto
        await this.variantService.createProductVariants(
          productId,
          updatedColors,
          updatedSizes,
          variantImages,
          productData.sku
        );
        // El totalStock se actualiza en createProductVariants

        // 6. Invalidar cachés
        this.invalidateProductCache();

        return productId;
      } catch (error) {
        // Si hay error, intentar limpiar recursos creados parcialmente
        await this.cleanupFailedProduct(productId);
        throw error;
      }
    })()).pipe(
      catchError(error => ErrorUtil.handleError(error, 'createProduct'))
    );
  }

  /**
   * Actualiza un producto existente
   */
  updateProduct(
    productId: string,
    productData: Partial<Product>,
    mainImage?: File,
    additionalImages?: File[]
  ): Observable<void> {
    if (!productId) {
      return throwError(() => new Error('ID de producto no proporcionado'));
    }

    return from((async () => {

      const updateData: any = {
        ...productData,
        updatedAt: new Date()
      };

      // Si hay una nueva imagen principal, subirla
      if (mainImage) {
        // Obtener el producto actual para ver si hay que eliminar una imagen anterior
        // Usando firstValueFrom en lugar de toPromise (obsoleto)
        const currentProduct = await firstValueFrom(this.getProductById(productId).pipe(take(1)));

        if (currentProduct?.imageUrl) {
          await this.imageService.deleteImageIfExists(currentProduct.imageUrl);
        }

        // Subir nueva imagen
        const imageUrl = await this.imageService.uploadProductImage(productId, mainImage);
        updateData.imageUrl = imageUrl;
      }

      // Si hay nuevas imágenes adicionales, subirlas
      if (additionalImages && additionalImages.length > 0) {
        // Obtener las imágenes adicionales actuales
        const currentProduct = await firstValueFrom(this.getProductById(productId).pipe(take(1)));
        const additionalImageUrls = await this.imageService.uploadAdditionalImages(productId, additionalImages);

        // Combinar imágenes existentes y nuevas
        updateData.additionalImages = [
          ...(currentProduct?.additionalImages || []),
          ...additionalImageUrls
        ];
      }

      // Actualizar datos del producto
      await this.variantService.updateProductBase(productId, updateData);

      // 1. Actualizar datos básicos del producto
      await this.variantService.updateProductBase(productId, updateData);

      // 2. IMPORTANTE: Si se enviaron colores y tallas, actualizar las variantes también
      if (productData.colors && productData.sizes) {
        console.log('Actualizando variantes con stock:', productData.sizes);

        // Implementar un método para actualizar las variantes
        await this.updateProductVariants(productId, productData.colors, productData.sizes);
      }

      // Invalidar caché
      this.invalidateProductCache(productId);
    })()).pipe(
      catchError(error => ErrorUtil.handleError(error, `updateProduct(${productId})`))
    );
  }

  // Método nuevo para actualizar variantes
  private async updateProductVariants(
    productId: string,
    colors: Color[],
    sizes: Size[]
  ): Promise<void> {
    try {
      // Obtener variantes existentes
      const existingVariants = await firstValueFrom(this.getProductVariants(productId));
      const batch = writeBatch(this.firestore);

      // Mapa para buscar variantes existentes
      const variantMap = new Map<string, ProductVariant>();
      existingVariants.forEach(v => {
        const key = `${v.colorName}-${v.sizeName}`;
        variantMap.set(key, v);
      });

      // Calcular stock total
      let totalStock = 0;

      // Recorrer combinaciones de colores y tallas
      for (const color of colors) {
        for (const size of sizes) {
          // Obtener stock de esta combinación
          const stockEntry = size.colorStocks?.find(cs => cs.colorName === color.name);
          const stock = stockEntry?.quantity || 0;
          totalStock += stock;

          // Clave para esta combinación
          const key = `${color.name}-${size.name}`;

          if (variantMap.has(key)) {
            // Actualizar variante existente
            const variant = variantMap.get(key)!;
            const variantRef = doc(this.firestore, 'productVariants', variant.id);
            batch.update(variantRef, { stock, updatedAt: new Date() });

            // Eliminar del mapa para saber cuáles borrar después
            variantMap.delete(key);
          } else if (stock > 0) {
            // Crear nueva variante si tiene stock
            const variantId = uuidv4();
            const variantRef = doc(this.firestore, 'productVariants', variantId);
            batch.set(variantRef, {
              id: variantId,
              productId,
              colorName: color.name,
              colorCode: color.code,
              sizeName: size.name,
              stock,
              createdAt: new Date(),
              updatedAt: new Date()
            });
          }
        }
      }

      // Eliminar variantes que ya no existen
      variantMap.forEach(variant => {
        const variantRef = doc(this.firestore, 'productVariants', variant.id);
        batch.delete(variantRef);
      });

      // Actualizar stock total en el producto
      const productRef = doc(this.firestore, this.productsCollection, productId);
      batch.update(productRef, { totalStock, updatedAt: new Date() });

      // Ejecutar todas las operaciones
      await batch.commit();
      console.log(`Variantes actualizadas para el producto ${productId}. Stock total: ${totalStock}`);
    } catch (error) {
      console.error(`Error al actualizar variantes del producto ${productId}:`, error);
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
      // Usando firstValueFrom en lugar de toPromise (obsoleto)
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
      this.invalidateProductCache(productId);
    })()).pipe(
      catchError(error => ErrorUtil.handleError(error, `deleteProduct(${productId})`))
    );
  }

  /**
   * Registra una venta
   */
  registerSale(productId: string, items: SaleItem[]): Observable<void> {
    return this.inventoryService.registerSale(productId, items).pipe(
      tap(() => this.invalidateProductCache(productId))
    );
  }

  /**
   * Actualiza inventario
   */
  updateStock(update: StockUpdate): Observable<void> {
    return this.inventoryService.updateStock(update).pipe(
      tap(() => this.invalidateProductCache(update.productId))
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

        // Invalidar caché general y específicos
        this.invalidateProductCache();
        productIds.forEach(id => this.invalidateProductCache(id));
      })
    );
  }

  /**
   * Transfiere stock entre variantes
   */
  transferStock(transfer: StockTransfer): Observable<void> {
    return this.inventoryService.transferStock(transfer).pipe(
      // No podemos invalidar caché aquí fácilmente porque no conocemos productId
      // pero inventoryService ya invalida su propio caché
      catchError(error => ErrorUtil.handleError(error, 'transferStock'))
    );
  }

  /**
   * Incrementa contador de vistas (no público, uso interno)
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

      console.log(`Limpieza exitosa para producto fallido ${productId}`);
    } catch (error) {
      console.error(`Error durante limpieza de producto fallido ${productId}:`, error);
    }
  }

  /**
   * Invalida caché relacionado con productos
   */
  private invalidateProductCache(productId?: string): void {
    // Siempre invalidar caché general de productos
    this.cacheService.invalidate(this.productsCacheKey);

    // Si hay un ID específico, invalidar cachés relacionados
    if (productId) {
      this.cacheService.invalidate(`${this.productsCacheKey}_${productId}`);
      this.cacheService.invalidate(`${this.productsCacheKey}_complete_${productId}`);
    }

    // También invalidar cachés de productos destacados
    this.cacheService.invalidate(`${this.productsCacheKey}_featured`);
    this.cacheService.invalidate(`${this.productsCacheKey}_bestselling`);
    this.cacheService.invalidate(`${this.productsCacheKey}_new`);
    this.cacheService.invalidate(`${this.productsCacheKey}_discounted`);
  }
}