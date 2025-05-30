import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc,
  getDoc, query, where, getDocs, writeBatch,
  updateDoc, increment, setDoc, deleteDoc
} from '@angular/fire/firestore';
import { v4 as uuidv4 } from 'uuid';

// Importar modelos según tu estructura de proyecto
import { ProductVariant, Color, Size } from '../../../models/models';
import { ProductImageService } from '../image/product-image.service';

@Injectable({
  providedIn: 'root'
})
export class ProductVariantService {
  // 🔧 CORRECCIÓN: Usar inject() para Firestore
  private firestore = inject(Firestore);
  
  private productsCollection = 'products';
  private variantsCollection = 'productVariants';

  constructor(
    private imageService: ProductImageService
  ) {
  }

  /**
   * Genera un ID único
   */
  generateId(): string {
    return uuidv4();
  }

  /**
   * 🚀 MEJORADO: Crea el producto base sin variantes
   */
  async createProductBase(id: string, productData: any): Promise<void> {
    if (!id || !productData) {
      throw new Error('ID y datos del producto son requeridos');
    }
    
    try {
      const docRef = doc(this.firestore, this.productsCollection, id);
      await setDoc(docRef, {
        ...productData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
    } catch (error) {
      console.error(`❌ VariantService: Error creando producto base ${id}:`, error);
      throw new Error(`Error al crear producto base: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Actualiza el producto base
   */
  async updateProductBase(id: string, productData: any): Promise<void> {
    if (!id || !productData) {
      throw new Error('ID y datos del producto son requeridos');
    }
    
    try {
      const docRef = doc(this.firestore, this.productsCollection, id);
      await updateDoc(docRef, {
        ...productData,
        updatedAt: new Date()
      });
      
    } catch (error) {
      console.error(`❌ VariantService: Error actualizando producto base ${id}:`, error);
      throw new Error(`Error al actualizar producto base: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Elimina un producto completo
   */
  async deleteProduct(id: string): Promise<void> {
    if (!id) {
      throw new Error('ID del producto es requerido');
    }
    
    try {
      // Primero eliminar todas las variantes
      await this.deleteProductVariants(id);
      
      // Luego eliminar el producto base
      const docRef = doc(this.firestore, this.productsCollection, id);
      await deleteDoc(docRef);
      
    } catch (error) {
      console.error(`❌ VariantService: Error eliminando producto ${id}:`, error);
      throw new Error(`Error al eliminar producto: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Obtiene todas las variantes de un producto
   */
  async getVariantsByProductId(productId: string): Promise<ProductVariant[]> {
    if (!productId) {
      console.warn('⚠️ VariantService: ProductId no proporcionado');
      return [];
    }
    
    try {
      const variantsRef = collection(this.firestore, this.variantsCollection);
      const q = query(variantsRef, where('productId', '==', productId));
      const snapshot = await getDocs(q);
      
      const variants = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductVariant));

      
      if (variants.length > 0) {
        variants.forEach(variant => {
          console.log(`   🧬 Variante: ${variant.colorName}-${variant.sizeName}, Stock: ${variant.stock}`);
        });
      }

      return variants;
    } catch (error) {
      throw new Error(`Error al obtener variantes: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Obtiene una variante específica por su ID
   */
  async getVariantById(variantId: string): Promise<ProductVariant | undefined> {
    if (!variantId) {
      return undefined;
    }


    try {
      const docRef = doc(this.firestore, this.variantsCollection, variantId);
      const docSnap = await getDoc(docRef);


      if (docSnap.exists()) {
        const data = docSnap.data();
        const variant = {
          id: docSnap.id,
          ...data
        } as ProductVariant;

        return variant;
      }

      return undefined;
    } catch (error) {
      console.error(`❌ VariantService: Error al obtener variante ${variantId}:`, error);
      throw new Error(`Error al obtener variante: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Procesa imágenes de colores y tallas para un producto
   */
  async processProductImages(
    productId: string,
    colors: Color[],
    sizes: Size[],
    colorImages?: Map<string, File>,
    sizeImages?: Map<string, File>
  ): Promise<{ colors: Color[], sizes: Size[] }> {
    if (!productId) {
      throw new Error('ProductId es requerido');
    }

    const updatedColors = [...colors];
    const updatedSizes = [...sizes];
    const uploadPromises: Promise<void>[] = [];

    // Procesar imágenes de colores
    if (colorImages && colorImages.size > 0) {
      
      for (let i = 0; i < updatedColors.length; i++) {
        const colorFile = colorImages.get(updatedColors[i].name);
        if (colorFile && colorFile.size > 0) {
          const colorIndex = i;
          const colorName = updatedColors[i].name;
                    
          const colorPromise = this.imageService.uploadCompressedImage(
            `products/${productId}/colors/${colorName.toLowerCase().replace(/\s+/g, '_')}.webp`,
            colorFile
          ).then(url => {
            updatedColors[colorIndex].imageUrl = url;
            console.log(`✅ VariantService: Imagen de color ${colorName} subida: ${url}`);
          }).catch(error => {
            console.error(`❌ VariantService: Error al subir imagen de color ${colorName}:`, error);
            // No lanzar error, solo continuar sin la imagen
          });

          uploadPromises.push(colorPromise);
        } else {
          console.log(`⚠️ VariantService: No hay imagen válida para color: ${updatedColors[i].name}`);
        }
      }
    }

    // Procesar imágenes de tallas
    if (sizeImages && sizeImages.size > 0) {
      
      for (let i = 0; i < updatedSizes.length; i++) {
        const sizeFile = sizeImages.get(updatedSizes[i].name);
        if (sizeFile && sizeFile.size > 0) {
          const sizeIndex = i;
          const sizeName = updatedSizes[i].name;
                    
          const sizePromise = this.imageService.uploadCompressedImage(
            `products/${productId}/sizes/${sizeName.toLowerCase().replace(/\s+/g, '_')}.webp`,
            sizeFile
          ).then(url => {
            updatedSizes[sizeIndex].imageUrl = url;
            console.log(`✅ VariantService: Imagen de talla ${sizeName} subida: ${url}`);
          }).catch(error => {
            console.error(`❌ VariantService: Error al subir imagen de talla ${sizeName}:`, error);
            // No lanzar error, solo continuar sin la imagen
          });

          uploadPromises.push(sizePromise);
        } else {
          console.log(`⚠️ VariantService: No hay imagen válida para talla: ${updatedSizes[i].name}`);
        }
      }
    }

    try {
      await Promise.all(uploadPromises);

      const colorsWithImages = updatedColors.filter(c => c.imageUrl).length;
      const sizesWithImages = updatedSizes.filter(s => s.imageUrl).length;

  

      return { colors: updatedColors, sizes: updatedSizes };
    } catch (error) {
      console.error(`❌ VariantService: Error en procesamiento de imágenes:`, error);
      throw new Error(`Error al procesar imágenes: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Crea las variantes de un producto
   */
  async createProductVariants(
    productId: string,
    colors: Color[],
    sizes: Size[],
    variantImages?: Map<string, File>,
    productSku?: string
  ): Promise<void> {
    if (!productId) {
      throw new Error('ProductId es requerido');
    }


    try {
      const batch = writeBatch(this.firestore);
      const variants: ProductVariant[] = [];
      const variantImagePromises: Promise<void>[] = [];

      // Verificar datos de entrada
      if (!colors || !colors.length || !sizes || !sizes.length) {
        console.warn('⚠️ VariantService: No hay colores o tallas para crear variantes');
        return;
      }

      let totalStock = 0;
      let variantsCreated = 0;
      let variantsSkipped = 0;

      for (const color of colors) {
        for (const size of sizes) {
          // Identificar stock específico para esta combinación color-talla
          let variantStock = 0;
          const colorStock = size.colorStocks?.find(cs => cs.colorName === color.name);
          if (colorStock) {
            variantStock = colorStock.quantity || 0;
          }

          // Solo crear variantes con stock > 0
          if (variantStock > 0) {
            const variantId = this.generateId();
            const variantSKU = productSku ?
              `${productSku}-${color.name}-${size.name}`.toUpperCase().replace(/\s+/g, '-') :
              `SKU-${variantId.substring(0, 8)}`;

            const variant: ProductVariant = {
              id: variantId,
              productId,
              colorName: color.name,
              colorCode: color.code,
              sizeName: size.name,
              stock: variantStock,
              sku: variantSKU,
              imageUrl: '' // Se establecerá después
            };


            // ========== LÓGICA CRÍTICA PARA IMÁGENES ==========

            // 1. Verificar si hay imagen específica para esta variante
            const variantImageKey = `${color.name}-${size.name}`;

            if (variantImages?.has(variantImageKey)) {
              const variantImage = variantImages.get(variantImageKey)!;
              
              const variantImagePromise = this.imageService.uploadVariantImage(
                productId,
                variantId,
                variantImage
              ).then(url => {
                variant.imageUrl = url;
              }).catch(error => {
                // Usar imagen de color como fallback
                variant.imageUrl = color.imageUrl || '';
              });

              variantImagePromises.push(variantImagePromise);
            } else {
              // 2. Usar imagen del color como fallback
              variant.imageUrl = color.imageUrl || '';
            }

            variants.push(variant);
            totalStock += variantStock;
            variantsCreated++;
          } else {
            console.log(`⚠️ VariantService: Saltando variante ${color.name}-${size.name} sin stock`);
            variantsSkipped++;
          }
        }
      }

      // Si no se creó ninguna variante, salir
      if (variants.length === 0) {
        console.warn(`❌ VariantService: No se crearon variantes para el producto ${productId}`);
        return;
      }

      // Esperar a que todas las imágenes de variantes estén listas
      await Promise.all(variantImagePromises);

      // Ahora crear todas las variantes en Firestore con las URLs correctas
      variants.forEach(variant => {
        const variantRef = doc(collection(this.firestore, this.variantsCollection), variant.id);
        batch.set(variantRef, {
          ...variant,
          createdAt: new Date()
        });
      });

      // Ejecutar la escritura por lotes
      await batch.commit();

      // Actualizar el producto con referencias a las variantes y stock total
      const productRef = doc(this.firestore, this.productsCollection, productId);
      await updateDoc(productRef, {
        variants: variants.map(v => v.id),
        totalStock: totalStock,
        updatedAt: new Date()
      });


    } catch (error) {
      console.error(`💥 VariantService: Error al crear variantes de producto ${productId}:`, error);
      throw new Error(`Error al crear variantes de producto: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Actualiza el stock de una variante
   */
  async updateVariantStock(variantId: string, newStock: number): Promise<void> {
    if (!variantId || newStock < 0) {
      throw new Error('VariantId es requerido y el stock no puede ser negativo');
    }
    
    try {
      const variantRef = doc(this.firestore, this.variantsCollection, variantId);
      await updateDoc(variantRef, { 
        stock: newStock,
        updatedAt: new Date()
      });
      
    } catch (error) {
      console.error(`❌ VariantService: Error actualizando stock de variante ${variantId}:`, error);
      throw new Error(`Error al actualizar stock: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Actualiza la imagen de una variante
   */
  async updateVariantImage(variantId: string, imageUrl: string): Promise<void> {
    if (!variantId || !imageUrl) {
      throw new Error('VariantId e imageUrl son requeridos');
    }
    
    try {
      const variantRef = doc(this.firestore, this.variantsCollection, variantId);
      await updateDoc(variantRef, { 
        imageUrl,
        updatedAt: new Date()
      });
      
    } catch (error) {
      console.error(`❌ VariantService: Error actualizando imagen de variante ${variantId}:`, error);
      throw new Error(`Error al actualizar imagen: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Incrementa o decrementa el stock de una variante
   */
  async updateStockQuantity(variantId: string, quantity: number): Promise<void> {
    if (!variantId || quantity === 0) {
      throw new Error('VariantId es requerido y la cantidad no puede ser 0');
    }

    
    try {
      const variantRef = doc(this.firestore, this.variantsCollection, variantId);
      await updateDoc(variantRef, { 
        stock: increment(quantity),
        updatedAt: new Date()
      });
      
    } catch (error) {
      console.error(`❌ VariantService: Error actualizando cantidad de stock para variante ${variantId}:`, error);
      throw new Error(`Error al actualizar cantidad de stock: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Incrementa el contador de vistas de un producto
   */
  async incrementProductViews(productId: string): Promise<void> {
    if (!productId) {
      console.warn('⚠️ VariantService: ProductId no proporcionado para incrementar vistas');
      return;
    }
    
    try {
      const docRef = doc(this.firestore, this.productsCollection, productId);
      await updateDoc(docRef, { 
        views: increment(1),
        lastViewedAt: new Date()
      });
      
    } catch (error) {
      console.error(`❌ VariantService: Error incrementando vistas para producto ${productId}:`, error);
      // No lanzar error aquí para no afectar la funcionalidad principal
    }
  }

  /**
   * 🚀 MEJORADO: Registra una venta actualizando stock y contadores
   */
  async registerSale(
    productId: string,
    variants: { variantId: string, quantity: number }[]
  ): Promise<void> {
    if (!productId || !variants || variants.length === 0) {
      throw new Error('ProductId y variants son requeridos');
    }


    try {
      const batch = writeBatch(this.firestore);
      let totalQuantity = 0;

      // Actualizar stock de cada variante
      for (const item of variants) {
        const variantRef = doc(this.firestore, this.variantsCollection, item.variantId);
        batch.update(variantRef, { 
          stock: increment(-item.quantity),
          updatedAt: new Date()
        });
        totalQuantity += item.quantity;
      }

      // Actualizar el producto
      const productRef = doc(this.firestore, this.productsCollection, productId);
      
      // Obtener datos actuales del producto para calcular popularidad
      const productDoc = await getDoc(productRef);
      if (productDoc.exists()) {
        const productData = productDoc.data();
        const views = productData['views'] || 0;
        const previousSales = productData['sales'] || 0;
        const newSales = previousSales + totalQuantity;

        // Calcular puntuación de popularidad
        const popularityScore = (newSales * 5) + (views * 0.1);

        batch.update(productRef, {
          totalStock: increment(-totalQuantity),
          sales: increment(totalQuantity),
          popularityScore,
          lastSaleAt: new Date(),
          updatedAt: new Date()
        });

      } else {
        // Si no existe el producto, solo actualizar stock y ventas
        batch.update(productRef, {
          totalStock: increment(-totalQuantity),
          sales: increment(totalQuantity),
          lastSaleAt: new Date(),
          updatedAt: new Date()
        });
      }

      await batch.commit();
      
    } catch (error) {
      console.error(`❌ VariantService: Error registrando venta para producto ${productId}:`, error);
      throw new Error(`Error al registrar venta: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Elimina todas las variantes de un producto
   */
  async deleteProductVariants(productId: string): Promise<void> {
    if (!productId) {
      throw new Error('ProductId es requerido');
    }
    
    try {
      const variantsRef = collection(this.firestore, this.variantsCollection);
      const q = query(variantsRef, where('productId', '==', productId));
      const snapshot = await getDocs(q);

      if (snapshot.docs.length === 0) {
        console.log(`ℹ️ VariantService: No hay variantes para eliminar del producto ${productId}`);
        return;
      }

      const batch = writeBatch(this.firestore);
      const imageDeletePromises: Promise<void>[] = [];

      // Procesar cada variante
      snapshot.docs.forEach((doc, index) => {
        const variantData = doc.data() as ProductVariant;
        
        // Eliminar imagen si existe
        if (variantData.imageUrl) {
          imageDeletePromises.push(
            this.imageService.deleteImageIfExists(variantData.imageUrl)
          );
        }
        
        batch.delete(doc.ref);
      });

      // Eliminar imágenes en paralelo
      if (imageDeletePromises.length > 0) {
        await Promise.all(imageDeletePromises);
      }

      // Ejecutar eliminación en lote
      await batch.commit();
      
    } catch (error) {
      console.error(`❌ VariantService: Error eliminando variantes del producto ${productId}:`, error);
      throw new Error(`Error al eliminar variantes: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Elimina una variante específica
   */
  async deleteVariant(variantId: string): Promise<void> {
    if (!variantId) {
      throw new Error('VariantId es requerido');
    }
   
    try {
      // Obtener información de la variante antes de eliminarla
      const variant = await this.getVariantById(variantId);
      if (!variant) {
        throw new Error('Variante no encontrada');
      }

      // Eliminar imagen asociada si existe
      if (variant.imageUrl) {
        console.log(`🖼️ VariantService: Eliminando imagen de variante: ${variant.imageUrl}`);
        await this.imageService.deleteImageIfExists(variant.imageUrl);
      }

      // Eliminar variante de Firestore
      const variantRef = doc(this.firestore, this.variantsCollection, variantId);
      await deleteDoc(variantRef);

      // Actualizar stock total del producto
      if (variant.productId && variant.stock) {
        const productRef = doc(this.firestore, this.productsCollection, variant.productId);
        await updateDoc(productRef, {
          totalStock: increment(-variant.stock),
          updatedAt: new Date()
        });
      }

    } catch (error) {
      console.error(`❌ VariantService: Error al eliminar variante ${variantId}:`, error);
      throw new Error(`Error al eliminar variante: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Obtiene todas las variantes con stock bajo
   */
  async getLowStockVariants(threshold: number = 5): Promise<ProductVariant[]> {
    if (threshold < 0) {
      throw new Error('El umbral no puede ser negativo');
    }
    
    try {
      const variantsRef = collection(this.firestore, this.variantsCollection);
      const q = query(
        variantsRef,
        where('stock', '<=', threshold),
        where('stock', '>', 0)
      );

      const snapshot = await getDocs(q);
      const variants = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductVariant));
      
      if (variants.length > 0) {
        variants.forEach(variant => {
          console.log(`   ⚠️ ${variant.colorName}-${variant.sizeName}: ${variant.stock} unidades`);
        });
      }

      return variants;
    } catch (error) {
      console.error(`❌ VariantService: Error al obtener variantes con stock bajo:`, error);
      return [];
    }
  }

  /**
   * 🚀 MEJORADO: Obtiene todas las variantes sin stock
   */
  async getOutOfStockVariants(): Promise<ProductVariant[]> {
    
    try {
      const variantsRef = collection(this.firestore, this.variantsCollection);
      const q = query(variantsRef, where('stock', '==', 0));

      const snapshot = await getDocs(q);
      const variants = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductVariant));
      
      if (variants.length > 0) {
        variants.forEach(variant => {
          console.log(`   🚫 ${variant.colorName}-${variant.sizeName}: Sin stock`);
        });
      }

      return variants;
    } catch (error) {
      console.error(`❌ VariantService: Error al obtener variantes sin stock:`, error);
      return [];
    }
  }

  /**
   * 🚀 MEJORADO: Obtiene todas las variantes
   */
  async getAllVariants(): Promise<ProductVariant[]> {
    
    try {
      const variantsRef = collection(this.firestore, this.variantsCollection);
      const snapshot = await getDocs(variantsRef);
      
      const variants = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductVariant));
      
      if (variants.length > 0) {
        // Estadísticas generales
        const withStock = variants.filter(v => v.stock > 0).length;
        const withoutStock = variants.filter(v => v.stock === 0).length;
        const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
        
      }

      return variants;
    } catch (error) {
      console.error(`❌ VariantService: Error al obtener todas las variantes:`, error);
      return [];
    }
  }

  /**
   * 🆕 NUEVO: Obtiene variantes por color específico
   */
  async getVariantsByColor(colorName: string): Promise<ProductVariant[]> {
    if (!colorName) {
      console.warn('⚠️ VariantService: ColorName no proporcionado');
      return [];
    }
    
    try {
      const variantsRef = collection(this.firestore, this.variantsCollection);
      const q = query(variantsRef, where('colorName', '==', colorName));
      const snapshot = await getDocs(q);
      
      const variants = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductVariant));

      return variants;
    } catch (error) {
      console.error(`❌ VariantService: Error obteniendo variantes por color ${colorName}:`, error);
      return [];
    }
  }

  /**
   * 🆕 NUEVO: Obtiene variantes por talla específica
   */
  async getVariantsBySize(sizeName: string): Promise<ProductVariant[]> {
    if (!sizeName) {
      console.warn('⚠️ VariantService: SizeName no proporcionado');
      return [];
    }
    
    try {
      const variantsRef = collection(this.firestore, this.variantsCollection);
      const q = query(variantsRef, where('sizeName', '==', sizeName));
      const snapshot = await getDocs(q);
      
      const variants = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductVariant));

      return variants;
    } catch (error) {
      console.error(`❌ VariantService: Error obteniendo variantes por talla ${sizeName}:`, error);
      return [];
    }
  }

  /**
   * 🆕 NUEVO: Obtiene el stock total por producto
   */
  async getTotalStockByProduct(productId: string): Promise<number> {
    if (!productId) {
      return 0;
    }
    
    try {
      const variants = await this.getVariantsByProductId(productId);
      const totalStock = variants.reduce((sum, variant) => sum + variant.stock, 0);
      
      return totalStock;
    } catch (error) {
      console.error(`❌ VariantService: Error calculando stock total para producto ${productId}:`, error);
      return 0;
    }
  }

  /**
   * 🆕 NUEVO: Verifica disponibilidad de una variante específica
   */
  async checkVariantAvailability(
    productId: string, 
    colorName: string, 
    sizeName: string, 
    requiredQuantity: number = 1
  ): Promise<{ available: boolean; currentStock: number; variant?: ProductVariant }> {
    
    try {
      const variants = await this.getVariantsByProductId(productId);
      const variant = variants.find(v => v.colorName === colorName && v.sizeName === sizeName);
      
      if (!variant) {
        return { available: false, currentStock: 0 };
      }

      const available = variant.stock >= requiredQuantity;
      
      
      return {
        available,
        currentStock: variant.stock,
        variant
      };
    } catch (error) {
      console.error(`❌ VariantService: Error verificando disponibilidad:`, error);
      return { available: false, currentStock: 0 };
    }
  }

  /**
   * 🆕 NUEVO: Reabastece stock de múltiples variantes
   */
  async restockVariants(restockData: { variantId: string; quantity: number }[]): Promise<void> {
    if (!restockData || restockData.length === 0) {
      throw new Error('Datos de reabastecimiento son requeridos');
    }
    
    try {
      const batch = writeBatch(this.firestore);
      let totalAdded = 0;

      for (const item of restockData) {
        if (item.quantity <= 0) {
          console.warn(`⚠️ VariantService: Saltando variante ${item.variantId} - cantidad inválida: ${item.quantity}`);
          continue;
        }

        const variantRef = doc(this.firestore, this.variantsCollection, item.variantId);
        batch.update(variantRef, {
          stock: increment(item.quantity),
          lastRestockedAt: new Date(),
          updatedAt: new Date()
        });

        totalAdded += item.quantity;
      }

      await batch.commit();
      
      console.log(`🎉 VariantService: Reabastecimiento completado - ${totalAdded} unidades agregadas en total`);
    } catch (error) {
      console.error(`❌ VariantService: Error en reabastecimiento:`, error);
      throw new Error(`Error al reabastecer variantes: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🆕 NUEVO: Obtiene estadísticas de inventario
   */
  async getInventoryStats(): Promise<{
    totalVariants: number;
    variantsWithStock: number;
    variantsOutOfStock: number;
    totalStock: number;
    lowStockVariants: number;
    averageStockPerVariant: number;
  }> {
    
    try {
      const [allVariants, lowStockVariants] = await Promise.all([
        this.getAllVariants(),
        this.getLowStockVariants()
      ]);

      const totalVariants = allVariants.length;
      const variantsWithStock = allVariants.filter(v => v.stock > 0).length;
      const variantsOutOfStock = allVariants.filter(v => v.stock === 0).length;
      const totalStock = allVariants.reduce((sum, v) => sum + v.stock, 0);
      const averageStockPerVariant = totalVariants > 0 ? totalStock / totalVariants : 0;

      const stats = {
        totalVariants,
        variantsWithStock,
        variantsOutOfStock,
        totalStock,
        lowStockVariants: lowStockVariants.length,
        averageStockPerVariant: Math.round(averageStockPerVariant * 100) / 100
      };

      return stats;
    } catch (error) {
      console.error(`❌ VariantService: Error calculando estadísticas:`, error);
      throw new Error(`Error al calcular estadísticas: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🆕 NUEVO: Método de debugging para ver el estado del servicio
   */
  debugVariantService(): void {
    console.group('🧬 [VARIANT SERVICE DEBUG] Estado del servicio');
    
    // Información de conexiones
    console.log('🔧 Configuración:');
    console.log(`   📦 Colección de productos: ${this.productsCollection}`);
    console.log(`   🧬 Colección de variantes: ${this.variantsCollection}`);
    console.log(`   🔥 Firestore:`, this.firestore ? '✅ Conectado' : '❌ No conectado');
    console.log(`   📸 ImageService:`, this.imageService ? '✅ Disponible' : '❌ No disponible');
    
    // Obtener estadísticas
    this.getInventoryStats().then(stats => {
      console.log('📊 Estadísticas actuales:');
      console.table(stats);
    }).catch(error => {
      console.error('❌ Error obteniendo estadísticas:', error);
    });
    
    console.groupEnd();
  }

  /**
   * 🆕 NUEVO: Exporta datos de variantes para backup o análisis
   */
  async exportVariantsData(productId?: string): Promise<ProductVariant[]> {
    
    try {
      const variants = productId 
        ? await this.getVariantsByProductId(productId)
        : await this.getAllVariants();
        
      return variants;
    } catch (error) {
      console.error(`❌ VariantService: Error exportando datos:`, error);
      throw new Error(`Error al exportar datos: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }
}