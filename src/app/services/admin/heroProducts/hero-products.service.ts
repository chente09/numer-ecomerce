import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  Timestamp
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, BehaviorSubject, from, EMPTY } from 'rxjs';
import { map, catchError, distinctUntilChanged, shareReplay, tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

// Importar servicios
import { ProductService } from '../product/product.service';

// 🎯 INTERFACES SIMPLIFICADAS
export interface CustomHeroItem {
  id: string;
  productId: string;
  title: string;
  subtitle?: string;
  ctaText: string;
  customImageUrl: string;
  mobileImageUrl?: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductBasicInfo {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  totalStock: number;
  isActive?: boolean;
}

// 🎯 CONFIGURACIÓN DE IMÁGENES SIMPLIFICADA
const IMAGE_CONFIG = {
  maxWidth: 1200,
  maxHeight: 600,
  quality: 0.85,
  format: 'webp' as const
};

@Injectable({
  providedIn: 'root'
})
export class HeroProductsService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private collectionName = 'customHeroItems';

  // 🎯 ESTADOS SIMPLIFICADOS
  private heroItemsSubject = new BehaviorSubject<CustomHeroItem[]>([]);
  private isLoadingSubject = new BehaviorSubject<boolean>(false);

  constructor(private productService: ProductService) {
    this.initializeData();
  }

  // 🎯 INICIALIZACIÓN SIMPLIFICADA
  private initializeData(): void {
    console.log('🚀 Inicializando Hero Products Service...');
    this.loadHeroItems();
  }

  // ==================== MÉTODOS PÚBLICOS PRINCIPALES ====================

  /**
   * ✅ MÉTODO SIMPLE: Obtener hero items usando collectionData
   */
  getHeroItems(): Observable<CustomHeroItem[]> {
    if (this.heroItemsSubject.value.length === 0) {
      this.loadHeroItems();
    }
    return this.heroItemsSubject.asObservable();
  }

  /**
   * ✅ MÉTODO SIMPLE: Cargar hero items desde Firestore
   */
  private loadHeroItems(): void {
    console.log('📥 Cargando hero items...');
    
    const heroRef = collection(this.firestore, this.collectionName);
    const q = query(heroRef, orderBy('order', 'asc'));
    
    // ✅ USAR: collectionData directamente
    collectionData(q, { idField: 'id' }).pipe(
      map(items => items.map(item => this.convertFirestoreItem(item))),
      catchError(error => {
        console.error('❌ Error cargando hero items:', error);
        return EMPTY;
      })
    ).subscribe(items => {
      console.log(`✅ Hero items cargados: ${items.length}`);
      this.heroItemsSubject.next(items as CustomHeroItem[]);
    });
  }

  /**
   * ✅ MÉTODO SIMPLE: Obtener productos disponibles
   */
  getAvailableProducts(): Observable<ProductBasicInfo[]> {
    console.log('📥 Cargando productos disponibles...');
    
    return this.productService.getProducts().pipe(
      map(products => {
        console.log(`📦 Productos encontrados: ${products.length}`);
        
        const availableProducts = products
          .filter(product => {
            // ✅ FILTRO MÁS PERMISIVO
            const hasStock = product.totalStock > 0;
            
            console.log(`Producto ${product.name}: stock=${product.totalStock}, `);
            return hasStock;
          })
          .map(product => ({
            id: product.id,
            name: product.name,
            price: product.price || 0,
            imageUrl: product.imageUrl || '',
            totalStock: product.totalStock || 0,
          } as ProductBasicInfo));

        console.log(`✅ Productos disponibles: ${availableProducts.length}`);
        return availableProducts;
      }),
      catchError(error => {
        console.error('❌ Error cargando productos:', error);
        return from([]);
      }),
      shareReplay(1)
    );
  }

  /**
   * ✅ MÉTODO SIMPLE: Crear hero item
   */
  async createHeroItem(
    heroData: Partial<CustomHeroItem>,
    imageFile: File
  ): Promise<string> {
    console.log('🚀 Creando hero item...');
    
    try {
      this.isLoadingSubject.next(true);
      
      const heroId = uuidv4();
      
      // ✅ SUBIR IMAGEN PRIMERO
      const imageUrl = await this.uploadImage(heroId, imageFile);
      
      // ✅ CREAR DATOS LIMPIOS
      const heroItemData = {
        productId: heroData.productId!,
        title: heroData.title!.trim(),
        subtitle: heroData.subtitle?.trim() || '',
        ctaText: heroData.ctaText!.trim(),
        customImageUrl: imageUrl,
        isActive: heroData.isActive ?? true,
        order: heroData.order || await this.getNextOrder(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // ✅ GUARDAR EN FIRESTORE
      const docRef = doc(this.firestore, this.collectionName, heroId);
      await setDoc(docRef, heroItemData);

      console.log(`✅ Hero item creado: ${heroId}`);
      
      // ✅ RECARGAR DATOS
      this.loadHeroItems();
      
      return heroId;

    } catch (error: any) {
      console.error('❌ Error creando hero item:', error);
      throw new Error(error.message || 'Error al crear hero item');
    } finally {
      this.isLoadingSubject.next(false);
    }
  }

  /**
   * ✅ MÉTODO SIMPLE: Actualizar hero item
   */
  async updateHeroItem(
    heroId: string,
    heroData: Partial<CustomHeroItem>,
    imageFile?: File
  ): Promise<void> {
    console.log(`🔄 Actualizando hero item: ${heroId}`);
    
    try {
      this.isLoadingSubject.next(true);
      
      // ✅ PREPARAR DATOS DE ACTUALIZACIÓN
      const updateData: any = {
        updatedAt: Timestamp.now()
      };

      // ✅ SOLO AGREGAR CAMPOS QUE CAMBIEN
      if (heroData.productId) updateData.productId = heroData.productId;
      if (heroData.title) updateData.title = heroData.title.trim();
      if (heroData.subtitle !== undefined) updateData.subtitle = heroData.subtitle?.trim() || '';
      if (heroData.ctaText) updateData.ctaText = heroData.ctaText.trim();
      if (heroData.isActive !== undefined) updateData.isActive = heroData.isActive;
      if (heroData.order !== undefined) updateData.order = heroData.order;

      // ✅ SUBIR NUEVA IMAGEN SI SE PROPORCIONA
      if (imageFile) {
        const newImageUrl = await this.uploadImage(heroId, imageFile);
        updateData.customImageUrl = newImageUrl;
      }

      // ✅ ACTUALIZAR EN FIRESTORE
      const docRef = doc(this.firestore, this.collectionName, heroId);
      await updateDoc(docRef, updateData);

      console.log(`✅ Hero item actualizado: ${heroId}`);
      
      // ✅ RECARGAR DATOS
      this.loadHeroItems();

    } catch (error: any) {
      console.error('❌ Error actualizando hero item:', error);
      throw new Error(error.message || 'Error al actualizar hero item');
    } finally {
      this.isLoadingSubject.next(false);
    }
  }

  /**
   * ✅ MÉTODO SIMPLE: Eliminar hero item
   */
  async deleteHeroItem(heroId: string): Promise<void> {
    console.log(`🗑️ Eliminando hero item: ${heroId}`);
    
    try {
      this.isLoadingSubject.next(true);
      
      // ✅ ELIMINAR DOCUMENTO
      const docRef = doc(this.firestore, this.collectionName, heroId);
      await deleteDoc(docRef);

      console.log(`✅ Hero item eliminado: ${heroId}`);
      
      // ✅ RECARGAR DATOS
      this.loadHeroItems();

    } catch (error: any) {
      console.error('❌ Error eliminando hero item:', error);
      throw new Error(error.message || 'Error al eliminar hero item');
    } finally {
      this.isLoadingSubject.next(false);
    }
  }

  /**
   * ✅ MÉTODO SIMPLE: Toggle activo/inactivo
   */
  async toggleHeroItem(heroId: string, isActive: boolean): Promise<void> {
    try {
      const docRef = doc(this.firestore, this.collectionName, heroId);
      await updateDoc(docRef, {
        isActive,
        updatedAt: Timestamp.now()
      });

      console.log(`✅ Hero item ${isActive ? 'activado' : 'desactivado'}: ${heroId}`);
      
      // ✅ RECARGAR DATOS
      this.loadHeroItems();

    } catch (error: any) {
      console.error('❌ Error cambiando estado:', error);
      throw new Error('Error al cambiar estado');
    }
  }

  /**
   * ✅ MÉTODO SIMPLE: Actualizar orden
   */
  async updateItemsOrder(orderedIds: string[]): Promise<void> {
    try {
      this.isLoadingSubject.next(true);
      
      const batch = writeBatch(this.firestore);

      orderedIds.forEach((id, index) => {
        const docRef = doc(this.firestore, this.collectionName, id);
        batch.update(docRef, {
          order: index + 1,
          updatedAt: Timestamp.now()
        });
      });

      await batch.commit();
      console.log('✅ Orden actualizado');
      
      // ✅ RECARGAR DATOS
      this.loadHeroItems();

    } catch (error: any) {
      console.error('❌ Error actualizando orden:', error);
      throw new Error('Error al actualizar orden');
    } finally {
      this.isLoadingSubject.next(false);
    }
  }

  // ==================== MÉTODOS DE UTILIDAD ====================

  /**
   * ✅ SUBIDA DE IMAGEN SIMPLIFICADA
   */
  private async uploadImage(heroId: string, imageFile: File): Promise<string> {
    try {
      console.log(`📤 Subiendo imagen para hero: ${heroId}`);
      
      // ✅ OPTIMIZAR IMAGEN
      const optimizedFile = await this.optimizeImage(imageFile);
      
      // ✅ GENERAR PATH ÚNICO
      const timestamp = Date.now();
      const fileName = `hero-images/${heroId}-${timestamp}.${IMAGE_CONFIG.format}`;
      const storageRef = ref(this.storage, fileName);

      // ✅ SUBIR ARCHIVO
      const snapshot = await uploadBytes(storageRef, optimizedFile, {
        cacheControl: 'public,max-age=31536000',
        contentType: `image/${IMAGE_CONFIG.format}`
      });

      const downloadURL = await getDownloadURL(snapshot.ref);
      
      console.log(`✅ Imagen subida: ${fileName} (${(optimizedFile.size / 1024).toFixed(1)}KB)`);
      return downloadURL;

    } catch (error) {
      console.error('❌ Error subiendo imagen:', error);
      throw new Error('Error al subir imagen');
    }
  }

  /**
   * ✅ OPTIMIZACIÓN DE IMAGEN SIMPLIFICADA
   */
  private async optimizeImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        try {
          // ✅ CALCULAR DIMENSIONES
          const { width, height } = this.calculateDimensions(
            img.width, 
            img.height, 
            IMAGE_CONFIG.maxWidth, 
            IMAGE_CONFIG.maxHeight
          );

          canvas.width = width;
          canvas.height = height;

          if (!ctx) {
            reject(new Error('Error con canvas'));
            return;
          }

          // ✅ DIBUJAR IMAGEN REDIMENSIONADA
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // ✅ CONVERTIR A ARCHIVO
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const optimizedFile = new File([blob], file.name, {
                  type: `image/${IMAGE_CONFIG.format}`,
                  lastModified: Date.now()
                });
                resolve(optimizedFile);
              } else {
                reject(new Error('Error generando imagen optimizada'));
              }
            },
            `image/${IMAGE_CONFIG.format}`,
            IMAGE_CONFIG.quality
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
   * ✅ CÁLCULO DE DIMENSIONES SIMPLIFICADO
   */
  private calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    
    // ✅ SI YA ES PEQUEÑA, MANTENER ORIGINAL
    if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
      return { width: originalWidth, height: originalHeight };
    }

    // ✅ CALCULAR RATIO Y REDIMENSIONAR
    const ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);
    
    return {
      width: Math.round(originalWidth * ratio),
      height: Math.round(originalHeight * ratio)
    };
  }

  /**
   * ✅ CONVERSIÓN DE DATOS FIRESTORE SIMPLIFICADA
   */
  private convertFirestoreItem(item: any): CustomHeroItem {
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
    const items = this.heroItemsSubject.value;
    const maxOrder = Math.max(...items.map(item => item.order || 0), 0);
    return maxOrder + 1;
  }

  // ==================== MÉTODOS PÚBLICOS DE UTILIDAD ====================

  /**
   * ✅ VERIFICAR SI PRODUCTO TIENE HERO ITEM
   */
  hasHeroItem(productId: string): boolean {
    const items = this.heroItemsSubject.value;
    return items.some(item => item.productId === productId);
  }

  /**
   * ✅ OBTENER HERO ITEM POR PRODUCTO
   */
  getHeroItemByProductId(productId: string): CustomHeroItem | null {
    const items = this.heroItemsSubject.value;
    return items.find(item => item.productId === productId) || null;
  }

  /**
   * ✅ OBTENER SOLO HERO ITEMS ACTIVOS
   */
  getActiveHeroItems(): Observable<CustomHeroItem[]> {
    return this.heroItemsSubject.pipe(
      map(items => items.filter(item => item.isActive)),
      distinctUntilChanged()
    );
  }

  /**
   * ✅ OBTENER ESTADÍSTICAS
   */
  getStats() {
    const items = this.heroItemsSubject.value;
    return {
      total: items.length,
      active: items.filter(item => item.isActive).length,
      inactive: items.filter(item => !item.isActive).length
    };
  }

  /**
   * ✅ ESTADO DE CARGA
   */
  isLoading(): Observable<boolean> {
    return this.isLoadingSubject.asObservable();
  }

  /**
   * ✅ REFRESCAR DATOS MANUALMENTE
   */
  refreshData(): void {
    console.log('🔄 Refrescando datos...');
    this.loadHeroItems();
  }

  /**
   * ✅ DEBUG DEL SERVICIO
   */
  debugService(): void {
    console.group('🔍 [HERO SERVICE DEBUG]');
    
    const heroItems = this.heroItemsSubject.value;
    console.log('📊 Hero Items:', heroItems.length);
    
    if (heroItems.length > 0) {
      console.table(heroItems.map(item => ({
        id: item.id.substring(0, 8) + '...',
        productId: item.productId.substring(0, 8) + '...',
        title: item.title,
        active: item.isActive ? '✅' : '❌',
        order: item.order
      })));
    }

    // ✅ PROBAR CARGA DE PRODUCTOS
    this.getAvailableProducts().subscribe(products => {
      console.log('📦 Productos disponibles:', products.length);
      if (products.length > 0) {
        console.table(products.slice(0, 3)); // Solo mostrar primeros 3
      }
    });
    
    console.groupEnd();
  }
}