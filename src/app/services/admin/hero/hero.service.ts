
import { Injectable } from '@angular/core';
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
  limit
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, shareReplay, catchError } from 'rxjs/operators';

// Interfaz para los heroes/banners
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
}

@Injectable({
  providedIn: 'root'
})
export class HeroService {
  private collectionName = 'heroes';
  private heroesCache$?: Observable<HeroItem[]>;
  private activeHero$ = new BehaviorSubject<HeroItem | null>(null);

  constructor(
    private firestore: Firestore,
    private storage: Storage
  ) {
    // Cargar el hero activo al inicializar el servicio
    this.loadActiveHero();
  }
  
  /**
   * Refresca los datos del hero activo (útil para llamar después de cambios)
   */
  refreshActiveHero(): void {
    this.loadActiveHero();
  }

  /**
   * Obtiene el hero activo como Observable
   */
  getActiveHero(): Observable<HeroItem | null> {
    return this.activeHero$.asObservable();
  }

  /**
   * Carga el hero activo en el BehaviorSubject
   */
  private loadActiveHero(): void {
    // Obtener todos los héroes y filtrar en memoria
    const heroesRef = collection(this.firestore, this.collectionName);
    
    // Query simple para obtener los héroes ordenados
    const q = query(heroesRef, orderBy('order', 'asc'));
    
    getDocs(q)
      .then(snapshot => {
        if (!snapshot.empty) {
          // Filtrar héroes activos y dentro del rango de fechas
          const now = new Date();
          const activeHeroes = snapshot.docs
            .map(doc => this.convertToHeroItem(doc.id, doc.data()))
            .filter(hero => 
              hero.isActive && 
              (!hero.startDate || hero.startDate <= now) &&
              (!hero.endDate || hero.endDate >= now)
            );
          
          if (activeHeroes.length > 0) {
            this.activeHero$.next(activeHeroes[0]);
          } else {
            this.loadDefaultHero();
          }
        } else {
          this.loadDefaultHero();
        }
      })
      .catch(error => {
        console.error('Error al consultar héroes:', error);
        this.loadDefaultHero();
      });
  }

  /**
   * Carga un héroe predeterminado cuando no hay ninguno disponible
   */
  private loadDefaultHero(): void {
    this.activeHero$.next({
      id: 'default',
      title: 'Para las Montañas y Más Allá',
      subtitle: 'Numer Equipment: Equipamiento innovador para deportes de aventura, senderismo y montaña.',
      ctaText: 'Ver Novedades',
      ctaLink: '/new-arrivals',
      imageUrl: 'https://i.postimg.cc/sDNm0F60/255-1.gif',
      isGif: true,
      isActive: true,
      order: 1
    });
  }

  /**
   * Obtiene todos los héroes con caché
   */
  getHeroes(): Observable<HeroItem[]> {
    if (!this.heroesCache$) {
      const heroesRef = collection(this.firestore, this.collectionName);
      const q = query(heroesRef, orderBy('order', 'asc'));

      this.heroesCache$ = collectionData(q, { idField: 'id' }).pipe(
        map(data => this.mapHeroesData(data as any[])),
        shareReplay(1),
        catchError(error => {
          console.error('Error al obtener héroes:', error);
          return of([]);
        })
      );
    }
    return this.heroesCache$;
  }

  /**
   * Obtiene un hero por ID
   */
  async getHeroById(id: string): Promise<HeroItem | null> {
    try {
      const docRef = doc(this.firestore, this.collectionName, id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      return this.convertToHeroItem(docSnap.id, docSnap.data());
    } catch (error) {
      console.error(`Error al obtener hero ${id}:`, error);
      return null;
    }
  }

  /**
   * Crea un nuevo hero
   */
  async createHero(
    hero: Omit<HeroItem, 'id' | 'imageUrl' | 'mobileImageUrl'>,
    imageFile: File,
    mobileImageFile?: File
  ): Promise<string> {
    try {
      // Subir la imagen principal
      const imageUrl = await this.uploadImage(imageFile, 'main');

      // Subir la imagen para móvil si existe
      let mobileImageUrl: string | undefined = undefined;
      if (mobileImageFile) {
        mobileImageUrl = await this.uploadImage(mobileImageFile, 'mobile');
      }

      // Crear el objeto a guardar
      const heroData: any = {
        title: hero.title,
        subtitle: hero.subtitle,
        ctaText: hero.ctaText,
        ctaLink: hero.ctaLink,
        imageUrl,
        isGif: hero.isGif || false,
        isActive: hero.isActive || false,
        order: hero.order || 999,
        createdAt: new Date()
      };

      // Añadir campos opcionales si tienen valor
      if (mobileImageUrl) heroData.mobileImageUrl = mobileImageUrl;
      if (hero.backgroundColor) heroData.backgroundColor = hero.backgroundColor;
      if (hero.textColor) heroData.textColor = hero.textColor;
      if (hero.startDate) heroData.startDate = hero.startDate;
      if (hero.endDate) heroData.endDate = hero.endDate;

      // Guardar en Firestore
      const docRef = await addDoc(collection(this.firestore, this.collectionName), heroData);

      // Invalidar caché
      this.invalidateCache();

      // Si es activo, actualizar el BehaviorSubject
      if (hero.isActive) {
        this.loadActiveHero();
      }

      return docRef.id;
    } catch (error: any) {
      console.error('Error al crear hero:', error);
      throw new Error(`Error al crear hero: ${error.message}`);
    }
  }

  /**
   * Actualiza un hero existente
   */
  async updateHero(
    id: string,
    hero: Partial<HeroItem>,
    imageFile?: File,
    mobileImageFile?: File
  ): Promise<void> {
    try {
      // Crear un objeto para las actualizaciones
      const updates: any = { ...hero };
      delete updates.id; // Eliminar el id si está presente
      updates.updatedAt = new Date();

      // Si hay nueva imagen principal
      if (imageFile) {
        const currentHero = await this.getHeroById(id);
        if (currentHero?.imageUrl) {
          await this.deleteImage(currentHero.imageUrl);
        }
        updates.imageUrl = await this.uploadImage(imageFile, 'main');
      }

      // Si hay nueva imagen para móvil
      if (mobileImageFile) {
        const currentHero = await this.getHeroById(id);
        if (currentHero?.mobileImageUrl) {
          await this.deleteImage(currentHero.mobileImageUrl);
        }
        updates.mobileImageUrl = await this.uploadImage(mobileImageFile, 'mobile');
      }

      // Actualizar en Firestore
      const docRef = doc(this.firestore, this.collectionName, id);
      await updateDoc(docRef, updates);

      // Invalidar caché
      this.invalidateCache();

      // Si es el hero activo o cambia el estado activo, recargar
      const currentActive = this.activeHero$.getValue();
      if (currentActive?.id === id || hero.isActive !== undefined) {
        this.loadActiveHero();
      }
    } catch (error: any) {
      console.error(`Error al actualizar hero ${id}:`, error);
      throw new Error(`Error al actualizar hero: ${error.message}`);
    }
  }

  /**
   * Elimina un hero
   */
  async deleteHero(id: string): Promise<void> {
    try {
      // Obtener el hero primero para eliminar sus imágenes
      const hero = await this.getHeroById(id);
      if (!hero) {
        throw new Error(`El hero con ID ${id} no existe.`);
      }

      // Eliminar imágenes
      if (hero.imageUrl) {
        await this.deleteImage(hero.imageUrl);
      }

      if (hero.mobileImageUrl) {
        await this.deleteImage(hero.mobileImageUrl);
      }

      // Eliminar documento
      const docRef = doc(this.firestore, this.collectionName, id);
      await deleteDoc(docRef);

      // Invalidar caché
      this.invalidateCache();

      // Si era el hero activo, cargar uno nuevo
      const currentActive = this.activeHero$.getValue();
      if (currentActive?.id === id) {
        this.loadActiveHero();
      }
    } catch (error: any) {
      console.error(`Error al eliminar hero ${id}:`, error);
      throw new Error(`Error al eliminar hero: ${error.message}`);
    }
  }

  /**
   * Establece un hero como activo
   */
  async setActiveHero(id: string): Promise<void> {
    try {
      // Obtener el hero para confirmar que existe
      const hero = await this.getHeroById(id);
      if (!hero) {
        throw new Error(`El hero con ID ${id} no existe.`);
      }

      // Desactivar todos los héroes actuales
      const activeHeroesQuery = query(
        collection(this.firestore, this.collectionName),
        where('isActive', '==', true)
      );

      const activeHeroesSnapshot = await getDocs(activeHeroesQuery);

      // Crear un batch para actualizar todo de una vez
      const batch = writeBatch(this.firestore);

      // Desactivar todos los héroes activos actuales
      activeHeroesSnapshot.forEach(docSnapshot => {
        const heroRef = doc(this.firestore, this.collectionName, docSnapshot.id);
        batch.update(heroRef, { isActive: false });
      });

      // Activar el nuevo hero
      const heroRef = doc(this.firestore, this.collectionName, id);
      batch.update(heroRef, {
        isActive: true,
        updatedAt: new Date()
      });

      // Ejecutar todas las operaciones
      await batch.commit();

      // Invalidar caché
      this.invalidateCache();

      // Actualizar el hero activo
      this.activeHero$.next(hero);
    } catch (error: any) {
      console.error(`Error al establecer hero activo ${id}:`, error);
      throw new Error(`Error al establecer hero activo: ${error.message}`);
    }
  }

  /**
   * Actualiza el orden de varios héroes
   */
  async updateHeroesOrder(orderedIds: string[]): Promise<void> {
    try {
      // Crear un batch para actualizar todo de una vez
      const batch = writeBatch(this.firestore);

      // Actualizar el orden de cada hero
      orderedIds.forEach((id, index) => {
        const heroRef = doc(this.firestore, this.collectionName, id);
        batch.update(heroRef, {
          order: index + 1,
          updatedAt: new Date()
        });
      });

      // Ejecutar todas las operaciones
      await batch.commit();

      // Invalidar caché
      this.invalidateCache();

      // Recargar el hero activo
      this.loadActiveHero();
    } catch (error: any) {
      console.error('Error al actualizar orden de héroes:', error);
      throw new Error(`Error al actualizar orden: ${error.message}`);
    }
  }

  /**
   * Sube una imagen a Firebase Storage
   */
  private async uploadImage(file: File, type: string): Promise<string> {
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const path = `heroes/${uniqueId}/${type}.${file.name.split('.').pop()}`;
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  }

  /**
   * Elimina una imagen de Firebase Storage
   */
  private async deleteImage(imageUrl: string): Promise<void> {
    try {
      // Extraer la ruta del storage de la URL
      const storageRef = ref(this.storage, this.getPathFromUrl(imageUrl));
      await deleteObject(storageRef);
    } catch (error) {
      console.warn('No se pudo eliminar la imagen:', error);
    }
  }

  /**
   * Extrae la ruta de storage de una URL de Firebase Storage
   */
  private getPathFromUrl(url: string): string {
    // Extraer el path de la URL de Firebase Storage
    const decodedUrl = decodeURIComponent(url);
    const startToken = 'https://firebasestorage.googleapis.com/v0/b/';
    const tokenEnd = '/o/';
    const startIndex = decodedUrl.indexOf(startToken) + startToken.length;
    const endIndex = decodedUrl.indexOf(tokenEnd, startIndex);
    const bucketName = decodedUrl.substring(startIndex, endIndex);
    
    let pathStartIndex = decodedUrl.indexOf(tokenEnd) + tokenEnd.length;
    let fullPath = decodedUrl.substring(pathStartIndex);
    
    // Remover query parameters
    const questionMarkIndex = fullPath.indexOf('?');
    if (questionMarkIndex !== -1) {
      fullPath = fullPath.substring(0, questionMarkIndex);
    }
    
    return fullPath;
  }

  /**
   * Invalida la caché de héroes
   */
  private invalidateCache(): void {
    this.heroesCache$ = undefined;
  }

  /**
   * Mapea los datos de héroes desde Firestore
   */
  private mapHeroesData(data: any[]): HeroItem[] {
    return data.map(item => this.convertToHeroItem(item.id, item));
  }

  /**
   * Convierte datos de Firestore a un objeto HeroItem
   */
  private convertToHeroItem(id: string, data: any): HeroItem {
    // Convertir timestamps de Firestore a Date
    const startDate = this.convertToDate(data.startDate);
    const endDate = this.convertToDate(data.endDate);

    return {
      id: id,
      title: data.title || '',
      subtitle: data.subtitle || '',
      ctaText: data.ctaText || '',
      ctaLink: data.ctaLink || '',
      imageUrl: data.imageUrl || '',
      isGif: data.isGif === true,
      isActive: data.isActive === true,
      order: data.order || 999,
      mobileImageUrl: data.mobileImageUrl,
      backgroundColor: data.backgroundColor,
      textColor: data.textColor,
      startDate: startDate,
      endDate: endDate
    };
  }

  /**
   * Convierte varios tipos de fecha a objeto Date
   */
  private convertToDate(value: any): Date | undefined {
    if (!value) return undefined;
    
    try {
      // Si es un timestamp de Firestore
      if (value && typeof value.toDate === 'function') {
        return value.toDate();
      }
      
      // Si es un timestamp numérico
      if (typeof value === 'number') {
        return new Date(value);
      }
      
      // Si ya es un objeto Date
      if (value instanceof Date) {
        return value;
      }
      
      // Si es un string que representa una fecha
      if (typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    } catch (error) {
      console.error('Error al convertir a fecha:', error);
    }
    
    return undefined;
  }
}