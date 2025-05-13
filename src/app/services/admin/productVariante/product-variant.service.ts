import { Injectable } from '@angular/core';
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
  private productsCollection = 'products';
  private variantsCollection = 'productVariants';

  constructor(
    private firestore: Firestore,
    private imageService: ProductImageService
  ) { }

  /**
   * Genera un ID único
   */
  generateId(): string {
    return uuidv4();
  }

  /**
   * Crea el producto base sin variantes
   */
  async createProductBase(id: string, productData: any): Promise<void> {
    const docRef = doc(this.firestore, this.productsCollection, id);
    await setDoc(docRef, productData);
  }

  /**
   * Actualiza el producto base
   */
  async updateProductBase(id: string, productData: any): Promise<void> {
    const docRef = doc(this.firestore, this.productsCollection, id);
    await updateDoc(docRef, productData);
  }

  /**
   * Elimina un producto completo
   */
  async deleteProduct(id: string): Promise<void> {
    const docRef = doc(this.firestore, this.productsCollection, id);
    await deleteDoc(docRef);
  }

  /**
   * Obtiene todas las variantes de un producto
   */
  getVariantsByProductId(productId: string): Promise<ProductVariant[]> {
    const variantsRef = collection(this.firestore, this.variantsCollection);
    const q = query(variantsRef, where('productId', '==', productId));

    return getDocs(q).then(snapshot => {
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductVariant));
    });
  }

  /**
   * Obtiene una variante específica por su ID
   */
  // En ProductVariantService
  async getVariantById(variantId: string): Promise<ProductVariant | undefined> {
    console.log('Buscando variante con ID:', variantId);

    try {
      const docRef = doc(this.firestore, this.variantsCollection, variantId);
      const docSnap = await getDoc(docRef);

      console.log('Resultado de Firestore:', docSnap.exists(), docSnap.data());

      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data
        } as ProductVariant;
      }

      console.warn('No se encontró la variante en Firestore:', variantId);
      return undefined;
    } catch (error) {
      console.error('Error al obtener variante:', error);
      throw error;
    }
  }

  /**
   * Crea las variantes de un producto
   */
  async createProductVariants(
    productId: string,
    colors: Color[],
    sizes: Size[],
    variantImages?: Map<string, File>,
    productSku?: string
  ): Promise<void> {
    const batch = writeBatch(this.firestore);
    const variants: ProductVariant[] = [];
    const variantImagePromises: Promise<void>[] = [];

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
          const variantId = this.generateId();
          const variantSKU = productSku ?
            `${productSku}-${color.name}-${size.name}`.toUpperCase() :
            `SKU-${variantId.substring(0, 8)}`;

          const variant: ProductVariant = {
            id: variantId,
            productId,
            colorName: color.name,
            colorCode: color.code,
            sizeName: size.name,
            stock: variantStock,
            sku: variantSKU,
            imageUrl: color.imageUrl || '' // Se actualizará si hay imagen específica
          };

          // Verificar si hay una imagen específica para esta variante
          const variantImageKey = `${color.name}-${size.name}`;
          if (variantImages?.has(variantImageKey)) {
            const variantImage = variantImages.get(variantImageKey)!;
            const variantImagePromise = this.imageService.uploadVariantImage(
              productId,
              variantId,
              variantImage
            )
              .then(url => {
                variant.imageUrl = url;
              });

            variantImagePromises.push(variantImagePromise);
          }

          // Agregar la variante a la lista
          variants.push(variant);
          const variantRef = doc(collection(this.firestore, this.variantsCollection));

          // Posponer la escritura por lotes hasta que todas las imágenes estén listas
          variantImagePromises.push(
            new Promise<void>(async (resolve) => {
              batch.set(variantRef, {
                ...variant,
                productId
              });
              resolve();
            })
          );
        }
      }
    }

    // Esperar a que todas las imágenes de variantes estén listas
    await Promise.all(variantImagePromises);

    // Ejecutar la escritura por lotes
    await batch.commit();

    // Actualizar el producto con referencias a las variantes
    const productRef = doc(this.firestore, this.productsCollection, productId);
    await updateDoc(productRef, {
      variants: variants.map(v => v.id)
    });
  }

  /**
   * Actualiza el stock de una variante
   */
  async updateVariantStock(variantId: string, newStock: number): Promise<void> {
    const variantRef = doc(this.firestore, this.variantsCollection, variantId);
    await updateDoc(variantRef, { stock: newStock });
  }

  /**
   * Actualiza la imagen de una variante
   */
  async updateVariantImage(variantId: string, imageUrl: string): Promise<void> {
    const variantRef = doc(this.firestore, this.variantsCollection, variantId);
    await updateDoc(variantRef, { imageUrl });
  }

  /**
   * Incrementa o decrementa el stock de una variante
   */
  async updateStockQuantity(variantId: string, quantity: number): Promise<void> {
    const variantRef = doc(this.firestore, this.variantsCollection, variantId);
    await updateDoc(variantRef, { stock: increment(quantity) });
  }

  /**
   * Incrementa el contador de vistas de un producto
   */
  async incrementProductViews(productId: string): Promise<void> {
    const docRef = doc(this.firestore, this.productsCollection, productId);
    await updateDoc(docRef, { views: increment(1) });
  }

  /**
   * Registra una venta actualizando stock y contadores
   */
  async registerSale(
    productId: string,
    variants: { variantId: string, quantity: number }[]
  ): Promise<void> {
    const batch = writeBatch(this.firestore);
    let totalQuantity = 0;

    // Actualizar stock de cada variante
    for (const item of variants) {
      const variantRef = doc(this.firestore, this.variantsCollection, item.variantId);
      batch.update(variantRef, { stock: increment(-item.quantity) });
      totalQuantity += item.quantity;
    }

    // Actualizar el producto
    const productRef = doc(this.firestore, this.productsCollection, productId);
    batch.update(productRef, {
      totalStock: increment(-totalQuantity),
      sales: increment(totalQuantity)
    });

    // Actualizar puntuación de popularidad
    const productDoc = await getDoc(productRef);
    if (productDoc.exists()) {
      const productData = productDoc.data();
      const views = productData['views'] || 0;
      const previousSales = productData['sales'] || 0;
      const newSales = previousSales + totalQuantity;

      const popularityScore = (newSales * 5) + (views * 0.1);
      batch.update(productRef, { popularityScore });
    }

    await batch.commit();
  }

  /**
   * Elimina todas las variantes de un producto
   */
  async deleteProductVariants(productId: string): Promise<void> {
    const variantsRef = collection(this.firestore, this.variantsCollection);
    const q = query(variantsRef, where('productId', '==', productId));
    const snapshot = await getDocs(q);

    const batch = writeBatch(this.firestore);
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }

  /**
   * Obtiene todas las variantes con stock bajo
   */
  async getLowStockVariants(threshold: number = 5): Promise<ProductVariant[]> {
    const variantsRef = collection(this.firestore, this.variantsCollection);
    const q = query(
      variantsRef,
      where('stock', '<=', threshold),
      where('stock', '>', 0)
    );

    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductVariant));
    } catch (error) {
      console.error('Error al obtener variantes con stock bajo:', error);
      return [];
    }
  }

  /**
   * Obtiene todas las variantes sin stock
   */
  async getOutOfStockVariants(): Promise<ProductVariant[]> {
    const variantsRef = collection(this.firestore, this.variantsCollection);
    const q = query(variantsRef, where('stock', '==', 0));

    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductVariant));
    } catch (error) {
      console.error('Error al obtener variantes sin stock:', error);
      return [];
    }
  }

  /**
   * Obtiene todas las variantes
   */
  async getAllVariants(): Promise<ProductVariant[]> {
    const variantsRef = collection(this.firestore, this.variantsCollection);

    try {
      const snapshot = await getDocs(variantsRef);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductVariant));
    } catch (error) {
      console.error('Error al obtener todas las variantes:', error);
      return [];
    }
  }
}