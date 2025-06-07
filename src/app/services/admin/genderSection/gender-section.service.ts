import { Injectable, NgZone } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
  limit,
  setDoc,
  onSnapshot
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, BehaviorSubject, of, combineLatest } from 'rxjs';
import { map, shareReplay, catchError, startWith, distinctUntilChanged, tap, debounceTime } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

export interface GenderSectionItem {
  id: string;
  title: string;
  category: string;
  imageUrl: string;
  mobileImageUrl?: string;
  alt: string;
  subtitle?: string;
  isActive?: boolean;
  order?: number;
  backgroundColor?: string;
  textColor?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GenderSectionConfig {
  id: string;
  sectionTitle: string;
  titleColor: string;
  backgroundColor: string;
  isActive: boolean;
  updatedAt?: Date;
}

interface ImageConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  format: 'webp' | 'jpeg';
}

// 🚀 CONFIGURACIONES DE IMAGEN INTELIGENTES
const GENDER_DESKTOP_CONFIG: ImageConfig = {
  maxWidth: 1200,
  maxHeight: 600,
  quality: 0.88, // Calidad base más alta
  format: 'webp'
};

const GENDER_MOBILE_CONFIG: ImageConfig = {
  maxWidth: 768,
  maxHeight: 500,
  quality: 0.85, // Calidad base más alta
  format: 'webp'
};

@Injectable({
  providedIn: 'root'
})
export class GenderSectionService {
  private itemsCollectionName = 'genderSectionItems';
  private configCollectionName = 'genderSectionConfig';

  // 🚀 STREAMS REACTIVOS CON CACHE
  private itemsCache$ = new BehaviorSubject<GenderSectionItem[]>([]);
  private configCache$ = new BehaviorSubject<GenderSectionConfig | null>(null);
  private loadingSubject$ = new BehaviorSubject<boolean>(false);
  private errorSubject$ = new BehaviorSubject<string | null>(null);
  private isInitialized = false;

  // 📦 ELEMENTOS POR DEFECTO
  private readonly DEFAULT_ITEMS: GenderSectionItem[] = [
    {
      id: 'default-man',
      title: 'Hombre',
      category: 'man',
      imageUrl: 'https://i.postimg.cc/fRSzrGFv/img.webp',
      alt: 'Colección para Hombre - Productos deportivos y casuales',
      subtitle: 'Explorar colección',
      isActive: true,
      order: 1,
      backgroundColor: '#1890ff',
      textColor: '#ffffff'
    },
    {
      id: 'default-woman',
      title: 'Mujer',
      category: 'woman',
      imageUrl: 'https://i.postimg.cc/k5wpF4cY/Imagen-de-Whats-App-2025-05-15-a-las-20-08-55-c0bbe9f9.jpg',
      alt: 'Colección para Mujer - Productos deportivos y casuales',
      subtitle: 'Explorar colección',
      isActive: true,
      order: 2,
      backgroundColor: '#ff4d4f',
      textColor: '#ffffff'
    }
  ];

  private readonly DEFAULT_CONFIG: GenderSectionConfig = {
    id: 'main-config',
    sectionTitle: 'Para Cada Aventurero',
    titleColor: 'aliceblue',
    backgroundColor: '#000000',
    isActive: true
  };

  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private ngZone: NgZone
  ) {
    this.initializeOnce();
  }

  // 🔥 INICIALIZACIÓN ÚNICA Y OPTIMIZADA
  private async initializeOnce(): Promise<void> {
    if (this.isInitialized) return;

    this.isInitialized = true;
    this.loadingSubject$.next(true);

    try {
      // Cargar datos iniciales de forma paralela
      await Promise.allSettled([
        this.loadItemsOnce(),
        this.loadConfigOnce()
      ]);

      // Configurar listeners en tiempo real después de la carga inicial
      this.setupRealtimeListeners();

    } catch (error) {
      console.error('💥 Error en inicialización:', error);
      this.loadDefaults();
    } finally {
      this.loadingSubject$.next(false);
    }
  }

  // 📊 CARGAR ITEMS UNA VEZ
  private async loadItemsOnce(): Promise<void> {
    try {
      const itemsRef = collection(this.firestore, this.itemsCollectionName);
      const q = query(itemsRef, orderBy('order', 'asc'));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        await this.loadDefaultItems();
        this.itemsCache$.next(this.DEFAULT_ITEMS);
      } else {
        const items = snapshot.docs.map(doc =>
          this.convertFirestoreData(doc.data(), doc.id)
        );
        this.itemsCache$.next(items);
      }
    } catch (error) {
      console.error('❌ Error cargando items:', error);
      this.itemsCache$.next(this.DEFAULT_ITEMS);
    }
  }

  // ⚙️ CARGAR CONFIG UNA VEZ
  private async loadConfigOnce(): Promise<void> {
    try {
      const configRef = doc(this.firestore, this.configCollectionName, 'main-config');
      const docSnap = await getDoc(configRef);

      if (docSnap.exists()) {
        const config = this.convertFirestoreData(docSnap.data(), docSnap.id);
        this.configCache$.next(config);
      } else {
        await this.loadDefaultConfig();
        this.configCache$.next(this.DEFAULT_CONFIG);
      }
    } catch (error) {
      console.error('❌ Error cargando config:', error);
      this.configCache$.next(this.DEFAULT_CONFIG);
    }
  }

  // 🎧 LISTENERS EN TIEMPO REAL (SOLO DESPUÉS DE CARGA INICIAL)
  private setupRealtimeListeners(): void {
    // Listener para items con debounce
    const itemsRef = collection(this.firestore, this.itemsCollectionName);
    const itemsQuery = query(itemsRef, orderBy('order', 'asc'));

    onSnapshot(itemsQuery,
      (snapshot) => {
        const items = snapshot.docs.map(doc =>
          this.convertFirestoreData(doc.data(), doc.id)
        );
        this.itemsCache$.next(items);
      },
      (error) => console.warn('⚠️ Error en items listener:', error)
    );

    // Listener para configuración
    const configRef = doc(this.firestore, this.configCollectionName, 'main-config');
    onSnapshot(configRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const config = this.convertFirestoreData(docSnapshot.data(), docSnapshot.id);
          this.configCache$.next(config);
        }
      },
      (error) => console.warn('⚠️ Error en config listener:', error)
    );
  }

  // 📥 MÉTODOS PÚBLICOS OPTIMIZADOS
  getItems(forceRefresh: boolean = false): Observable<GenderSectionItem[]> {
    if (forceRefresh && this.isInitialized) {
      this.loadItemsOnce();
    }
    return this.itemsCache$.asObservable().pipe(
      distinctUntilChanged(),
      shareReplay(1)
    );
  }

  getConfig(): Observable<GenderSectionConfig | null> {
    return this.configCache$.asObservable().pipe(
      distinctUntilChanged(),
      shareReplay(1)
    );
  }

  getLoadingState(): Observable<boolean> {
    return this.loadingSubject$.asObservable();
  }

  getErrorState(): Observable<string | null> {
    return this.errorSubject$.asObservable();
  }

  // ✨ CREAR ITEM OPTIMIZADO
  async createItem(
    itemData: Partial<GenderSectionItem>,
    desktopImage: File,
    mobileImage?: File
  ): Promise<string> {
    try {
      this.loadingSubject$.next(true);
      this.errorSubject$.next(null);

      // Generar ID único
      const itemId = uuidv4();

      // Optimizar y subir imágenes en paralelo
      const uploadPromises: Promise<string>[] = [
        this.uploadImageOptimized(desktopImage, 'desktop', itemId)
      ];

      if (mobileImage) {
        uploadPromises.push(this.uploadImageOptimized(mobileImage, 'mobile', itemId));
      }

      const [imageUrl, mobileImageUrl] = await Promise.all(uploadPromises);

      // Preparar datos con optimización local
      const newItem: Omit<GenderSectionItem, 'id'> = {
        title: itemData.title?.trim() || '',
        category: itemData.category || 'unisex',
        imageUrl,
        mobileImageUrl,
        alt: itemData.alt?.trim() || `Colección ${itemData.title}`,
        subtitle: itemData.subtitle?.trim() || 'Explorar colección',
        isActive: itemData.isActive ?? true,
        order: itemData.order || this.getNextOrder(),
        backgroundColor: itemData.backgroundColor,
        textColor: itemData.textColor,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Actualización optimista (actualizar cache antes de Firestore)
      const optimisticItem = { ...newItem, id: itemId };
      const currentItems = this.itemsCache$.value;
      this.itemsCache$.next([...currentItems, optimisticItem].sort((a, b) => (a.order || 0) - (b.order || 0)));

      // Guardar en Firestore (sin esperar para UI responsiva)
      const docRef = doc(collection(this.firestore, this.itemsCollectionName), itemId);
      await setDoc(docRef, newItem);

      console.log('✅ Item creado:', itemId);
      return itemId;

    } catch (error: any) {
      console.error('💥 Error creando item:', error);
      this.errorSubject$.next(error.message || 'Error al crear item');
      // Revertir cambio optimista
      this.loadItemsOnce();
      throw error;
    } finally {
      this.loadingSubject$.next(false);
    }
  }

  // 🔄 ACTUALIZAR ITEM OPTIMIZADO
  async updateItem(
    id: string,
    itemData: Partial<GenderSectionItem>,
    desktopImage?: File,
    mobileImage?: File
  ): Promise<void> {
    try {
      this.loadingSubject$.next(true);
      this.errorSubject$.next(null);

      // 🔍 OBTENER ITEM ACTUAL PARA LIMPIAR IMÁGENES ANTERIORES
      const currentItems = this.itemsCache$.value;
      const currentItem = currentItems.find(item => item.id === id);

      if (!currentItem) {
        throw new Error(`Item con ID ${id} no encontrado`);
      }

      const updateData: Partial<GenderSectionItem> = {
        ...itemData,
        updatedAt: new Date()
      };

      // 🗑️ URLs DE IMÁGENES ANTERIORES PARA ELIMINAR
      const imagesToDelete: string[] = [];

      // Subir nuevas imágenes en paralelo si existen
      const uploadPromises: Promise<string | undefined>[] = [];

      if (desktopImage) {
        // 🗑️ Marcar imagen anterior para eliminación
        if (currentItem.imageUrl && this.isFirebaseStorageUrl(currentItem.imageUrl)) {
          imagesToDelete.push(currentItem.imageUrl);
        }

        uploadPromises.push(this.uploadImageOptimized(desktopImage, 'desktop', id));
      } else {
        uploadPromises.push(Promise.resolve(undefined));
      }

      if (mobileImage) {
        // 🗑️ Marcar imagen móvil anterior para eliminación
        if (currentItem.mobileImageUrl && this.isFirebaseStorageUrl(currentItem.mobileImageUrl)) {
          imagesToDelete.push(currentItem.mobileImageUrl);
        }

        uploadPromises.push(this.uploadImageOptimized(mobileImage, 'mobile', id));
      } else {
        uploadPromises.push(Promise.resolve(undefined));
      }

      const [newDesktopUrl, newMobileUrl] = await Promise.all(uploadPromises);

      if (newDesktopUrl) updateData.imageUrl = newDesktopUrl;
      if (newMobileUrl) updateData.mobileImageUrl = newMobileUrl;

      // Actualización optimista
      const updatedItems = currentItems.map(item =>
        item.id === id ? { ...item, ...updateData } : item
      );
      this.itemsCache$.next(updatedItems);

      // Actualizar en Firestore
      const docRef = doc(this.firestore, this.itemsCollectionName, id);
      await updateDoc(docRef, updateData);

      // 🗑️ ELIMINAR IMÁGENES ANTERIORES EN BACKGROUND (no bloquear UI)
      if (imagesToDelete.length > 0) {
        this.deleteImagesFromStorage(imagesToDelete).catch(error =>
          console.warn('⚠️ Error eliminando imágenes anteriores:', error)
        );
      }

      console.log('✅ Item actualizado:', id);

    } catch (error: any) {
      console.error('💥 Error actualizando item:', error);
      this.errorSubject$.next(error.message || 'Error al actualizar item');
      // Revertir cambio optimista
      this.loadItemsOnce();
      throw error;
    } finally {
      this.loadingSubject$.next(false);
    }
  }

  // 🆕 NUEVO: Verifica si una URL es de Firebase Storage
  private isFirebaseStorageUrl(url: string): boolean {
    return url.includes('firebasestorage.googleapis.com') ||
      url.includes('firebase') ||
      url.includes('appspot.com');
  }

  // 🆕 NUEVO: Extrae el path de Firebase Storage desde la URL
  private extractFirebaseStoragePath(url: string): string | null {
    try {
      if (!url) return null;

      // Patrón para URLs de Firebase Storage
      if (url.includes('firebasestorage.googleapis.com')) {
        const urlObj = new URL(url);
        const pathMatch = urlObj.pathname.match(/\/o\/(.+?)(\?|$)/);

        if (pathMatch && pathMatch[1]) {
          return decodeURIComponent(pathMatch[1]);
        }
      }

      // Patrón alternativo para URLs de storage
      if (url.includes('/v0/b/') && url.includes('/o/')) {
        const match = url.match(/\/o\/([^?]+)/);
        if (match && match[1]) {
          return decodeURIComponent(match[1]);
        }
      }

      return null;

    } catch (error) {
      console.error('❌ Error extrayendo path de URL:', error);
      return null;
    }
  }


  // 🗑️ ELIMINAR ITEM OPTIMIZADO
  async deleteItem(id: string): Promise<void> {
    try {
      this.loadingSubject$.next(true);
      this.errorSubject$.next(null);

      // Actualización optimista
      const currentItems = this.itemsCache$.value;
      const itemToDelete = currentItems.find(item => item.id === id);
      const updatedItems = currentItems.filter(item => item.id !== id);
      this.itemsCache$.next(updatedItems);

      // Eliminar de Firestore
      const docRef = doc(this.firestore, this.itemsCollectionName, id);
      await deleteDoc(docRef);

      // Eliminar imágenes en background (no bloquear UI)
      if (itemToDelete) {
        this.deleteItemImages(itemToDelete).catch(error =>
          console.warn('⚠️ Error eliminando imágenes:', error)
        );
      }

      console.log('✅ Item eliminado:', id);

    } catch (error: any) {
      console.error('💥 Error eliminando item:', error);
      this.errorSubject$.next(error.message || 'Error al eliminar item');
      // Revertir cambio optimista
      this.loadItemsOnce();
      throw error;
    } finally {
      this.loadingSubject$.next(false);
    }
  }

  // ⚙️ ACTUALIZAR CONFIG OPTIMIZADO
  async updateConfig(configData: Partial<GenderSectionConfig>): Promise<void> {
    try {
      this.loadingSubject$.next(true);
      this.errorSubject$.next(null);

      const updateData: Partial<GenderSectionConfig> = {
        ...configData,
        updatedAt: new Date()
      };

      // Actualización optimista
      const currentConfig = this.configCache$.value;
      this.configCache$.next({ ...currentConfig, ...updateData } as GenderSectionConfig);

      // Actualizar en Firestore
      const docRef = doc(this.firestore, this.configCollectionName, 'main-config');
      await setDoc(docRef, updateData, { merge: true });

      console.log('✅ Configuración actualizada');

    } catch (error: any) {
      console.error('💥 Error actualizando configuración:', error);
      this.errorSubject$.next(error.message || 'Error al actualizar configuración');
      // Revertir cambio optimista
      this.loadConfigOnce();
      throw error;
    } finally {
      this.loadingSubject$.next(false);
    }
  }

  // 📊 ACTUALIZAR ORDEN OPTIMIZADO
  async updateItemsOrder(orderedIds: string[]): Promise<void> {
    try {
      this.loadingSubject$.next(true);

      // Actualización optimista inmediata
      const currentItems = this.itemsCache$.value;
      const reorderedItems = orderedIds.map((id, index) => {
        const item = currentItems.find(item => item.id === id);
        return item ? { ...item, order: index + 1 } : null;
      }).filter(Boolean) as GenderSectionItem[];

      this.itemsCache$.next(reorderedItems);

      // Actualizar en Firestore en background
      const batch = writeBatch(this.firestore);

      orderedIds.forEach((id, index) => {
        const docRef = doc(this.firestore, this.itemsCollectionName, id);
        batch.update(docRef, {
          order: index + 1,
          updatedAt: new Date()
        });
      });

      await batch.commit();
      console.log('✅ Orden actualizado');

    } catch (error: any) {
      console.error('💥 Error actualizando orden:', error);
      this.errorSubject$.next(error.message || 'Error al actualizar orden');
      // Revertir cambio optimista
      this.loadItemsOnce();
      throw error;
    } finally {
      this.loadingSubject$.next(false);
    }
  }

  // 🖼️ SUBIDA DE IMAGEN ULTRA OPTIMIZADA
  private async uploadImageOptimized(file: File, type: 'desktop' | 'mobile', itemId: string): Promise<string> {
    try {
      const config = type === 'desktop' ? GENDER_DESKTOP_CONFIG : GENDER_MOBILE_CONFIG;

      // Optimización más agresiva para velocidad
      const optimizedFile = await this.optimizeImageFast(file, config);

      const fileName = `gender-sections/${itemId}/${type}-${Date.now()}.${config.format}`;
      const storageRef = ref(this.storage, fileName);

      // Upload con metadata optimizada
      const snapshot = await uploadBytes(storageRef, optimizedFile, {
        cacheControl: 'public,max-age=31536000', // Cache 1 año
        contentType: `image/${config.format}`
      });

      const downloadURL = await getDownloadURL(snapshot.ref);

      console.log(`✅ Imagen ${type} subida (${(optimizedFile.size / 1024).toFixed(1)}KB):`, downloadURL);
      return downloadURL;

    } catch (error) {
      console.error(`💥 Error subiendo imagen ${type}:`, error);
      throw new Error(`Error al subir imagen ${type}`);
    }
  }

  // 🚀 OPTIMIZACIÓN DE IMAGEN MÁS RÁPIDA
  private async optimizeImageFast(file: File, config: ImageConfig): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      const img = new Image();
      let objectUrl: string | null = null;

      // ✅ Cleanup function
      const cleanup = () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };

      img.onload = () => {
        try {
          const { width, height } = this.calculateDimensionsOptimized(
            img.width, img.height, config.maxWidth, config.maxHeight
          );

          canvas.width = width;
          canvas.height = height;

          if (!ctx) {
            cleanup();
            reject(new Error('No se pudo obtener contexto del canvas'));
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          if (config.format === 'jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              cleanup();
              if (blob) {
                const optimizedFile = new File([blob], file.name, {
                  type: `image/${config.format}`,
                  lastModified: Date.now()
                });
                resolve(optimizedFile);
              } else {
                reject(new Error('Error al generar blob optimizado'));
              }
            },
            `image/${config.format}`,
            config.quality
          );
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      img.onerror = () => {
        cleanup();
        reject(new Error('Error al cargar imagen para optimización'));
      };

      // ✅ Crear URL y asignar
      objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
    });
  }

  // 📐 CÁLCULO DE DIMENSIONES OPTIMIZADO
  private calculateDimensionsOptimized(
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    // Si la imagen ya es pequeña, no redimensionar
    if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
      return { width: originalWidth, height: originalHeight };
    }

    const ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);
    return {
      width: Math.round(originalWidth * ratio),
      height: Math.round(originalHeight * ratio)
    };
  }

  // 🔧 MÉTODOS AUXILIARES
  private getNextOrder(): number {
    const items = this.itemsCache$.value;
    return items.length > 0 ? Math.max(...items.map(i => i.order || 0)) + 1 : 1;
  }

  private convertFirestoreData(data: any, id: string): any {
    const result = { ...data, id };

    Object.keys(result).forEach(key => {
      if (result[key]?.toDate) {
        result[key] = result[key].toDate();
      }
    });

    return result;
  }

  private loadDefaults(): void {
    this.itemsCache$.next(this.DEFAULT_ITEMS);
    this.configCache$.next(this.DEFAULT_CONFIG);
  }

  // 🔧 CORREGIDO: deleteItemImages mejorado
  private async deleteItemImages(item: GenderSectionItem): Promise<void> {
    const urlsToDelete: string[] = [];

    // Recopilar URLs de Firebase Storage solamente
    if (item.imageUrl && this.isFirebaseStorageUrl(item.imageUrl)) {
      urlsToDelete.push(item.imageUrl);
    }

    if (item.mobileImageUrl && this.isFirebaseStorageUrl(item.mobileImageUrl)) {
      urlsToDelete.push(item.mobileImageUrl);
    }

    if (urlsToDelete.length > 0) {
      await this.deleteImagesFromStorage(urlsToDelete);
    } else {
      console.log(`ℹ️ No hay imágenes de Firebase para eliminar en item: ${item.title}`);
    }
  }

  private async deleteImageFromUrl(url: string): Promise<void> {
    try {
      if (!url || !this.isFirebaseStorageUrl(url)) {
        console.log(`ℹ️ Saltando eliminación de URL externa: ${url}`);
        return;
      }

      const path = this.extractFirebaseStoragePath(url);
      if (!path) {
        console.warn(`⚠️ No se pudo extraer path de: ${url}`);
        return;
      }

      const imageRef = ref(this.storage, path);
      await deleteObject(imageRef);
      console.log(`✅ Imagen eliminada: ${path}`);

    } catch (error: any) {
      // No es crítico si la imagen no existe
      if (error?.code === 'storage/object-not-found') {
        console.log(`ℹ️ Imagen ya no existe: ${url}`);
      } else {
        console.warn('⚠️ Error eliminando imagen:', error);
      }
    }
  }

  // 🆕 NUEVO: Elimina múltiples imágenes de manera eficiente
  private async deleteImagesFromStorage(urls: string[]): Promise<void> {
    if (!urls || urls.length === 0) return;

    console.log(`🗑️ Eliminando ${urls.length} imágenes del storage...`);

    const deletePromises = urls.map(url => this.deleteImageFromUrl(url));
    const results = await Promise.allSettled(deletePromises);

    // Contar resultados
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Eliminación completada: ${successful} exitosas, ${failed} fallidas`);
  }

  private async loadDefaultItems(): Promise<void> {
    try {
      const batch = writeBatch(this.firestore);

      this.DEFAULT_ITEMS.forEach((item) => {
        // ✅ USAR EL ID FIJO DEL ITEM POR DEFECTO
        const docRef = doc(this.firestore, this.itemsCollectionName, item.id);
        const { id, ...itemData } = item; // Remover el ID del objeto
        batch.set(docRef, itemData);
      });

      await batch.commit();
      console.log('✅ Items por defecto cargados con IDs correctos');
    } catch (error) {
      console.error('❌ Error cargando items por defecto:', error);
    }
  }

  private async loadDefaultConfig(): Promise<void> {
    try {
      const docRef = doc(this.firestore, this.configCollectionName, 'main-config');
      await setDoc(docRef, this.DEFAULT_CONFIG);
      console.log('✅ Configuración por defecto cargada');
    } catch (error) {
      console.error('❌ Error cargando configuración por defecto:', error);
    }
  }
}