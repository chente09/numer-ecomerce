import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, BehaviorSubject, from } from 'rxjs';
import { map, catchError, shareReplay, take } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

// 🎯 INTERFAZ SIMPLE PARA MODELO CON IMAGEN
export interface ModelImage {
  id: string;
  modelName: string;
  imageUrl: string;
  mobileImageUrl?: string;
  description?: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

// 🎯 CONFIGURACIÓN DE IMAGEN OPTIMIZADA
const IMAGE_CONFIG = {
  desktop: { maxWidth: 1200, maxHeight: 800, quality: 0.85 },
  mobile: { maxWidth: 768, maxHeight: 600, quality: 0.80 }
};

@Injectable({
  providedIn: 'root'
})
export class ModelImageService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private collectionName = 'modelImages';

  // 🎯 ESTADO SIMPLE
  private modelImagesSubject = new BehaviorSubject<ModelImage[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);

  constructor() {
    this.loadModelImages();
  }

  // ==================== MÉTODOS PÚBLICOS PRINCIPALES ====================

  /**
   * ✅ OBTENER TODAS LAS IMÁGENES DE MODELOS
   */
  getModelImages(): Observable<ModelImage[]> {
    return this.modelImagesSubject.asObservable();
  }

  /**
   * ✅ OBTENER SOLO MODELOS ACTIVOS
   */
  getActiveModelImages(): Observable<ModelImage[]> {
    return this.modelImagesSubject.pipe(
      map(models => models.filter(model => model.isActive)),
      shareReplay(1)
    );
  }

  /**
   * ✅ OBTENER IMAGEN POR NOMBRE DE MODELO
   */
  getModelImageByName(modelName: string): Observable<ModelImage | null> {
    return this.modelImagesSubject.pipe(
      map(models => models.find(model => model.modelName === modelName) || null),
      take(1)
    );
  }

  /**
   * ✅ CREAR NUEVA IMAGEN DE MODELO
   */
  async createModelImage(
    modelName: string,
    description: string,
    desktopImage: File,
    mobileImage?: File
  ): Promise<string> {
    try {
      this.loadingSubject.next(true);

      const modelId = uuidv4();

      // Subir imágenes
      const imageUrl = await this.uploadOptimizedImage(modelId, desktopImage, 'desktop');
      let mobileImageUrl: string | undefined;

      if (mobileImage) {
        mobileImageUrl = await this.uploadOptimizedImage(modelId, mobileImage, 'mobile');
      }

      // 🔧 CORREGIDO: Crear datos limpiando undefined
      const modelData = this.cleanDataForFirestore({
        modelName: modelName.trim(),
        imageUrl,
        mobileImageUrl, // Puede ser undefined, se limpiará automáticamente
        description: description?.trim() || '',
        isActive: true,
        order: await this.getNextOrder(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // ✅ SOLO agregar mobileImageUrl si existe
      if (mobileImageUrl) {
        modelData.mobileImageUrl = mobileImageUrl;
      }

      const docRef = doc(this.firestore, this.collectionName, modelId);
      await setDoc(docRef, modelData);

      this.loadModelImages(); // Recargar

      return modelId;

    } catch (error: any) {
      console.error('❌ Error creando modelo:', error);
      throw new Error(error.message || 'Error al crear modelo');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * ✅ ACTUALIZAR IMAGEN DE MODELO
   */
  async updateModelImage(
    modelId: string,
    modelName?: string,
    description?: string,
    desktopImage?: File,
    mobileImage?: File
  ): Promise<void> {
    try {
      this.loadingSubject.next(true);

      const currentData = await this.getModelImageData(modelId);

      const updateData: any = { updatedAt: new Date() };

      // Actualizar campos de texto
      if (modelName) updateData.modelName = modelName.trim();
      if (description !== undefined) updateData.description = description.trim();

      // Subir nuevas imágenes si se proporcionan
      if (desktopImage) {
        if (currentData?.imageUrl) {
          await this.deleteImageFromStorage(currentData.imageUrl);
        }
        updateData.imageUrl = await this.uploadOptimizedImage(modelId, desktopImage, 'desktop');
      }

      if (mobileImage) {
        if (currentData?.mobileImageUrl) {
          await this.deleteImageFromStorage(currentData.mobileImageUrl);
        }
        updateData.mobileImageUrl = await this.uploadOptimizedImage(modelId, mobileImage, 'mobile');
      }

      const docRef = doc(this.firestore, this.collectionName, modelId);
      await updateDoc(docRef, updateData);

      this.loadModelImages(); // Recargar

    } catch (error: any) {
      console.error('❌ Error actualizando modelo:', error);
      throw new Error(error.message || 'Error al actualizar modelo');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  private cleanDataForFirestore(data: any): any {
    const cleaned: any = {};

    Object.keys(data).forEach(key => {
      const value = data[key];
      if (value !== undefined) {
        cleaned[key] = value;
      }
    });

    return cleaned;
  }

  /**
   * ✅ ELIMINAR MODELO
   */
  async deleteModelImage(modelId: string): Promise<void> {
    try {
      this.loadingSubject.next(true);

      // 🆕 OBTENER DATOS ANTES DE ELIMINAR
      const currentData = await this.getModelImageData(modelId);

      // 🗑️ ELIMINAR IMÁGENES DE STORAGE
      if (currentData?.imageUrl) {
        await this.deleteImageFromStorage(currentData.imageUrl);
      }
      if (currentData?.mobileImageUrl) {
        await this.deleteImageFromStorage(currentData.mobileImageUrl);
      }

      // Eliminar documento de Firestore
      const docRef = doc(this.firestore, this.collectionName, modelId);
      await deleteDoc(docRef);

      this.loadModelImages(); // Recargar

    } catch (error: any) {
      console.error('❌ Error eliminando modelo:', error);
      throw new Error(error.message || 'Error al eliminar modelo');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * ✅ TOGGLE ACTIVO/INACTIVO
   */
  async toggleModelActive(modelId: string, isActive: boolean): Promise<void> {
    try {
      const docRef = doc(this.firestore, this.collectionName, modelId);
      await updateDoc(docRef, {
        isActive,
        updatedAt: new Date()
      });

      this.loadModelImages(); // Recargar

    } catch (error: any) {
      console.error('❌ Error cambiando estado:', error);
      throw new Error('Error al cambiar estado');
    }
  }

  // ==================== MÉTODOS INTERNOS ====================

  /**
   * ✅ OBTENER DATOS DE MODELO DESDE FIRESTORE
   */
  private async getModelImageData(modelId: string): Promise<ModelImage | null> {
    try {
      const docRef = doc(this.firestore, this.collectionName, modelId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return this.convertFirestoreItem({ id: docSnap.id, ...docSnap.data() });
      }
      return null;
    } catch (error) {
      console.error('❌ Error obteniendo datos del modelo:', error);
      return null;
    }
  }

  /**
   * ✅ ELIMINAR IMAGEN DE STORAGE
   */
  private async deleteImageFromStorage(imageUrl: string): Promise<void> {
    try {
      if (!imageUrl || !imageUrl.includes('firebase')) {
        return; // No es una URL de Firebase
      }

      // Extraer el path de la URL de Firebase
      const imagePath = this.extractPathFromFirebaseUrl(imageUrl);
      if (imagePath) {
        const imageRef = ref(this.storage, imagePath);
        await deleteObject(imageRef);
        console.log(`🗑️ Imagen eliminada de Storage: ${imagePath}`);
      }
    } catch (error: any) {
      if (error.code !== 'storage/object-not-found') {
        console.warn('⚠️ Error eliminando imagen de Storage:', error);
      }
      // No lanzar error para no interrumpir el proceso principal
    }
  }

  /**
   * ✅ EXTRAER PATH DE URL DE FIREBASE
   */
  private extractPathFromFirebaseUrl(url: string): string | null {
    try {
      if (url.includes('firebasestorage.googleapis.com')) {
        const urlObj = new URL(url);
        const pathMatch = urlObj.pathname.match(/\/o\/(.+?)(\?|$)/);

        if (pathMatch && pathMatch[1]) {
          return decodeURIComponent(pathMatch[1]);
        }
      }
      return null;
    } catch (error) {
      console.error('❌ Error extrayendo path de URL:', error);
      return null;
    }
  }

  /**
   * ✅ CARGAR MODELOS DESDE FIRESTORE
   */
  private loadModelImages(): void {
    const modelsRef = collection(this.firestore, this.collectionName);
    const q = query(modelsRef, orderBy('order', 'asc'));

    collectionData(q, { idField: 'id' }).pipe(
      map(items => items.map(item => this.convertFirestoreItem(item))),
      catchError(error => {
        console.error('❌ Error cargando modelos:', error);
        return from([]);
      })
    ).subscribe(models => {
      console.log(`📦 Modelos cargados: ${models.length}`);
      console.log('🔍 Modelos detalle:', models);
      this.modelImagesSubject.next(models as ModelImage[]);
    });
  }

  /**
   * ✅ SUBIR IMAGEN OPTIMIZADA
   */
  private async uploadOptimizedImage(
    modelId: string,
    imageFile: File,
    type: 'desktop' | 'mobile'
  ): Promise<string> {
    try {
      // Optimizar imagen según el tipo
      const config = IMAGE_CONFIG[type];
      const optimizedFile = await this.optimizeImage(imageFile, config);

      // Generar path único
      const timestamp = Date.now();
      const fileName = `model-images/${modelId}/${type}-${timestamp}.webp`;
      const storageRef = ref(this.storage, fileName);

      // Subir archivo
      const snapshot = await uploadBytes(storageRef, optimizedFile, {
        cacheControl: 'public,max-age=31536000',
        contentType: 'image/webp'
      });

      const downloadURL = await getDownloadURL(snapshot.ref);

      console.log(`✅ Imagen ${type} subida: ${(optimizedFile.size / 1024).toFixed(1)}KB`);
      return downloadURL;

    } catch (error) {
      console.error(`❌ Error subiendo imagen ${type}:`, error);
      throw new Error(`Error al subir imagen ${type}`);
    }
  }

  /**
   * ✅ OPTIMIZAR IMAGEN
   */
  private async optimizeImage(
    file: File,
    config: { maxWidth: number; maxHeight: number; quality: number }
  ): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        try {
          // Calcular nuevas dimensiones
          const scale = Math.min(
            config.maxWidth / img.width,
            config.maxHeight / img.height,
            1
          );

          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);

          if (!ctx) {
            reject(new Error('Error con canvas'));
            return;
          }

          // Dibujar imagen optimizada
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Convertir a WebP
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const optimizedFile = new File([blob], file.name, {
                  type: 'image/webp',
                  lastModified: Date.now()
                });
                resolve(optimizedFile);
              } else {
                reject(new Error('Error generando imagen optimizada'));
              }
            },
            'image/webp',
            config.quality
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Error cargando imagen'));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * ✅ CONVERTIR DATOS DE FIRESTORE
   */
  private convertFirestoreItem(item: any): ModelImage {
    return {
      ...item,
      createdAt: item.createdAt?.toDate ? item.createdAt.toDate() : new Date(),
      updatedAt: item.updatedAt?.toDate ? item.updatedAt.toDate() : new Date()
    };
  }

  /**
   * ✅ OBTENER SIGUIENTE ORDEN
   */
  private async getNextOrder(): Promise<number> {
    const models = this.modelImagesSubject.value;
    const maxOrder = Math.max(...models.map(model => model.order || 0), 0);
    return maxOrder + 1;
  }

  // ==================== MÉTODOS PÚBLICOS DE UTILIDAD ====================

  /**
   * ✅ VERIFICAR SI MODELO EXISTE
   */
  modelExists(modelName: string): boolean {
    const models = this.modelImagesSubject.value;
    return models.some(model => model.modelName === modelName);
  }

  /**
   * ✅ OBTENER ESTADÍSTICAS
   */
  getStats() {
    const models = this.modelImagesSubject.value;
    return {
      total: models.length,
      active: models.filter(model => model.isActive).length,
      inactive: models.filter(model => !model.isActive).length
    };
  }

  /**
   * ✅ ESTADO DE CARGA
   */
  isLoading(): Observable<boolean> {
    return this.loadingSubject.asObservable();
  }

  /**
   * ✅ REFRESCAR DATOS
   */
  refreshData(): void {
    this.loadModelImages();
  }

  /**
   * ✅ DEBUG DEL SERVICIO
   */
  debugService(): void {
    console.group('🔍 [MODEL IMAGE SERVICE DEBUG]');

    const models = this.modelImagesSubject.value;
    console.log('📊 Total modelos:', models.length);

    if (models.length > 0) {
      console.table(models.map(model => ({
        id: model.id.substring(0, 8) + '...',
        modelName: model.modelName,
        active: model.isActive ? '✅' : '❌',
        order: model.order,
        hasDesktop: model.imageUrl ? '✅' : '❌',
        hasMobile: model.mobileImageUrl ? '✅' : '❌'
      })));
    }

    console.groupEnd();
  }
}