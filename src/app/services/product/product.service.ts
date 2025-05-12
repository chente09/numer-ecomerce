import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, shareReplay, switchMap, tap, catchError } from 'rxjs/operators';
import {
  addDoc, collection, collectionData, deleteDoc, doc,
  Firestore, getDoc, query, updateDoc, where, getDocs,
  orderBy, limit, startAfter, writeBatch, increment,
  setDoc
} from '@angular/fire/firestore';
import {
  Storage, deleteObject, getDownloadURL, ref, uploadBytes
} from '@angular/fire/storage';
import { v4 as uuidv4 } from 'uuid';

export interface Color {
  id: string;
  name: string;
  code: string;
  imageUrl: string;
}

export interface Size {
  name: string;        // S, M, L, XL, etc.
  stock: number;       // Cantidad disponible
  imageUrl?: string;   // URL de la imagen representativa de la talla
  colorStocks?: {      // Stock específico por color y talla
    colorName: string;
    quantity: number;
  }[];
}

export interface Promotion {
  id: string;
  name: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  applicableProductIds?: string[]; // IDs de productos a los que aplica la promoción
  applicableCategories?: string[]; // Categorías a las que aplica la promoción
  minPurchaseAmount?: number;      // Monto mínimo de compra para aplicar
  maxDiscountAmount?: number;      // Límite máximo del descuento (para porcentajes)
  usageLimit?: number;             // Límite de usos totales
  perCustomerLimit?: number;       // Límite de usos por cliente
}

export interface ProductVariant {
  id: string;
  colorName: string;
  colorCode: string;
  sizeName: string;
  stock: number;
  sku: string;
  price?: number;  // Precio específico de la variante (opcional)
  imageUrl?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  currentPrice?: number;
  discountPercentage?: number;
  imageUrl: string;
  rating: number;
  category: string;
  description?: string;
  isNew?: boolean;
  isBestSeller?: boolean;
  colors: Color[];
  sizes: Size[];
  totalStock: number;
  sku: string;
  barcode?: string;
  season?: string;           // 'Spring 2025', 'Summer 2025', etc.
  collection?: string;       // 'Casual', 'Formal', 'Sport', etc.
  releaseDate?: Date;        // Fecha de lanzamiento del producto
  views: number;             // Número de veces que se ha visto
  sales: number;             // Número de unidades vendidas
  lastRestockDate?: Date;    // Última fecha de reabastecimiento
  popularityScore?: number;  // Puntuación calculada de popularidad
  promotions?: Promotion[];
  variants: ProductVariant[];
  tags: string[];
  metaTitle?: string;
  metaDescription?: string;
  searchKeywords?: string[];
}

export interface ProductFilter {
  categories?: string[];
  minPrice?: number;
  maxPrice?: number;
  colors?: string[];
  sizes?: string[];
  tags?: string[];
  season?: string;
  collection?: string;
  isNew?: boolean;
  isBestSeller?: boolean;
  hasDiscount?: boolean;
  searchQuery?: string;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'popular' | 'rating';
  page?: number;
  limit?: number;
  lastDoc?: any;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  lastDoc?: any;  // Para la paginación de Firestore
  hasMore: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private collectionName = 'products';
  private variantsCollectionName = 'productVariants';
  private promotionsCollectionName = 'promotions';
  private productsCache$?: Observable<Product[]>;
  
  constructor(
    private firestore: Firestore,
    private storage: Storage,
  ) { }

  // OBTENIENDO PRODUCTOS CON CACHÉ
  getProducts(): Observable<Product[]> {
    if (!this.productsCache$) {
      const productsRef = collection(this.firestore, this.collectionName);
      this.productsCache$ = collectionData(productsRef, { idField: 'id' }).pipe(
        map(data => this.mapProductsData(data as any[])),
        map(products => this.calculateDiscountedPrices(products)),
        shareReplay(1)
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
        filteredProducts = this.calculateDiscountedPrices(filteredProducts);
        
        return {
          items: filteredProducts,
          totalCount: snapshot.size, // Esto es aproximado si se aplican filtros post-query
          lastDoc: lastDoc,
          hasMore: snapshot.docs.length === pageSize
        };
      })
    );
  }

  getProductsByCategory(category: string): Observable<Product[]> {
    const productsRef = collection(this.firestore, this.collectionName);
    const q = query(productsRef, where('category', '==', category));
    
    return collectionData(q, { idField: 'id' }).pipe(
      map(data => this.mapProductsData(data as any[])),
      map(products => this.calculateDiscountedPrices(products))
    );
  }

  async getProductById(id: string): Promise<Product | undefined> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const productData = this.mapProductData({ id: docSnap.id, ...docSnap.data() } as any);
      
      // Cargar variantes asociadas
      const variantsRef = collection(this.firestore, this.variantsCollectionName);
      const q = query(variantsRef, where('productId', '==', id));
      const variantsSnap = await getDocs(q);
      const variants = variantsSnap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }) as ProductVariant);
      
      // Cargar promociones aplicables
      const now = new Date();
      const promotionsRef = collection(this.firestore, this.promotionsCollectionName);
      const promotionsQuery = query(
        promotionsRef, 
        where('isActive', '==', true),
        where('endDate', '>', now)
      );
      const promotionsSnap = await getDocs(promotionsQuery);
      const allPromotions = promotionsSnap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }) as unknown as Promotion);
      
      // Filtrar las promociones aplicables a este producto
      const applicablePromotions = allPromotions.filter(promo => {
        return (
          (!promo.applicableProductIds || promo.applicableProductIds.includes(id)) &&
          (!promo.applicableCategories || promo.applicableCategories.includes(productData.category))
        );
      });
      
      const product = {
        ...productData,
        variants,
        promotions: applicablePromotions
      };
      
      // Calcular precios con descuento
      return this.calculateDiscountedPrice(product);
    }
    
    throw new Error(`Producto con ID ${id} no encontrado.`);
  }

  // Incrementar vistas de un producto
  async incrementProductViews(id: string): Promise<void> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    await updateDoc(docRef, { views: increment(1) });
    this.invalidateCache();
  }

  // CREAR PRODUCTO COMPLETO
  async createProduct(
    product: Omit<Product, 'id' | 'imageUrl' | 'variants'>, 
    mainImage: File, 
    variantImages?: Map<string, File>, // clave: 'colorName-sizeName'
    colorImages?: Map<string, File>,   // clave: colorName
    sizeImages?: Map<string, File>     // clave: sizeName
  ): Promise<string> {
    const productsRef = collection(this.firestore, this.collectionName);
    const id = uuidv4();
    
    try {
      // 1. Procesar y subir la imagen principal
      const mainImageUrl = await this.uploadCompressedImage(`products/${id}/main.webp`, mainImage);
      
      // 2. Procesar colores y sus imágenes
      const colors = [...product.colors];
      if (colorImages && colorImages.size > 0) {
        for (let i = 0; i < colors.length; i++) {
          const colorFile = colorImages.get(colors[i].name);
          if (colorFile) {
            const colorImageUrl = await this.uploadCompressedImage(
              `products/${id}/colors/${colors[i].name.toLowerCase()}.webp`,
              colorFile
            );
            colors[i].imageUrl = colorImageUrl;
          }
        }
      }
      
      // 3. Procesar tamaños y sus imágenes
      const sizes = [...product.sizes];
      if (sizeImages && sizeImages.size > 0) {
        for (let i = 0; i < sizes.length; i++) {
          const sizeFile = sizeImages.get(sizes[i].name);
          if (sizeFile) {
            const sizeImageUrl = await this.uploadCompressedImage(
              `products/${id}/sizes/${sizes[i].name.toLowerCase()}.webp`,
              sizeFile
            );
            sizes[i].imageUrl = sizeImageUrl;
          }
        }
      }
      
      // 4. Calcular stock total basado en tallas y colores
      const totalStock = sizes.reduce((sum, size) => sum + size.stock, 0);
      
      // 5. Crear el producto base sin variantes
      const newProduct: Omit<Product, 'variants'> = {
        ...product,
        id,
        colors,
        sizes,
        imageUrl: mainImageUrl,
        totalStock,
        rating: product.rating || 0,
        views: 0,
        sales: 0,
        isNew: product.isNew !== undefined ? product.isNew : true,
        isBestSeller: product.isBestSeller !== undefined ? product.isBestSeller : false,
        tags: product.tags || [],
        searchKeywords: product.searchKeywords || [],
        releaseDate: product.releaseDate || new Date(),
        popularityScore: 0 // Se calculará en base a vistas y ventas
      };
      
      // 6. Guardar el producto en Firestore
      await setDoc(doc(this.firestore, this.collectionName, id), newProduct);
      
      // 7. Crear las variantes de producto
      const variants: ProductVariant[] = [];
      const batch = writeBatch(this.firestore);
      
      for (const color of colors) {
        for (const size of sizes) {
          // Identificar stock específico para esta combinación color-talla
          let variantStock = size.stock;
          const colorStock = size.colorStocks?.find(cs => cs.colorName === color.name);
          if (colorStock) {
            variantStock = colorStock.quantity;
          }
          
          // Solo crear variantes con stock > 0
          if (variantStock > 0) {
            const variantId = uuidv4();
            const variantSKU = `${product.sku}-${color.name}-${size.name}`.toUpperCase();
            
            const variant: ProductVariant = {
              id: variantId,
              colorName: color.name,
              colorCode: color.code,
              sizeName: size.name,
              stock: variantStock,
              sku: variantSKU,
              imageUrl: color.imageUrl || newProduct.imageUrl
            };
            
            // Verificar si hay una imagen específica para esta variante
            const variantImageKey = `${color.name}-${size.name}`;
            if (variantImages?.has(variantImageKey)) {
              const variantImage = variantImages.get(variantImageKey)!;
              variant.imageUrl = await this.uploadCompressedImage(
                `products/${id}/variants/${variantId}.webp`,
                variantImage
              );
            }
            
            // Agregar la variante a la lista y al batch
            variants.push(variant);
            const variantRef = doc(collection(this.firestore, this.variantsCollectionName));
            batch.set(variantRef, {
              ...variant,
              productId: id // Referencia al producto padre
            });
          }
        }
      }
      
      // 8. Ejecutar la escritura por lotes de variantes
      await batch.commit();
      
      // 9. Actualizar el producto con el ID de las variantes
      await updateDoc(doc(this.firestore, this.collectionName, id), {
        variants: variants.map(v => v.id)
      });
      
      this.invalidateCache();
      return id;
      
    } catch (error: any) {
      console.error('Error detallado al crear producto:', error);
      throw new Error(`Error al crear el producto: ${error.message}`);
    }
  }

  // ACTUALIZAR PRODUCTO
  async updateProduct(
    id: string,
    product: Partial<Product>,
    mainImage?: File,
    variantImages?: Map<string, File>, // clave: variantId
    colorImages?: Map<string, File>,   // clave: colorName
    sizeImages?: Map<string, File>     // clave: sizeName
  ): Promise<void> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    
    try {
      // 1. Cargar el producto actual
      const currentProduct = await this.getProductById(id);
      if (!currentProduct) {
        throw new Error(`El producto con ID ${id} no existe.`);
      }
      
      // 2. Preparar datos actualizados
      const updatedData: Partial<Product> = { ...product };
      
      // 3. Procesar imagen principal si se proporciona
      if (mainImage) {
        if (currentProduct.imageUrl) {
          try {
            const oldImageRef = ref(this.storage, currentProduct.imageUrl);
            await deleteObject(oldImageRef);
          } catch (e) {
            console.warn('No se pudo eliminar la imagen anterior:', e);
          }
        }
        updatedData.imageUrl = await this.uploadCompressedImage(`products/${id}/main.webp`, mainImage);
      }
      
      // 4. Procesar colores y sus imágenes
      if (product.colors && colorImages && colorImages.size > 0) {
        const updatedColors = [...product.colors];
        
        for (let i = 0; i < updatedColors.length; i++) {
          const colorFile = colorImages.get(updatedColors[i].name);
          
          if (colorFile) {
            const currentColor = currentProduct.colors.find(c => c.name === updatedColors[i].name);
            
            if (currentColor?.imageUrl) {
              try {
                const oldColorRef = ref(this.storage, currentColor.imageUrl);
                await deleteObject(oldColorRef);
              } catch (e) {
                console.warn(`No se pudo eliminar la imagen del color ${updatedColors[i].name}:`, e);
              }
            }
            
            updatedColors[i].imageUrl = await this.uploadCompressedImage(
              `products/${id}/colors/${updatedColors[i].name.toLowerCase()}.webp`,
              colorFile
            );
          } else if (!updatedColors[i].imageUrl) {
            // Mantener la URL de imagen existente si no se proporciona una nueva
            const existingColor = currentProduct.colors.find(c => c.name === updatedColors[i].name);
            if (existingColor) {
              updatedColors[i].imageUrl = existingColor.imageUrl;
            }
          }
        }
        
        updatedData.colors = updatedColors;
      }
      
      // 5. Procesar tamaños y sus imágenes
      if (product.sizes && sizeImages && sizeImages.size > 0) {
        const updatedSizes = [...product.sizes];
        
        for (let i = 0; i < updatedSizes.length; i++) {
          const sizeFile = sizeImages.get(updatedSizes[i].name);
          
          if (sizeFile) {
            const currentSize = currentProduct.sizes.find(s => s.name === updatedSizes[i].name);
            
            if (currentSize?.imageUrl) {
              try {
                const oldSizeRef = ref(this.storage, currentSize.imageUrl);
                await deleteObject(oldSizeRef);
              } catch (e) {
                console.warn(`No se pudo eliminar la imagen de la talla ${updatedSizes[i].name}:`, e);
              }
            }
            
            updatedSizes[i].imageUrl = await this.uploadCompressedImage(
              `products/${id}/sizes/${updatedSizes[i].name.toLowerCase()}.webp`,
              sizeFile
            );
          }
        }
        
        updatedData.sizes = updatedSizes;
      }
      
      // 6. Actualizar stock total si se han modificado tamaños
      if (product.sizes) {
        updatedData.totalStock = product.sizes.reduce((sum, size) => sum + size.stock, 0);
      }
      
      // 7. Actualizar el producto base
      await updateDoc(docRef, updatedData);
      
      // 8. Actualizar variantes si se proporcionan imágenes de variantes
      if (variantImages && variantImages.size > 0) {
        const batch = writeBatch(this.firestore);
        
        for (const [variantId, imageFile] of variantImages.entries()) {
          const variantRef = doc(this.firestore, this.variantsCollectionName, variantId);
          const variantSnap = await getDoc(variantRef);
          
          if (variantSnap.exists()) {
            const variant = variantSnap.data() as ProductVariant;
            
            // Eliminar imagen antigua si existe
            if (variant.imageUrl && variant.imageUrl !== currentProduct.imageUrl && 
                !currentProduct.colors.some(c => c.imageUrl === variant.imageUrl)) {
              try {
                const oldVariantImageRef = ref(this.storage, variant.imageUrl);
                await deleteObject(oldVariantImageRef);
              } catch (e) {
                console.warn(`No se pudo eliminar la imagen de la variante ${variantId}:`, e);
              }
            }
            
            // Subir nueva imagen
            const newImageUrl = await this.uploadCompressedImage(
              `products/${id}/variants/${variantId}.webp`,
              imageFile
            );
            
            batch.update(variantRef, { imageUrl: newImageUrl });
          }
        }
        
        await batch.commit();
      }
      
      this.invalidateCache();
      
    } catch (error: any) {
      throw new Error(`Error al actualizar el producto ${id}: ${error.message}`);
    }
  }

  // ELIMINAR PRODUCTO Y RECURSOS RELACIONADOS
  async deleteProduct(id: string): Promise<void> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    
    try {
      const product = await this.getProductById(id);
      if (!product) {
        throw new Error(`El producto con ID ${id} no existe.`);
      }
      
      // 1. Eliminar la imagen principal
      if (product.imageUrl) {
        try {
          const mainImageRef = ref(this.storage, product.imageUrl);
          await deleteObject(mainImageRef);
        } catch (e) {
          console.warn('No se pudo eliminar la imagen principal:', e);
        }
      }
      
      // 2. Eliminar imágenes de colores
      for (const color of product.colors) {
        if (color.imageUrl) {
          try {
            const colorImageRef = ref(this.storage, color.imageUrl);
            await deleteObject(colorImageRef);
          } catch (e) {
            console.warn(`No se pudo eliminar la imagen del color ${color.name}:`, e);
          }
        }
      }
      
      // 3. Eliminar imágenes de tallas
      for (const size of product.sizes) {
        if (size.imageUrl) {
          try {
            const sizeImageRef = ref(this.storage, size.imageUrl);
            await deleteObject(sizeImageRef);
          } catch (e) {
            console.warn(`No se pudo eliminar la imagen de la talla ${size.name}:`, e);
          }
        }
      }
      
      // 4. Obtener y eliminar variantes
      const variantsRef = collection(this.firestore, this.variantsCollectionName);
      const q = query(variantsRef, where('productId', '==', id));
      const variantsSnap = await getDocs(q);
      
      const batch = writeBatch(this.firestore);
      
      for (const variantDoc of variantsSnap.docs) {
        const variant = variantDoc.data() as ProductVariant;
        
        // Eliminar imagen de variante si es única
        if (variant.imageUrl && 
            variant.imageUrl !== product.imageUrl && 
            !product.colors.some(c => c.imageUrl === variant.imageUrl)) {
          try {
            const variantImageRef = ref(this.storage, variant.imageUrl);
            await deleteObject(variantImageRef);
          } catch (e) {
            console.warn(`No se pudo eliminar la imagen de la variante ${variant.id}:`, e);
          }
        }
        
        // Marcar para eliminación
        batch.delete(variantDoc.ref);
      }
      
      // 5. Eliminar el producto
      batch.delete(docRef);
      
      // 6. Ejecutar el lote
      await batch.commit();
      
      this.invalidateCache();
      
    } catch (error: any) {
      throw new Error(`Error al eliminar el producto ${id}: ${error.message}`);
    }
  }

  // MANEJO DE PROMOCIONES
  async createPromotion(promotion: Omit<Promotion, 'id'>): Promise<string> {
    const promotionsRef = collection(this.firestore, this.promotionsCollectionName);
    try {
      const docRef = await addDoc(promotionsRef, promotion);
      this.invalidateCache(); // Las promociones afectan a los precios mostrados
      return docRef.id;
    } catch (error: any) {
      throw new Error(`Error al crear la promoción: ${error.message}`);
    }
  }
  
  async updatePromotion(id: string, promotion: Partial<Promotion>): Promise<void> {
    const docRef = doc(this.firestore, this.promotionsCollectionName, id);
    try {
      await updateDoc(docRef, promotion);
      this.invalidateCache();
    } catch (error: any) {
      throw new Error(`Error al actualizar la promoción ${id}: ${error.message}`);
    }
  }
  
  async deletePromotion(id: string): Promise<void> {
    const docRef = doc(this.firestore, this.promotionsCollectionName, id);
    try {
      await deleteDoc(docRef);
      this.invalidateCache();
    } catch (error: any) {
      throw new Error(`Error al eliminar la promoción ${id}: ${error.message}`);
    }
  }
  
  getActivePromotions(): Observable<Promotion[]> {
    const now = new Date();
    const promotionsRef = collection(this.firestore, this.promotionsCollectionName);
    const q = query(
      promotionsRef, 
      where('isActive', '==', true),
      where('endDate', '>', now)
    );
    
    return collectionData(q, { idField: 'id' }) as Observable<Promotion[]>;
  }

  // MANEJO DE STOCK
  async updateStock(
    productId: string, 
    variantId: string, 
    quantity: number
  ): Promise<void> {
    const batch = writeBatch(this.firestore);
    
    // Actualizar stock de la variante
    const variantRef = doc(this.firestore, this.variantsCollectionName, variantId);
    batch.update(variantRef, { stock: increment(quantity) });
    
    // Actualizar stock total del producto
    const productRef = doc(this.firestore, this.collectionName, productId);
    batch.update(productRef, { 
      totalStock: increment(quantity),
      lastRestockDate: new Date()
    });
    
    await batch.commit();
    this.invalidateCache();
  }
  
  async registerSale(
    productId: string, 
    variants: { variantId: string, quantity: number }[]
  ): Promise<void> {
    const batch = writeBatch(this.firestore);
    let totalQuantity = 0;
    
    // Actualizar stock de cada variante
    for (const item of variants) {
      const variantRef = doc(this.firestore, this.variantsCollectionName, item.variantId);
      batch.update(variantRef, { stock: increment(-item.quantity) });
      totalQuantity += item.quantity;
    }
    
    // Actualizar el producto
    const productRef = doc(this.firestore, this.collectionName, productId);
    batch.update(productRef, { 
      totalStock: increment(-totalQuantity),
      sales: increment(totalQuantity)
    });
    
    // Calcular y actualizar puntuación de popularidad
    // (Fórmula personalizada basada en ventas y vistas)
    const productDoc = await getDoc(productRef);
    if (productDoc.exists()) {
      const productData = productDoc.data();
      const views = productData['views'] || 0;
      const previousSales = productData['sales'] || 0;
      const newSales = previousSales + totalQuantity;
      
      // La popularidad se calcula con ventas y vistas
      const popularityScore = (newSales * 5) + (views * 0.1);
      batch.update(productRef, { popularityScore });
    }
    
    await batch.commit();
    this.invalidateCache();
  }
  
  // UTILIDADES
  
  // Invalidar caché de productos
  private invalidateCache() {
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
  
  // Calcular precios con descuento para array de productos
  private calculateDiscountedPrices(products: Product[]): Product[] {
    return products.map(product => this.calculateDiscountedPrice(product));
  }
  
  // Calcular precio con descuento para un producto
  private calculateDiscountedPrice(product: Product): Product {
    // Si ya tiene un precio con descuento configurado manualmente, respetarlo
    if (product.currentPrice !== undefined && product.discountPercentage !== undefined) {
      return product;
    }
    
    // Verificar si hay promociones activas
    if (product.promotions && product.promotions.length > 0) {
      const now = new Date();
      
      // Encontrar la promoción con mayor descuento aplicable
      let bestDiscount = 0;
      let bestDiscountAmount = 0;
      
      for (const promo of product.promotions) {
        if (promo.isActive && 
            promo.startDate <= now && 
            promo.endDate >= now) {
          
          let discountAmount = 0;
          
          if (promo.discountType === 'percentage') {
            discountAmount = (product.price * promo.discountValue) / 100;
            // Aplicar límite si existe
            if (promo.maxDiscountAmount && discountAmount > promo.maxDiscountAmount) {
              discountAmount = promo.maxDiscountAmount;
            }
          } else { // fixed
            discountAmount = promo.discountValue;
          }
          
          // Actualizar si encontramos un mejor descuento
          if (discountAmount > bestDiscountAmount) {
            bestDiscountAmount = discountAmount;
            bestDiscount = promo.discountType === 'percentage' ? promo.discountValue : 
              Math.round((discountAmount / product.price) * 100);
          }
        }
      }
      
      // Aplicar el mejor descuento encontrado
      if (bestDiscountAmount > 0) {
        const discountedPrice = Math.max(0, product.price - bestDiscountAmount);
        return {
          ...product,
          originalPrice: product.price,
          currentPrice: discountedPrice,
          discountPercentage: bestDiscount
        };
      }
    }
    
    // Si no hay promociones o no son aplicables
    if (product.originalPrice && product.price < product.originalPrice) {
      // Calcular el porcentaje de descuento si hay precio original
      const discountPercentage = Math.round(
        ((product.originalPrice - product.price) / product.originalPrice) * 100
      );
      return {
        ...product,
        currentPrice: product.price,
        discountPercentage: discountPercentage
      };
    }
    
    // Sin descuento
    return {
      ...product,
      currentPrice: product.price,
      discountPercentage: 0
    };
  }
  
  // MANEJO DE IMÁGENES
  
  // Subir imagen a Storage sin compresión
  private async uploadImage(path: string, file: File): Promise<string> {
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }
  
  // Subir imagen con compresión y formato webp (reutilizando el código del CategoryService)
  private async uploadCompressedImage(path: string, file: File): Promise<string> {
    const compressed = await this.compressImage(file);
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, compressed);
    return await getDownloadURL(storageRef);
  }
  
  // Comprimir imagen y convertir a webp
  private async compressImage(file: File): Promise<Blob> {
    const img = new Image();
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = () => (img.src = reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No se pudo obtener el contexto del canvas');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject('Error al comprimir imagen')),
          'image/webp',
          0.8
        );
      };
    });
  }
  
  // FUNCIONES ADICIONALES
  
  // Productos relacionados basados en categoría y etiquetas
  getRelatedProducts(productId: string, categoryId: string, tags: string[], limit: number = 4): Observable<Product[]> {
    return this.getProducts().pipe(
      map(products => {
        // Filtrar el producto actual
        const filteredProducts = products.filter(p => p.id !== productId);
        
        // Priorizar productos con la misma categoría
        const sameCategory = filteredProducts.filter(p => p.category === categoryId);
        
        // Añadir puntuación por etiquetas coincidentes
        const scored = sameCategory.map(product => {
          const matchingTags = product.tags.filter(tag => tags.includes(tag)).length;
          return { product, score: matchingTags };
        });
        
        // Ordenar por puntuación de etiquetas coincidentes y popularidad
        return scored
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return (b.product.popularityScore || 0) - (a.product.popularityScore || 0);
          })
          .map(item => item.product)
          .slice(0, limit);
      })
    );
  }
  
  // Obtener productos más vendidos
  getBestSellers(limit: number = 8): Observable<Product[]> {
    return this.getProducts().pipe(
      map(products => {
        return products
          .sort((a, b) => (b.sales || 0) - (a.sales || 0))
          .slice(0, limit);
      }),
      map(products => this.calculateDiscountedPrices(products))
    );
  }
  
  // Obtener productos nuevos
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
      map(products => this.calculateDiscountedPrices(products))
    );
  }
  
  // Obtener productos con descuento
  getDiscountedProducts(limit: number = 8): Observable<Product[]> {
    return this.getProducts().pipe(
      map(products => this.calculateDiscountedPrices(products)),
      map(products => {
        return products
          .filter(p => (p.discountPercentage || 0) > 0)
          .sort((a, b) => (b.discountPercentage || 0) - (a.discountPercentage || 0))
          .slice(0, limit);
      })
    );
  }
  
  // Estadísticas de productos
  getProductStats(): Observable<{
    totalProducts: number;
    totalStock: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    averageRating: number;
  }> {
    return this.getProducts().pipe(
      map(products => {
        const totalProducts = products.length;
        const totalStock = products.reduce((sum, product) => sum + (product.totalStock || 0), 0);
        const lowStockProducts = products.filter(p => p.totalStock > 0 && p.totalStock < 10).length;
        const outOfStockProducts = products.filter(p => p.totalStock <= 0).length;
        
        const ratings = products.map(p => p.rating).filter(rating => rating > 0);
        const averageRating = ratings.length > 0 
          ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length 
          : 0;
        
        return {
          totalProducts,
          totalStock,
          lowStockProducts,
          outOfStockProducts,
          averageRating: parseFloat(averageRating.toFixed(1))
        };
      })
    );
  }
  
  // Importación masiva de productos
  async importProducts(products: Omit<Product, 'id' | 'imageUrl'>[], images: Map<string, File>): Promise<number> {
    let successCount = 0;
    const batch = writeBatch(this.firestore);
    
    for (const product of products) {
      try {
        // Generar ID para el producto
        const id = uuidv4();
        const productsRef = doc(this.firestore, this.collectionName, id);
        
        // Si hay imagen para este producto
        let imageUrl = '';
        const imageKey = product.sku || product.name;
        const image = images.get(imageKey);
        
        if (image) {
          imageUrl = await this.uploadCompressedImage(`products/${id}/main.webp`, image);
        }
        
        // Crear el documento
        batch.set(productsRef, {
          ...product,
          imageUrl,
          views: 0,
          sales: 0,
          totalStock: product.sizes?.reduce((sum: number, size) => sum + size.stock, 0) || 0,
          releaseDate: product.releaseDate || new Date(),
          popularityScore: 0
        });
        
        successCount++;
      } catch (error) {
        console.error(`Error importando producto ${product.name}:`, error);
        // Continuar con el siguiente producto
      }
    }
    
    // Commit del batch
    await batch.commit();
    this.invalidateCache();
    
    return successCount;
  }
  
  // ANÁLISIS Y REPORTES
  
  // Productos más vistos
  getMostViewedProducts(limit: number = 10): Observable<Product[]> {
    return this.getProducts().pipe(
      map(products => {
        return products
          .sort((a, b) => (b.views || 0) - (a.views || 0))
          .slice(0, limit);
      })
    );
  }
  
  // Análisis de stock por categoría
  getStockAnalysisByCategory(): Observable<{category: string, totalStock: number, products: number}[]> {
    return this.getProducts().pipe(
      map(products => {
        const categories = [...new Set(products.map(p => p.category))];
        return categories.map(category => {
          const categoryProducts = products.filter(p => p.category === category);
          const totalStock = categoryProducts.reduce((sum, p) => sum + (p.totalStock || 0), 0);
          return {
            category,
            totalStock,
            products: categoryProducts.length
          };
        });
      })
    );
  }
  
  // Obtener productos por colección
  getProductsByCollection(collection: string): Observable<Product[]> {
    return this.getProducts().pipe(
      map(products => products.filter(p => p.collection === collection)),
      map(products => this.calculateDiscountedPrices(products))
    );
  }
  
  // Obtener productos por temporada
  getProductsBySeason(season: string): Observable<Product[]> {
    return this.getProducts().pipe(
      map(products => products.filter(p => p.season === season)),
      map(products => this.calculateDiscountedPrices(products))
    );
  }
  
  // Obtener el historial de ventas (simulado, se integraría con un servicio real de pedidos)
  getSalesHistory(productId: string, days: number = 30): Observable<{date: Date, sales: number}[]> {
    // Esta función simula los datos de ventas para un ejemplo
    // En una implementación real, se conectaría con un servicio de pedidos
    return of(Array.from({length: days}, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - i - 1));
      return {
        date,
        sales: Math.floor(Math.random() * 10) // Entre 0 y 9 ventas diarias (simulado)
      };
    }));
  }
}