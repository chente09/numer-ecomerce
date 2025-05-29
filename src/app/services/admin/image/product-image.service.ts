import { Injectable } from '@angular/core';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Color, Size } from '../../../models/models';
interface ImageUploadResult {
  url: string;
  path: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProductImageService {
  constructor(private storage: Storage) { }

  /**
   * Sube la imagen principal de un producto
   */
  async uploadProductImage(productId: string, file: File): Promise<string> {
    const path = `products/${productId}/main.webp`;
    return this.uploadCompressedImage(path, file);
  }


  /**
   * Procesa todas las imágenes de colores y tallas
   */
  async processProductImages(
    productId: string,
    colors: Color[],
    sizes: Size[],
    colorImages?: Map<string, File>,
    sizeImages?: Map<string, File>
  ): Promise<{ colors: Color[], sizes: Size[] }> {
    const updatedColors = [...colors];
    const updatedSizes = [...sizes];
    const uploadPromises: Promise<void>[] = [];

    // Procesar imágenes de colores
    if (colorImages && colorImages.size > 0) {
      for (let i = 0; i < updatedColors.length; i++) {
        const colorFile = colorImages.get(updatedColors[i].name);
        if (colorFile) {
          const colorIndex = i;
          const colorPromise = this.uploadCompressedImage(
            `products/${productId}/colors/${updatedColors[i].name.toLowerCase()}.webp`,
            colorFile
          ).then(url => {
            updatedColors[colorIndex].imageUrl = url;
          });
          uploadPromises.push(colorPromise);
        }
      }
    }

    // Procesar imágenes de tallas
    if (sizeImages && sizeImages.size > 0) {
      for (let i = 0; i < updatedSizes.length; i++) {
        const sizeFile = sizeImages.get(updatedSizes[i].name);
        if (sizeFile) {
          const sizeIndex = i;
          const sizePromise = this.uploadCompressedImage(
            `products/${productId}/sizes/${updatedSizes[i].name.toLowerCase()}.webp`,
            sizeFile
          ).then(url => {
            updatedSizes[sizeIndex].imageUrl = url;
          });
          uploadPromises.push(sizePromise);
        }
      }
    }

    // Esperar a que todas las imágenes se suban
    await Promise.all(uploadPromises);

    return { colors: updatedColors, sizes: updatedSizes };
  }

  /**
   * Sube una imagen para una variante de producto
   */
  async uploadVariantImage(productId: string, variantId: string, file: File): Promise<string> {
    const path = `products/${productId}/variants/${variantId}.webp`;
    return this.uploadCompressedImage(path, file);
  }
  /**
   * Sube múltiples imágenes adicionales para un producto
   */
  async uploadAdditionalImages(productId: string, files: File[]): Promise<string[]> {
    if (!files || files.length === 0) {
      return [];
    }

    const uploadPromises = files.map((file, index) => {
      const path = `products/${productId}/additional/img_${index + 1}.webp`;
      return this.uploadCompressedImage(path, file);
    });

    try {
      const urls = await Promise.all(uploadPromises);
      console.log(`✅ Subidas ${urls.length} imágenes adicionales para producto ${productId}`);
      return urls;
    } catch (error) {
      console.error('Error al subir imágenes adicionales:', error);
      throw new Error(`Error al subir imágenes adicionales: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * Elimina imágenes asociadas a un producto
   */
  async deleteProductImages(productId: string, imageUrls: string[]): Promise<void> {
    const deletePromises = imageUrls.map(url => this.deleteImageIfExists(url));
    await Promise.all(deletePromises);
  }

  /**
   * Elimina una imagen si existe (sin lanzar error si no existe)
   */
  async deleteImageIfExists(imageUrl?: string): Promise<void> {
    if (!imageUrl) return;

    try {
      const imageRef = ref(this.storage, imageUrl);
      await deleteObject(imageRef);
    } catch (e) {
      console.warn('No se pudo eliminar la imagen:', e);
    }
  }

  /**
   * Sube imagen con compresión y formato webp
   * Retorna directamente la URL de la imagen
   */
  public async uploadCompressedImage(path: string, file: File): Promise<string> {
    const result = await this.uploadCompressedImageWithDetails(path, file);
    return result.url;
  }

  /**
   * Versión que devuelve tanto la URL como el path
   * Útil para operaciones internas o casos donde se necesita el path
   */
  public async uploadCompressedImageWithDetails(path: string, file: File): Promise<ImageUploadResult> {
    const compressed = await this.compressImage(file);
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, compressed);
    const url = await getDownloadURL(storageRef);
    return { url, path };
  }

  async deleteImageByUrl(imageUrl: string): Promise<void> {
  try {
    if (!imageUrl) return;
    
    const imageRef = ref(this.storage, imageUrl);
    await deleteObject(imageRef);
    console.log('✅ Imagen eliminada de Firebase:', imageUrl);
  } catch (error) {
    console.error('❌ Error al eliminar imagen:', error);
    throw error;
  }
}

  /**
   * Comprime imagen y convierte a webp
   */
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
}