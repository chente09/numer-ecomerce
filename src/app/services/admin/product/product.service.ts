import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { map, shareReplay, switchMap, catchError } from 'rxjs/operators';
import {
  Firestore, collection, collectionData, doc, getDoc,
  getDocs,
  limit,
  orderBy,
  query, startAfter, updateDoc, where
} from '@angular/fire/firestore';
import { Product, ProductFilter, PaginatedResult, Size, ColorStock } from '../../../models/models';
import { ProductImageService } from '../image/product-image.service';
import { ProductVariantService } from '../productVariante/product-variant.service';
import { ProductPriceService } from '../price/product-price.service';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private collectionName = 'products';
  private productsCache$?: Observable<Product[]>;

  constructor(
    private firestore: Firestore,
    private imageService: ProductImageService,
    private variantService: ProductVariantService,
    private priceService: ProductPriceService
  ) { }

  // OBTENIENDO PRODUCTOS CON CACHÉ
  getProducts(): Observable<Product[]> {
    if (!this.productsCache$) {
      const productsRef = collection(this.firestore, this.collectionName);

      this.productsCache$ = collectionData(productsRef, { idField: 'id' }).pipe(
        map(data => this.mapProductsData(data as any[])),
        switchMap(products => this.priceService.calculateDiscountedPrices(products)),
        shareReplay(1),
        catchError(error => {
          console.error('Error al obtener productos:', error);
          return of([]);
        })
      );
    }
    return this.productsCache$;
  }

  // BÚSQUEDA Y FILTRADO AVANZADO
  searchProducts(filter: ProductFilter): Observable<PaginatedResult<Product>> {
    let q = query(collection(this.firestore, this.collectionName));

    // Aplicar filtros
    if (filter.categories?.length) {
      q = query(q, where('category', 'in', filter.categories));
    }

    if (filter.minPrice !== undefined) {
      q = query(q, where('price', '>=', filter.minPrice));
    }

    if (filter.maxPrice !== undefined) {
      q = query(q, where('price', '<=', filter.maxPrice));
    }

    if (filter.isNew !== undefined) {
      q = query(q, where('isNew', '==', filter.isNew));
    }

    if (filter.isBestSeller !== undefined) {
      q = query(q, where('isBestSeller', '==', filter.isBestSeller));
    }

    if (filter.hasDiscount) {
      q = query(q, where('discountPercentage', '>', 0));
    }

    if (filter.season) {
      q = query(q, where('season', '==', filter.season));
    }

    if (filter.collection) {
      q = query(q, where('collection', '==', filter.collection));
    }

    // Ordenación
    if (filter.sortBy) {
      switch (filter.sortBy) {
        case 'price_asc':
          q = query(q, orderBy('price', 'asc'));
          break;
        case 'price_desc':
          q = query(q, orderBy('price', 'desc'));
          break;
        case 'newest':
          q = query(q, orderBy('releaseDate', 'desc'));
          break;
        case 'popular':
          q = query(q, orderBy('popularityScore', 'desc'));
          break;
        case 'rating':
          q = query(q, orderBy('rating', 'desc'));
          break;
      }
    }
    else {
      // Ordenación por defecto
      q = query(q, orderBy('name', 'asc'));
    }

    // Paginación
    const pageSize = filter.limit || 20;
    q = query(q, limit(pageSize));

    if (filter.page && filter.page > 1 && filter.lastDoc) {
      q = query(q, startAfter(filter.lastDoc));
    }

    return from(getDocs(q)).pipe(
      map(snapshot => {
        const products = snapshot.docs.map(doc => {
          const data = doc.data();
          return this.mapProductData({ id: doc.id, ...data } as any);
        });

        const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

        // Si hay filtros de color, tamaño o texto que no se pueden hacer en la BD, los hacemos aquí
        let filteredProducts = products;

        if (filter.colors?.length) {
          filteredProducts = filteredProducts.filter(product =>
            product.colors.some(color => filter.colors?.includes(color.name))
          );
        }

        if (filter.sizes?.length) {
          filteredProducts = filteredProducts.filter(product =>
            product.sizes.some(size => filter.sizes?.includes(size.name))
          );
        }

        if (filter.tags?.length) {
          filteredProducts = filteredProducts.filter(product =>
            filter.tags?.some(tag => product.tags.includes(tag))
          );
        }

        if (filter.searchQuery) {
          const query = filter.searchQuery.toLowerCase();
          filteredProducts = filteredProducts.filter(product => {
            return (
              product.name.toLowerCase().includes(query) ||
              product.description?.toLowerCase().includes(query) ||
              product.searchKeywords?.some(kw => kw.toLowerCase().includes(query)) ||
              product.tags.some(tag => tag.toLowerCase().includes(query))
            );
          });
        }

        // Calcular precios con descuento
        const productsWithDiscounts = filteredProducts.map(product =>
          this.priceService.calculateDiscountedPrice(product)
        );

        return {
          items: productsWithDiscounts,
          totalCount: snapshot.size, // Esto es aproximado si se aplican filtros post-query
          lastDoc: lastDoc,
          hasMore: snapshot.docs.length === pageSize
        };
      })
    );
  }

  // Obtener productos por categoría
  getProductsByCategory(category: string): Observable<Product[]> {
    const productsRef = collection(this.firestore, this.collectionName);
    const q = query(productsRef, where('category', '==', category));

    return collectionData(q, { idField: 'id' }).pipe(
      map(data => this.mapProductsData(data as any[])),
      switchMap(products => this.priceService.calculateDiscountedPrices(products)),
      catchError(error => {
        console.error(`Error al obtener productos de categoría ${category}:`, error);
        return of([]);
      })
    );
  }

  // Obtener producto por ID
  async getProductById(id: string): Promise<Product | undefined> {
    try {
      const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const productData = this.mapProductData({ id: docSnap.id, ...docSnap.data() } as any);

        // Cargar variantes asociadas usando el servicio específico
        const variants = await this.variantService.getVariantsByProductId(id);

        // Cargar promociones aplicables
        const productWithPromotions = await this.priceService.addPromotionsToProduct(
          { ...productData, variants }
        );

        // Calcular precios con descuento
        return this.priceService.calculateDiscountedPrice(productWithPromotions);
      }

      throw new Error(`Producto con ID ${id} no encontrado.`);
    } catch (error: any) {
      console.error(`Error al obtener producto ${id}:`, error);
      throw new Error(`Error al obtener producto: ${error.message}`);
    }
  }

  // Incrementar vistas de un producto
  async incrementProductViews(id: string): Promise<void> {
    await this.variantService.incrementProductViews(id);
    this.invalidateCache();
  }

  // CREAR PRODUCTO COMPLETO
  async createProduct(
    product: Omit<Product, 'id' | 'imageUrl' | 'variants'>,
    mainImage: File,
    variantImages?: Map<string, File>,
    colorImages?: Map<string, File>,
    sizeImages?: Map<string, File>
  ): Promise<string> {
    try {
      // Generar ID único
      const id = this.variantService.generateId();

      // 1. Subir la imagen principal
      const mainImageUrl = await this.imageService.uploadProductImage(id, mainImage);

      // 2-4. Procesar colores, tamaños e imágenes
      const { colors, sizes } = await this.imageService.processProductImages(
        id, product.colors, product.sizes, colorImages, sizeImages
      );

      // 5. Calcular stock total
      const totalStock = this.calculateTotalStock(sizes);

      // 6. Crear el producto base
      const newProduct = {
        ...product,
        id,
        colors,
        sizes,
        imageUrl: mainImageUrl,
        totalStock,
        views: 0,
        sales: 0,
        isNew: product.isNew !== undefined ? product.isNew : true,
        isBestSeller: product.isBestSeller !== undefined ? product.isBestSeller : false,
        tags: product.tags || [],
        searchKeywords: product.searchKeywords || [],
        releaseDate: product.releaseDate || new Date(),
        popularityScore: 0
      };

      // 7. Guardar el producto en Firestore
      await this.variantService.createProductBase(id, newProduct);

      // 8. Crear variantes de producto
      await this.variantService.createProductVariants(
        id, colors, sizes, variantImages, product.sku
      );

      this.invalidateCache();
      return id;
    } catch (error: any) {
      console.error('Error al crear producto:', error);
      throw new Error(`Error al crear el producto: ${error.message}`);
    }
  }

  // Otras funciones básicas basadas en delegación a servicios especializados
  /**
 * Actualiza un producto existente
 */
  async updateProduct(
    id: string,
    product: Partial<Product>,
    mainImage?: File,
    variantImages?: Map<string, File>,
    colorImages?: Map<string, File>,
    sizeImages?: Map<string, File>
  ): Promise<void> {
    try {
      // 1. Obtener el producto actual
      const existingProduct = await this.getProductById(id);
      if (!existingProduct) {
        throw new Error(`El producto con ID ${id} no existe.`);
      }

      // 2. Procesar la imagen principal si se proporciona
      let imageUrl = existingProduct.imageUrl;
      if (mainImage) {
        // Eliminar la imagen anterior si existe
        if (imageUrl) {
          await this.imageService.deleteImageIfExists(imageUrl);
        }
        // Subir la nueva imagen
        imageUrl = await this.imageService.uploadProductImage(id, mainImage);
      }

      // 3. Procesar las imágenes de colores y tallas si se proporcionan
      let colors = existingProduct.colors;
      let sizes = existingProduct.sizes;

      if ((colorImages && colorImages.size > 0) || (sizeImages && sizeImages.size > 0)) {
        const result = await this.imageService.processProductImages(
          id,
          product.colors || existingProduct.colors,
          product.sizes || existingProduct.sizes,
          colorImages,
          sizeImages
        );

        colors = result.colors;
        sizes = result.sizes;
      } else {
        // Si hay colores o tallas nuevos pero sin imágenes nuevas
        if (product.colors) {
          colors = product.colors;
        }
        if (product.sizes) {
          sizes = product.sizes;
        }
      }

      // 4. Calcular el stock total
      const totalStock = this.calculateTotalStock(sizes);

      // 5. Preparar los datos actualizados
      const updatedProduct = {
        ...product,
        imageUrl,
        colors,
        sizes,
        totalStock
      };

      // 6. Actualizar el producto base
      await this.variantService.updateProductBase(id, updatedProduct);

      // 7. Actualizar o crear variantes si es necesario
      if (product.colors || product.sizes) {
        // Eliminar variantes existentes
        await this.variantService.deleteProductVariants(id);

        // Crear nuevas variantes
        await this.variantService.createProductVariants(
          id, colors, sizes, variantImages, existingProduct.sku
        );
      } else if (variantImages && variantImages.size > 0) {
        // Solo actualizar imágenes de variantes específicas
        for (const [variantId, file] of variantImages.entries()) {
          const imageUrl = await this.imageService.uploadVariantImage(id, variantId, file);
          await this.variantService.updateVariantImage(variantId, imageUrl);
        }
      }

      this.invalidateCache();
    } catch (error: any) {
      console.error(`Error al actualizar el producto ${id}:`, error);
      throw new Error(`Error al actualizar el producto: ${error.message}`);
    }
  }

  /**
 * Actualiza el stock de una variante específica de un producto
 */
async updateVariantStock(productId: string, variantId: string, quantity: number): Promise<void> {
  try {
    // Obtener referencia al documento del producto
    const productRef = doc(this.firestore, 'products', productId);
    
    // Primero obtener el producto actual para no sobrescribir otros datos
    const productSnap = await getDoc(productRef);
    
    if (!productSnap.exists()) {
      throw new Error('Producto no encontrado');
    }
    
    const productData = productSnap.data() as any;
    
    // Verificar si el producto tiene variantes
    if (!productData.variants || !Array.isArray(productData.variants)) {
      throw new Error('El producto no tiene variantes');
    }
    
    // Encontrar la variante específica a actualizar
    const variants = productData.variants as any[];
    const variantIndex = variants.findIndex(v => v.id === variantId);
    
    if (variantIndex === -1) {
      throw new Error('Variante no encontrada');
    }
    
    // Calcular la diferencia para actualizar el stock total
    const oldQuantity = variants[variantIndex].stock || 0;
    const quantityDifference = quantity - oldQuantity;
    
    // Crear un objeto con la ruta a la variante específica
    const updateData = {
      [`variants.${variantIndex}.stock`]: quantity,
      // Actualizar también el stock total del producto
      totalStock: (productData.totalStock || 0) + quantityDifference
    };
    
    // Actualizar en Firestore
    await updateDoc(productRef, updateData);
  } catch (error) {
    console.error('Error al actualizar stock de variante:', error);
    throw error;
  }
}

  /**
   * Elimina un producto y todos sus recursos asociados
   */
  async deleteProduct(id: string): Promise<void> {
    try {
      // 1. Obtener el producto con todas sus imágenes
      const product = await this.getProductById(id);
      if (!product) {
        throw new Error(`El producto con ID ${id} no existe.`);
      }

      // 2. Recopilar todas las URLs de imágenes
      const imageUrls: string[] = [];

      // Imagen principal
      if (product.imageUrl) {
        imageUrls.push(product.imageUrl);
      }

      // Imágenes de colores
      for (const color of product.colors) {
        if (color.imageUrl && !imageUrls.includes(color.imageUrl)) {
          imageUrls.push(color.imageUrl);
        }
      }

      // Imágenes de tallas
      for (const size of product.sizes) {
        if (size.imageUrl && !imageUrls.includes(size.imageUrl)) {
          imageUrls.push(size.imageUrl);
        }
      }

      // 3. Obtener imágenes de variantes
      const variants = await this.variantService.getVariantsByProductId(id);
      for (const variant of variants) {
        if (variant.imageUrl &&
          !imageUrls.includes(variant.imageUrl) &&
          variant.imageUrl !== product.imageUrl &&
          !product.colors.some(c => c.imageUrl === variant.imageUrl)) {
          imageUrls.push(variant.imageUrl);
        }
      }

      // 4. Eliminar todas las imágenes
      await this.imageService.deleteProductImages(id, imageUrls);

      // 5. Eliminar variantes
      await this.variantService.deleteProductVariants(id);

      // 6. Eliminar el producto
      await this.variantService.deleteProduct(id);

      this.invalidateCache();
    } catch (error: any) {
      console.error(`Error al eliminar el producto ${id}:`, error);
      throw new Error(`Error al eliminar el producto: ${error.message}`);
    }
  }

  // UTILIDADES
  invalidateCache(): void {
    this.productsCache$ = undefined;
  }

  // Mapear array de productos desde Firestore
  private mapProductsData(data: any[]): Product[] {
    return data.map(item => this.mapProductData(item));
  }

  // Mapear un solo producto desde Firestore
  private mapProductData(data: any): Product {
    // Asegurarse de que las fechas sean objetos Date
    const processDate = (date: any) => {
      if (date && typeof date.toDate === 'function') {
        return date.toDate();
      }
      return date ? new Date(date) : undefined;
    };

    return {
      id: data.id,
      name: data.name,
      price: data.price || 0,
      originalPrice: data.originalPrice,
      currentPrice: data.currentPrice,
      discountPercentage: data.discountPercentage,
      imageUrl: data.imageUrl || '',
      rating: data.rating || 0,
      category: data.category || '',
      description: data.description,
      isNew: data.isNew !== undefined ? data.isNew : false,
      isBestSeller: data.isBestSeller !== undefined ? data.isBestSeller : false,
      colors: Array.isArray(data.colors) ? data.colors : [],
      sizes: Array.isArray(data.sizes) ? data.sizes : [],
      totalStock: data.totalStock || 0,
      sku: data.sku || '',
      barcode: data.barcode,
      season: data.season,
      collection: data.collection,
      releaseDate: processDate(data.releaseDate),
      views: data.views || 0,
      sales: data.sales || 0,
      lastRestockDate: processDate(data.lastRestockDate),
      popularityScore: data.popularityScore || 0,
      promotions: Array.isArray(data.promotions) ? data.promotions : [],
      variants: Array.isArray(data.variants) ? data.variants : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
      searchKeywords: Array.isArray(data.searchKeywords) ? data.searchKeywords : []
    };
  }

  // Calcular stock total basado en tallas
  private calculateTotalStock(sizes: Size[]): number {
    return sizes.reduce((sum, size) => {
      if (size.colorStocks && size.colorStocks.length > 0) {
        return sum + size.colorStocks.reduce((colorSum: number, cs: ColorStock) =>
          colorSum + (cs.quantity || 0), 0);
      }
      return sum + (size.stock || 0);
    }, 0);
  }

  // Funciones para obtener productos especiales
  getBestSellers(limit: number = 8): Observable<Product[]> {
    return this.getProducts().pipe(
      map(products => {
        return products
          .sort((a, b) => (b.sales || 0) - (a.sales || 0))
          .slice(0, limit);
      }),
      switchMap(products => this.priceService.calculateDiscountedPrices(products))
    );
  }

  getNewArrivals(limit: number = 8): Observable<Product[]> {
    return this.getProducts().pipe(
      map(products => {
        return products
          .filter(p => p.isNew)
          .sort((a, b) => {
            const dateA = a.releaseDate ? a.releaseDate.getTime() : 0;
            const dateB = b.releaseDate ? b.releaseDate.getTime() : 0;
            return dateB - dateA;
          })
          .slice(0, limit);
      }),
      switchMap(products => this.priceService.calculateDiscountedPrices(products))
    );
  }
}