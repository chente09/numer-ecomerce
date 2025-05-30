import { Injectable, inject } from '@angular/core';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Color, Size } from '../../../models/models';

interface ImageUploadResult {
  url: string;
  path: string;
}

interface ImageCompressionOptions {
  maxWidth?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
}

@Injectable({
  providedIn: 'root'
})
export class ProductImageService {
  // 🔧 MEJORA: Usar inject() para consistencia
  private storage = inject(Storage);
  
  // 🆕 NUEVO: Configuración por defecto
  private readonly defaultCompressionOptions: ImageCompressionOptions = {
    maxWidth: 800,
    quality: 0.8,
    format: 'webp'
  };

  constructor() {
  }

  /**
   * 🚀 MEJORADO: Sube la imagen principal de un producto
   */
  async uploadProductImage(productId: string, file: File): Promise<string> {
    if (!productId || !file) {
      throw new Error('ProductId y file son requeridos');
    }

    const path = `products/${productId}/main.webp`;
    
    try {
      const url = await this.uploadCompressedImage(path, file);
      return url;
    } catch (error) {
      console.error(`❌ ImageService: Error subiendo imagen principal:`, error);
      throw new Error(`Error al subir imagen principal: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Procesa todas las imágenes de colores y tallas
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
        if (colorFile) {
          const colorIndex = i;
          const colorName = updatedColors[i].name;
          
          
          const colorPromise = this.uploadCompressedImage(
            `products/${productId}/colors/${colorName.toLowerCase().replace(/\s+/g, '_')}.webp`,
            colorFile
          ).then(url => {
            updatedColors[colorIndex].imageUrl = url;
            console.log(`✅ ImageService: Imagen de color ${colorName} subida: ${url}`);
          }).catch(error => {
            console.error(`❌ ImageService: Error subiendo imagen de color ${colorName}:`, error);
            throw error;
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
          const sizeName = updatedSizes[i].name;
                    
          const sizePromise = this.uploadCompressedImage(
            `products/${productId}/sizes/${sizeName.toLowerCase().replace(/\s+/g, '_')}.webp`,
            sizeFile
          ).then(url => {
            updatedSizes[sizeIndex].imageUrl = url;
            console.log(`✅ ImageService: Imagen de talla ${sizeName} subida: ${url}`);
          }).catch(error => {
            console.error(`❌ ImageService: Error subiendo imagen de talla ${sizeName}:`, error);
            throw error;
          });
          
          uploadPromises.push(sizePromise);
        }
      }
    }

    // Esperar a que todas las imágenes se suban
    try {
      await Promise.all(uploadPromises);
      
      return { colors: updatedColors, sizes: updatedSizes };
    } catch (error) {
      console.error(`❌ ImageService: Error procesando imágenes:`, error);
      throw new Error(`Error al procesar imágenes: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Sube una imagen para una variante de producto
   */
  async uploadVariantImage(productId: string, variantId: string, file: File): Promise<string> {
    if (!productId || !variantId || !file) {
      throw new Error('ProductId, variantId y file son requeridos');
    }


    const path = `products/${productId}/variants/${variantId}.webp`;
    
    try {
      const url = await this.uploadCompressedImage(path, file);
      return url;
    } catch (error) {
      console.error(`❌ ImageService: Error subiendo imagen de variante:`, error);
      throw new Error(`Error al subir imagen de variante: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Sube múltiples imágenes adicionales para un producto
   */
  async uploadAdditionalImages(productId: string, files: File[]): Promise<string[]> {
    if (!productId) {
      throw new Error('ProductId es requerido');
    }

    if (!files || files.length === 0) {
      return [];
    }


    const uploadPromises = files.map((file, index) => {
      const fileName = `img_${index + 1}_${Date.now()}`;
      const path = `products/${productId}/additional/${fileName}.webp`;
            
      return this.uploadCompressedImage(path, file).then(url => {
        console.log(`✅ ImageService: Imagen adicional ${index + 1} subida: ${url}`);
        return url;
      });
    });

    try {
      const urls = await Promise.all(uploadPromises);
      return urls;
    } catch (error) {
      console.error('❌ ImageService: Error al subir imágenes adicionales:', error);
      throw new Error(`Error al subir imágenes adicionales: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Elimina imágenes asociadas a un producto
   */
  async deleteProductImages(productId: string, imageUrls: string[]): Promise<void> {
    if (!productId) {
      console.warn('⚠️ ImageService: ProductId no proporcionado para eliminar imágenes');
      return;
    }

    if (!imageUrls || imageUrls.length === 0) {
      console.log(`ℹ️ ImageService: No hay imágenes para eliminar del producto ${productId}`);
      return;
    }

    const deletePromises = imageUrls.map((url, index) => {
      return this.deleteImageIfExists(url);
    });

    try {
      await Promise.all(deletePromises);
    } catch (error) {
      console.error(`❌ ImageService: Error eliminando imágenes del producto ${productId}:`, error);
      // No lanzamos error aquí para no bloquear otras operaciones
    }
  }

  /**
   * 🚀 MEJORADO: Elimina una imagen si existe (sin lanzar error si no existe)
   */
  async deleteImageIfExists(imageUrl?: string): Promise<void> {
    if (!imageUrl) {
      return;
    }

    try {
      const imageRef = ref(this.storage, imageUrl);
      await deleteObject(imageRef);
    } catch (error: any) {
      // No es un error crítico si la imagen no existe
      if (error?.code === 'storage/object-not-found') {
      } else {
        console.warn(`⚠️ ImageService: No se pudo eliminar la imagen ${imageUrl}:`, error);
      }
    }
  }

  /**
   * 🚀 MEJORADO: Elimina una imagen por URL (versión que lanza errores)
   */
  async deleteImageByUrl(imageUrl: string): Promise<void> {
    if (!imageUrl) {
      throw new Error('URL de imagen es requerida');
    }

    try {
      const imageRef = ref(this.storage, imageUrl);
      await deleteObject(imageRef);
    } catch (error) {
      console.error('❌ ImageService: Error al eliminar imagen:', error);
      throw new Error(`Error al eliminar imagen: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Sube imagen con compresión y formato webp
   * Retorna directamente la URL de la imagen
   */
  public async uploadCompressedImage(
    path: string, 
    file: File, 
    options?: ImageCompressionOptions
  ): Promise<string> {
    const result = await this.uploadCompressedImageWithDetails(path, file, options);
    return result.url;
  }

  /**
   * 🚀 MEJORADO: Versión que devuelve tanto la URL como el path
   * Útil para operaciones internas o casos donde se necesita el path
   */
  public async uploadCompressedImageWithDetails(
    path: string, 
    file: File, 
    options?: ImageCompressionOptions
  ): Promise<ImageUploadResult> {
    if (!path || !file) {
      throw new Error('Path y file son requeridos');
    }

    const compressionOptions = { ...this.defaultCompressionOptions, ...options };
    

    try {
      const compressed = await this.compressImage(file, compressionOptions);

      const storageRef = ref(this.storage, path);
      await uploadBytes(storageRef, compressed);
      
      const url = await getDownloadURL(storageRef);
      
      return { url, path };
    } catch (error) {
      console.error(`❌ ImageService: Error en uploadCompressedImageWithDetails:`, error);
      throw new Error(`Error al subir imagen: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * 🚀 MEJORADO: Comprime imagen y convierte a formato especificado
   */
  private async compressImage(
    file: File, 
    options: ImageCompressionOptions = this.defaultCompressionOptions
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = () => {
        img.src = reader.result as string;
      };
      
      reader.onerror = () => {
        reject(new Error('Error al leer el archivo'));
      };
      
      reader.readAsDataURL(file);

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxWidth = options.maxWidth || this.defaultCompressionOptions.maxWidth!;
          const quality = options.quality || this.defaultCompressionOptions.quality!;
          const format = options.format || this.defaultCompressionOptions.format!;
          
          // Calcular nuevas dimensiones manteniendo la proporción
          const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No se pudo obtener el contexto del canvas'));
            return;
          }

          // Configurar calidad de renderizado
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Dibujar imagen redimensionada
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // Convertir a blob con el formato especificado
          const mimeType = `image/${format}`;
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Error al comprimir imagen'));
              }
            },
            mimeType,
            quality
          );
        } catch (error) {
          reject(new Error(`Error al procesar imagen: ${error instanceof Error ? error.message : 'Error desconocido'}`));
        }
      };

      img.onerror = () => {
        reject(new Error('Error al cargar la imagen'));
      };
    });
  }

  /**
   * 🆕 NUEVO: Valida si un archivo es una imagen válida
   */
  validateImageFile(file: File): { isValid: boolean; error?: string } {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: `Tipo de archivo no permitido. Tipos permitidos: ${allowedTypes.join(', ')}`
      };
    }

    if (file.size > maxSize) {
      return {
        isValid: false,
        error: `Archivo demasiado grande. Tamaño máximo: ${maxSize / 1024 / 1024}MB`
      };
    }

    return { isValid: true };
  }

  /**
   * 🆕 NUEVO: Obtiene información de una imagen
   */
  async getImageInfo(file: File): Promise<{
    width: number;
    height: number;
    size: number;
    type: string;
    name: string;
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = () => {
        img.src = reader.result as string;
      };
      
      reader.onerror = () => reject(new Error('Error al leer archivo'));
      reader.readAsDataURL(file);

      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height,
          size: file.size,
          type: file.type,
          name: file.name
        });
      };

      img.onerror = () => reject(new Error('Error al cargar imagen'));
    });
  }

  /**
   * 🆕 NUEVO: Método de debugging para ver el estado del servicio
   */
  debugImageService(): void {
    console.group('📸 [IMAGE SERVICE DEBUG] Estado del servicio');
    console.log('🔧 Configuración por defecto:', this.defaultCompressionOptions);
    console.log('📦 Storage instance:', this.storage ? '✅ Conectado' : '❌ No conectado');
    console.groupEnd();
  }
}