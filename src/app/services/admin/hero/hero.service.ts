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
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject, listAll } from '@angular/fire/storage';
import { Observable, BehaviorSubject, of, combineLatest } from 'rxjs';
import { map, shareReplay, catchError, startWith, distinctUntilChanged, tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

export interface HeroItem {
  id: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  imageUrl: string;
  isGif?: boolean;
  isActive?: boolean;
  order?: number;
  mobileImageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
  startDate?: Date;
  endDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface HeroImageConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  format: 'webp' | 'jpeg';
}

const HERO_DESKTOP_CONFIG: HeroImageConfig = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.95,
  format: 'webp'
};

const HERO_MOBILE_CONFIG: HeroImageConfig = {
  maxWidth: 768,
  maxHeight: 1024,
  quality: 0.92,
  format: 'webp'
};

@Injectable({
  providedIn: 'root'
})
export class HeroService {
  private collectionName = 'heroes';
  
  // 🚀 STREAMS REACTIVOS CENTRALIZADOS
  private heroesStream$?: Observable<HeroItem[]>;
  private activeHeroSubject$ = new BehaviorSubject<HeroItem | null>(null);
  private loadingSubject$ = new BehaviorSubject<boolean>(false);
  private errorSubject$ = new BehaviorSubject<string | null>(null);
  
  // 🎯 HERO POR DEFECTO MEJORADO
  private readonly DEFAULT_HERO: HeroItem = {
    id: 'default',
    title: 'Para las Montañas y Más Allá',
    subtitle: 'Numer Equipment: Equipamiento innovador para deportes de aventura, senderismo y montaña.',
    ctaText: 'Ver Novedades',
    ctaLink: '/new-arrivals',
    imageUrl: 'https://i.postimg.cc/sDNm0F60/255-1.gif',
    mobileImageUrl: 'https://i.postimg.cc/sDNm0F60/255-1.gif',
    isGif: true,
    isActive: true,
    order: 1,
    backgroundColor: '#333333',
    textColor: '#ffffff'
  };

  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private ngZone: NgZone
  ) {
    this.initializeRealtimeConnection();
  }

  // 🔥 INICIALIZAR CONEXIÓN EN TIEMPO REAL
  private initializeRealtimeConnection(): void {
    this.loadingSubject$.next(true);
    
    const heroesRef = collection(this.firestore, this.collectionName);
    const allHeroesQuery = query(heroesRef, orderBy('order', 'asc'));

    // Stream principal de todos los héroes con listener en tiempo real
    this.heroesStream$ = new Observable<HeroItem[]>(subscriber => {
      const unsubscribe = onSnapshot(
        allHeroesQuery,
        (snapshot) => {
          try {
            const heroes = snapshot.docs.map(doc => 
              this.convertFirestoreData(doc.data(), doc.id)
            );
            
            console.log('🔄 Heroes actualizados desde Firestore:', heroes.length);
            subscriber.next(heroes);
            
            // Actualizar hero activo automáticamente
            this.updateActiveHeroFromList(heroes);
            
          } catch (error) {
            console.error('❌ Error procesando snapshot de heroes:', error);
            this.errorSubject$.next('Error al cargar heroes desde Firestore');
            subscriber.error(error);
          }
        },
        (error) => {
          console.error('❌ Error en snapshot listener:', error);
          this.errorSubject$.next('Error de conexión con Firestore');
          this.loadDefaultHeroAsFallback();
          subscriber.error(error);
        }
      );

      return () => unsubscribe();
    }).pipe(
      tap(() => this.loadingSubject$.next(false)),
      catchError(error => {
        console.error('💥 Error crítico en heroes stream:', error);
        this.loadingSubject$.next(false);
        this.loadDefaultHeroAsFallback();
        return of([]);
      }),
      shareReplay(1)
    );

    // Iniciar la suscripción
    this.heroesStream$.subscribe();
  }

  // 🎯 ACTUALIZAR HERO ACTIVO DESDE LISTA
  private updateActiveHeroFromList(heroes: HeroItem[]): void {
    const activeHero = heroes.find(hero => hero.isActive === true);
    
    if (activeHero) {
      console.log('✅ Hero activo encontrado:', activeHero.title, 'GIF:', activeHero.isGif);
      this.activeHeroSubject$.next(activeHero);
      this.errorSubject$.next(null);
    } else {
      console.log('⚠️ No hay hero activo, usando hero por defecto');
      this.loadDefaultHeroAsFallback();
    }
  }

  // 🛡️ CARGAR HERO POR DEFECTO COMO RESPALDO
  private loadDefaultHeroAsFallback(): void {
    console.log('🔧 Cargando hero por defecto como respaldo');
    this.activeHeroSubject$.next(this.DEFAULT_HERO);
    this.errorSubject$.next(null);
  }

  // ✅ OBTENER HERO ACTIVO (OBSERVABLE REACTIVO)
  getActiveHero(): Observable<HeroItem | null> {
    return this.activeHeroSubject$.asObservable().pipe(
      distinctUntilChanged((prev, curr) => {
        if (!prev && !curr) return true;
        if (!prev || !curr) return false;
        return prev.id === curr.id && 
               prev.imageUrl === curr.imageUrl && 
               prev.isActive === curr.isActive &&
               prev.isGif === curr.isGif;
      }),
      tap(hero => {
        if (hero) {
          console.log(`🎯 Hero activo emitido: ${hero.title} (GIF: ${hero.isGif})`);
        }
      })
    );
  }

  // ✅ OBTENER TODOS LOS HÉROES
  getHeroes(forceRefresh: boolean = false): Observable<HeroItem[]> {
    if (forceRefresh) {
      // Reinicializar conexión en tiempo real si se fuerza el refresh
      this.initializeRealtimeConnection();
    }
    
    return this.heroesStream$ || this.initializeAndGetHeroes();
  }

  // 🔄 INICIALIZAR Y OBTENER HEROES SI NO EXISTE STREAM
  private initializeAndGetHeroes(): Observable<HeroItem[]> {
    this.initializeRealtimeConnection();
    return this.heroesStream$ || of([]);
  }

  // ✅ OBTENER ESTADO DE CARGA
  getLoadingState(): Observable<boolean> {
    return this.loadingSubject$.asObservable();
  }

  // ✅ OBTENER ERRORES
  getErrorState(): Observable<string | null> {
    return this.errorSubject$.asObservable();
  }

  // ✅ MÉTODO SIMPLE PARA CONVERTIR DATOS (SIN CAMBIOS)
  private convertFirestoreData(data: any, id: string): HeroItem {
    return {
      id,
      title: data.title || '',
      subtitle: data.subtitle || '',
      ctaText: data.ctaText || '',
      ctaLink: data.ctaLink || '',
      imageUrl: data.imageUrl || '',
      isGif: data.isGif || false,
      isActive: data.isActive || false,
      order: data.order || 999,
      mobileImageUrl: data.mobileImageUrl,
      backgroundColor: data.backgroundColor,
      textColor: data.textColor,
      startDate: this.convertToDate(data.startDate),
      endDate: this.convertToDate(data.endDate),
      createdAt: this.convertToDate(data.createdAt),
      updatedAt: this.convertToDate(data.updatedAt)
    };
  }

  // ✅ OBTENER HERO POR ID
  async getHeroById(id: string): Promise<HeroItem | null> {
    try {
      const docRef = doc(this.firestore, this.collectionName, id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      return this.convertFirestoreData(docSnap.data(), docSnap.id);
    } catch (error) {
      console.error(`Error al obtener hero ${id}:`, error);
      return null;
    }
  }

  // ✅ CREAR NUEVO HERO (MEJORADO CON REFRESH AUTOMÁTICO)
  async createHero(
    hero: Omit<HeroItem, 'id' | 'imageUrl' | 'mobileImageUrl'>,
    imageFile: File,
    mobileImageFile?: File
  ): Promise<string> {
    try {
      const heroId = uuidv4();
      console.log('🎯 Creando hero:', heroId);

      const nextOrder = await this.getNextOrder();
      const imageUrl = await this.uploadHeroImage(heroId, imageFile, 'desktop', HERO_DESKTOP_CONFIG);
      let mobileImageUrl: string | undefined;
      
      if (mobileImageFile) {
        mobileImageUrl = await this.uploadHeroImage(heroId, mobileImageFile, 'mobile', HERO_MOBILE_CONFIG);
      }

      const heroData = this.cleanDataForFirestore({
        ...hero,
        imageUrl,
        mobileImageUrl,
        order: hero.order || nextOrder,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const docRef = doc(this.firestore, this.collectionName, heroId);
      await setDoc(docRef, heroData);

      console.log('✅ Hero creado:', heroId);
      
      // El listener en tiempo real se encargará del refresh automático
      return heroId;

    } catch (error: any) {
      console.error('💥 Error al crear hero:', error);
      throw new Error(`Error al crear hero: ${error.message}`);
    }
  }

  // ✅ ACTUALIZAR HERO (SIN CAMBIOS SIGNIFICATIVOS)
  async updateHero(
    id: string,
    hero: Partial<HeroItem>,
    imageFile?: File,
    mobileImageFile?: File
  ): Promise<void> {
    try {
      console.log('🔄 Actualizando hero:', id);

      const currentHero = await this.getHeroById(id);
      if (!currentHero) {
        throw new Error(`Hero con ID ${id} no encontrado`);
      }

      const updates: any = {
        updatedAt: new Date()
      };

      Object.keys(hero).forEach(key => {
        const value = (hero as any)[key];
        if (value !== undefined) {
          updates[key] = value;
        }
      });

      if (imageFile) {
        const newImageUrl = await this.uploadHeroImage(id, imageFile, 'desktop', HERO_DESKTOP_CONFIG);
        updates.imageUrl = newImageUrl;
        
        if (currentHero.imageUrl && currentHero.imageUrl !== newImageUrl) {
          await this.deleteImageFromStorage(currentHero.imageUrl);
        }
      }

      if (mobileImageFile) {
        const newMobileImageUrl = await this.uploadHeroImage(id, mobileImageFile, 'mobile', HERO_MOBILE_CONFIG);
        updates.mobileImageUrl = newMobileImageUrl;
        
        if (currentHero.mobileImageUrl && currentHero.mobileImageUrl !== newMobileImageUrl) {
          await this.deleteImageFromStorage(currentHero.mobileImageUrl);
        }
      }

      if (Object.keys(updates).length > 1) {
        const docRef = doc(this.firestore, this.collectionName, id);
        await updateDoc(docRef, updates);
      }

      console.log('✅ Hero actualizado:', id);
      // El listener se encarga del refresh automático

    } catch (error: any) {
      console.error(`💥 Error al actualizar hero ${id}:`, error);
      throw new Error(`Error al actualizar hero: ${error.message}`);
    }
  }

  // ✅ ESTABLECER HERO ACTIVO MEJORADO
  async setActiveHero(id: string): Promise<void> {
    try {
      console.log('🎯 Estableciendo hero activo:', id);

      const batch = writeBatch(this.firestore);
      const allHeroesQuery = query(collection(this.firestore, this.collectionName));
      const allHeroesSnapshot = await getDocs(allHeroesQuery);

      allHeroesSnapshot.forEach(docSnapshot => {
        const heroRef = doc(this.firestore, this.collectionName, docSnapshot.id);
        batch.update(heroRef, {
          isActive: docSnapshot.id === id,
          updatedAt: new Date()
        });
      });

      await batch.commit();
      console.log('✅ Hero activado:', id);
      // El listener se encarga del refresh automático

    } catch (error: any) {
      console.error(`Error al activar hero ${id}:`, error);
      throw new Error(`Error al establecer hero activo: ${error.message}`);
    }
  }

  // ✅ ELIMINAR HERO (SIN CAMBIOS)
  async deleteHero(id: string): Promise<void> {
    try {
      console.log('🗑️ Eliminando hero:', id);

      const hero = await this.getHeroById(id);
      if (!hero) {
        throw new Error(`Hero con ID ${id} no existe`);
      }

      const deletePromises: Promise<void>[] = [];
      
      if (hero.imageUrl) {
        deletePromises.push(this.deleteImageFromStorage(hero.imageUrl));
      }
      
      if (hero.mobileImageUrl) {
        deletePromises.push(this.deleteImageFromStorage(hero.mobileImageUrl));
      }

      deletePromises.push(this.deleteHeroFolder(id));
      await Promise.allSettled(deletePromises);

      const docRef = doc(this.firestore, this.collectionName, id);
      await deleteDoc(docRef);

      console.log('✅ Hero eliminado:', id);
      // El listener se encarga del refresh automático

    } catch (error: any) {
      console.error(`💥 Error al eliminar hero ${id}:`, error);
      throw new Error(`Error al eliminar hero: ${error.message}`);
    }
  }

  // ✅ ACTUALIZAR ORDEN (SIN CAMBIOS)
  async updateHeroesOrder(orderedIds: string[]): Promise<void> {
    try {
      const batch = writeBatch(this.firestore);

      orderedIds.forEach((id, index) => {
        const heroRef = doc(this.firestore, this.collectionName, id);
        batch.update(heroRef, {
          order: index + 1,
          updatedAt: new Date()
        });
      });

      await batch.commit();
      // El listener se encarga del refresh automático

    } catch (error: any) {
      console.error('Error al actualizar orden:', error);
      throw new Error(`Error al actualizar orden: ${error.message}`);
    }
  }

  // ✅ MÉTODOS PRIVADOS HELPER (SIN CAMBIOS)
  private cleanDataForFirestore(data: any): any {
    const cleaned: any = {};
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      
      if (value !== undefined) {
        if (value === null || value === '') {
          if (['backgroundColor', 'textColor', 'mobileImageUrl', 'startDate', 'endDate'].includes(key)) {
            return;
          }
          cleaned[key] = null;
        } else {
          cleaned[key] = value;
        }
      }
    });
    
    return cleaned;
  }

  private async getNextOrder(): Promise<number> {
    const heroesRef = collection(this.firestore, this.collectionName);
    const q = query(heroesRef, orderBy('order', 'desc'), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const highestOrder = snapshot.docs[0].data()['order'] || 0;
      return highestOrder + 1;
    }
    return 1;
  }

  private async uploadHeroImage(
    heroId: string,
    file: File,
    type: 'desktop' | 'mobile',
    config: HeroImageConfig
  ): Promise<string> {
    try {
      const compressedFile = await this.compressImageWithConfig(file, config);
      const timestamp = Date.now();
      const uniqueId = Math.random().toString(36).substring(2, 8);
      const extension = config.format;
      const path = `heroes/${heroId}/${timestamp}_${uniqueId}_${type}.${extension}`;

      const storageRef = ref(this.storage, path);
      await uploadBytes(storageRef, compressedFile);
      return await getDownloadURL(storageRef);

    } catch (error: any) {
      console.error(`Error al subir imagen ${type}:`, error);
      throw new Error(`Error al subir imagen ${type}: ${error.message}`);
    }
  }

  private async compressImageWithConfig(file: File, config: HeroImageConfig): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.onerror = () => reject('Error al leer archivo');
      reader.readAsDataURL(file);

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject('No se pudo obtener contexto del canvas');
            return;
          }

          const scale = Math.min(
            config.maxWidth / img.width,
            config.maxHeight / img.height,
            1
          );

          canvas.width = Math.floor(img.width * scale);
          canvas.height = Math.floor(img.height * scale);

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject('Error al generar blob');
              }
            },
            `image/${config.format}`,
            config.quality
          );

        } catch (error) {
          reject(`Error al procesar imagen: ${error}`);
        }
      };

      img.onerror = () => reject('Error al cargar imagen');
    });
  }

  private async deleteImageFromStorage(imageUrl: string): Promise<void> {
    try {
      if (!imageUrl) return;

      const imagePath = this.extractPathFromFirebaseUrl(imageUrl);
      if (!imagePath) return;

      const imageRef = ref(this.storage, imagePath);
      await deleteObject(imageRef);

    } catch (error: any) {
      if (error.code !== 'storage/object-not-found') {
        console.error('Error al eliminar imagen:', error);
      }
    }
  }

  private async deleteHeroFolder(heroId: string): Promise<void> {
    try {
      const folderRef = ref(this.storage, `heroes/${heroId}`);
      const listResult = await listAll(folderRef);
      
      const deletePromises = listResult.items.map(async (itemRef) => {
        try {
          await deleteObject(itemRef);
        } catch (error: any) {
          if (error.code !== 'storage/object-not-found') {
            console.warn('Error al eliminar archivo:', itemRef.fullPath);
          }
        }
      });

      await Promise.allSettled(deletePromises);

    } catch (error: any) {
      if (error.code !== 'storage/object-not-found') {
        console.warn('Error al limpiar carpeta del hero:', error);
      }
    }
  }

  private extractPathFromFirebaseUrl(url: string): string | null {
    try {
      if (!url) return null;

      if (url.includes('firebasestorage.googleapis.com')) {
        const urlObj = new URL(url);
        const pathMatch = urlObj.pathname.match(/\/o\/(.+?)(\?|$)/);
        
        if (pathMatch && pathMatch[1]) {
          return decodeURIComponent(pathMatch[1]);
        }
      }

      if (url.includes('/v0/b/') && url.includes('/o/')) {
        const match = url.match(/\/o\/([^?]+)/);
        if (match && match[1]) {
          return decodeURIComponent(match[1]);
        }
      }

      return null;

    } catch (error) {
      console.error('Error al extraer path de URL:', error);
      return null;
    }
  }

  private convertToDate(value: any): Date | undefined {
    if (!value) return undefined;

    try {
      if (value && typeof value.toDate === 'function') {
        return value.toDate();
      }

      if (typeof value === 'number') {
        return new Date(value);
      }

      if (value instanceof Date) {
        return value;
      }

      if (typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }

      if (value && typeof value === 'object' && value.seconds) {
        return new Date(value.seconds * 1000);
      }

    } catch (error) {
      console.error('Error al convertir a fecha:', error);
    }

    return undefined;
  }
}