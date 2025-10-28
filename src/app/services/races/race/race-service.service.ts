import { Injectable } from '@angular/core';
import { 
  Firestore, 
  collection, 
  collectionData, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  getDocs
} from '@angular/fire/firestore';
import { 
  Storage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from '@angular/fire/storage';
import { Observable, from, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { CacheService } from '../../admin/cache/cache.service';
import { ErrorUtil } from '../../../utils/error-util';
import { Race, RaceFilter } from '../../../models/race.model';

@Injectable({
  providedIn: 'root'
})
export class RaceService {
  private collectionName = 'races';
  private cacheKey = 'races';
  
  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private cacheService: CacheService
  ) { }

  // ==================== MÉTODOS DE LECTURA ====================

  /**
   * Obtener todas las carreras con caché
   */
  getRaces(): Observable<Race[]> {
    return this.cacheService.getCached<Race[]>(this.cacheKey, () => {
      const racesRef = collection(this.firestore, this.collectionName);
      const q = query(racesRef, orderBy('fecha', 'desc'));
      
      return collectionData(q, { idField: 'id' }).pipe(
        map(data => this.convertTimestamps(data as any[])),
        catchError(error => ErrorUtil.handleError(error, 'getRaces'))
      );
    });
  }

  /**
   * Obtener solo carreras activas y publicadas
   */
  getActiveRaces(): Observable<Race[]> {
    const cacheKey = `${this.cacheKey}_active`;
    return this.cacheService.getCached<Race[]>(cacheKey, () => {
      const racesRef = collection(this.firestore, this.collectionName);
      const now = new Date();
      
      const q = query(
        racesRef,
        where('activo', '==', true),
        where('publicado', '==', true),
        where('fechaInscripcionCierre', '>', Timestamp.fromDate(now)),
        orderBy('fechaInscripcionCierre', 'asc'),
        orderBy('fecha', 'asc')
      );
      
      return collectionData(q, { idField: 'id' }).pipe(
        map(data => this.convertTimestamps(data as any[])),
        catchError(error => ErrorUtil.handleError(error, 'getActiveRaces'))
      );
    });
  }

  /**
   * Obtener carreras destacadas (para home)
   */
  getFeaturedRaces(): Observable<Race[]> {
    const cacheKey = `${this.cacheKey}_featured`;
    return this.cacheService.getCached<Race[]>(cacheKey, () => {
      const racesRef = collection(this.firestore, this.collectionName);
      const now = new Date();
      
      const q = query(
        racesRef,
        where('activo', '==', true),
        where('publicado', '==', true),
        where('destacado', '==', true),
        where('fechaInscripcionCierre', '>', Timestamp.fromDate(now)),
        orderBy('fechaInscripcionCierre', 'asc')
      );
      
      return collectionData(q, { idField: 'id' }).pipe(
        map(data => this.convertTimestamps(data as any[])),
        catchError(error => ErrorUtil.handleError(error, 'getFeaturedRaces'))
      );
    });
  }

  /**
   * Obtener carrera por ID
   */
  getRaceById(id: string): Observable<Race | undefined> {
    const cacheKey = `${this.cacheKey}_id_${id}`;
    return this.cacheService.getCached<Race | undefined>(cacheKey, () => {
      return from(this.fetchRaceById(id)).pipe(
        catchError(error => ErrorUtil.handleError(error, `getRaceById(${id})`))
      );
    });
  }

  /**
   * Obtener carrera por slug
   */
  getRaceBySlug(slug: string): Observable<Race | undefined> {
    const cacheKey = `${this.cacheKey}_slug_${slug}`;
    return this.cacheService.getCached<Race | undefined>(cacheKey, () => {
      const racesRef = collection(this.firestore, this.collectionName);
      const q = query(racesRef, where('slug', '==', slug));
      
      return from(getDocs(q)).pipe(
        map(snapshot => {
          if (snapshot.empty) return undefined;
          const doc = snapshot.docs[0];
          return this.convertTimestamp({ id: doc.id, ...doc.data() } as any);
        }),
        catchError(error => ErrorUtil.handleError(error, `getRaceBySlug(${slug})`))
      );
    });
  }

  /**
   * Filtrar carreras
   */
  filterRaces(filters: RaceFilter): Observable<Race[]> {
    return this.getRaces().pipe(
      map(races => {
        let filtered = races;

        if (filters.categoria) {
          filtered = filtered.filter(r => r.categoria === filters.categoria);
        }

        if (filters.dificultad) {
          filtered = filtered.filter(r => r.dificultad === filters.dificultad);
        }

        if (filters.tipoEvento) {
          filtered = filtered.filter(r => r.tipoEvento === filters.tipoEvento);
        }

        if (filters.provincia) {
          filtered = filtered.filter(r => r.provincia === filters.provincia);
        }

        if (filters.fechaDesde) {
          filtered = filtered.filter(r => r.fecha >= filters.fechaDesde!);
        }

        if (filters.fechaHasta) {
          filtered = filtered.filter(r => r.fecha <= filters.fechaHasta!);
        }

        if (filters.precioMax) {
          filtered = filtered.filter(r => r.precio <= filters.precioMax!);
        }

        if (filters.soloDisponibles) {
          filtered = filtered.filter(r => 
            !r.cupoMaximo || r.inscritosActuales < r.cupoMaximo
          );
        }

        return filtered;
      })
    );
  }

  // ==================== MÉTODOS DE ESCRITURA ====================

  /**
   * Crear una nueva carrera
   */
  createRace(
    race: Omit<Race, 'id' | 'createdAt' | 'updatedAt' | 'imagenPrincipal'>,
    imageFile: File,
    galleryFiles?: File[]
  ): Observable<string> {
    const raceId = uuidv4();
    
    // Subir imagen principal
    return from(this.uploadImage(`races/${raceId}/main.webp`, imageFile)).pipe(
      switchMap(imagenPrincipal => {
        // Subir galería si existe
        if (galleryFiles && galleryFiles.length > 0) {
          return from(this.uploadGallery(raceId, galleryFiles)).pipe(
            map(galeria => ({ imagenPrincipal, galeria }))
          );
        }
        return of({ imagenPrincipal, galeria: [] });
      }),
      switchMap(({ imagenPrincipal, galeria }) => {
        const racesRef = collection(this.firestore, this.collectionName);
        
        const newRace: any = {
          ...race,
          imagenPrincipal,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        if (galeria && galeria.length > 0) {
          newRace.galeria = galeria;
        }
        
        return from(addDoc(racesRef, newRace));
      }),
      map(docRef => {
        this.invalidateCache();
        return docRef.id;
      }),
      catchError(error => ErrorUtil.handleError(error, 'createRace'))
    );
  }

  /**
   * Actualizar una carrera existente
   */
  updateRace(
    id: string,
    data: Partial<Race>,
    imageFile?: File,
    galleryFiles?: File[]
  ): Observable<void> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    
    return from(this.getRaceById(id)).pipe(
      switchMap(currentRace => {
        if (!currentRace) {
          throw new Error(`La carrera con ID ${id} no existe`);
        }

        // Manejar imagen principal nueva
        let imageUpload$ = of<string | undefined>(undefined);
        if (imageFile) {
          imageUpload$ = from(this.deleteImageIfExists(currentRace.imagenPrincipal)).pipe(
            catchError(() => of(undefined)),
            switchMap(() => this.uploadImage(`races/${id}/main.webp`, imageFile))
          );
        }

        // Manejar galería nueva
        let galleryUpload$ = of<string[] | undefined>(undefined);
        if (galleryFiles && galleryFiles.length > 0) {
          galleryUpload$ = from(this.uploadGallery(id, galleryFiles));
        }

        return imageUpload$.pipe(
          switchMap(imagenPrincipal => 
            galleryUpload$.pipe(
              map(galeria => ({ imagenPrincipal, galeria }))
            )
          ),
          switchMap(({ imagenPrincipal, galeria }) => {
            const updatedData: any = {
              ...data,
              updatedAt: serverTimestamp()
            };

            if (imagenPrincipal) {
              updatedData.imagenPrincipal = imagenPrincipal;
            }

            if (galeria && galeria.length > 0) {
              updatedData.galeria = galeria;
            }

            return from(updateDoc(docRef, updatedData));
          })
        );
      }),
      map(() => {
        this.invalidateCache();
      }),
      catchError(error => ErrorUtil.handleError(error, `updateRace(${id})`))
    );
  }

  /**
   * Eliminar una carrera
   */
  deleteRace(id: string): Observable<void> {
    return from(this.getRaceById(id)).pipe(
      switchMap(race => {
        if (!race) {
          throw new Error(`La carrera con ID ${id} no existe`);
        }

        // Eliminar imagen principal
        const deleteImage$ = race.imagenPrincipal 
          ? from(this.deleteImageIfExists(race.imagenPrincipal)).pipe(catchError(() => of(undefined)))
          : of(undefined);

        // Eliminar galería
        const deleteGallery$ = race.galeria && race.galeria.length > 0
          ? from(Promise.all(race.galeria.map(url => this.deleteImageIfExists(url)))).pipe(catchError(() => of(undefined)))
          : of(undefined);

        return deleteImage$.pipe(
          switchMap(() => deleteGallery$),
          switchMap(() => {
            const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
            return from(deleteDoc(docRef));
          })
        );
      }),
      map(() => {
        this.invalidateCache();
      }),
      catchError(error => ErrorUtil.handleError(error, `deleteRace(${id})`))
    );
  }

  /**
   * Incrementar el contador de inscritos
   */
  incrementInscriptions(raceId: string): Observable<void> {
    return from(this.getRaceById(raceId)).pipe(
      switchMap(race => {
        if (!race) {
          throw new Error(`La carrera con ID ${raceId} no existe`);
        }

        const docRef = doc(this.firestore, `${this.collectionName}/${raceId}`);
        const newCount = race.inscritosActuales + 1;

        return from(updateDoc(docRef, {
          inscritosActuales: newCount,
          updatedAt: serverTimestamp()
        }));
      }),
      map(() => {
        this.invalidateCache();
      }),
      catchError(error => ErrorUtil.handleError(error, `incrementInscriptions(${raceId})`))
    );
  }

  /**
   * Verificar disponibilidad de cupos
   */
  checkAvailability(raceId: string): Observable<boolean> {
    return this.getRaceById(raceId).pipe(
      map(race => {
        if (!race) return false;
        if (!race.cupoMaximo) return true; // Sin límite
        return race.inscritosActuales < race.cupoMaximo;
      })
    );
  }

  // ==================== MÉTODOS PRIVADOS ====================

  /**
   * Obtener carrera por ID desde Firestore
   */
  private async fetchRaceById(id: string): Promise<Race | undefined> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return this.convertTimestamp({ id: docSnap.id, ...docSnap.data() } as any);
    }
    return undefined;
  }

  /**
   * Subir imagen a Storage
   */
  private async uploadImage(path: string, file: File): Promise<string> {
    const compressed = await this.compressImage(file);
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, compressed);
    return await getDownloadURL(storageRef);
  }

  /**
   * Subir múltiples imágenes para galería
   */
  private async uploadGallery(raceId: string, files: File[]): Promise<string[]> {
    const uploadPromises = files.map((file, index) => 
      this.uploadImage(`races/${raceId}/gallery/${index}-${uuidv4()}.webp`, file)
    );
    return Promise.all(uploadPromises);
  }

  /**
   * Eliminar imagen si existe
   */
  private async deleteImageIfExists(imageUrl?: string): Promise<void> {
    if (!imageUrl) return;
    
    try {
      const imageRef = ref(this.storage, imageUrl);
      await deleteObject(imageRef);
    } catch (e) {
      console.warn('No se pudo eliminar la imagen:', e);
    }
  }

  /**
   * Comprimir imagen y convertir a webp
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
        const MAX_WIDTH = 1200;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No se pudo obtener el contexto del canvas');

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject('Error al comprimir imagen')),
          'image/webp',
          0.85
        );
      };
    });
  }

  /**
   * Convertir Timestamps de Firestore a Date
   */
  private convertTimestamp(data: any): Race {
    const converted = { ...data };
    
    if (data.fecha?.toDate) {
      converted.fecha = data.fecha.toDate();
    }
    if (data.fechaInscripcionInicio?.toDate) {
      converted.fechaInscripcionInicio = data.fechaInscripcionInicio.toDate();
    }
    if (data.fechaInscripcionCierre?.toDate) {
      converted.fechaInscripcionCierre = data.fechaInscripcionCierre.toDate();
    }
    if (data.createdAt?.toDate) {
      converted.createdAt = data.createdAt.toDate();
    }
    if (data.updatedAt?.toDate) {
      converted.updatedAt = data.updatedAt.toDate();
    }
    
    return converted as Race;
  }

  /**
   * Convertir array de Timestamps
   */
  private convertTimestamps(data: any[]): Race[] {
    return data.map(item => this.convertTimestamp(item));
  }

  /**
   * Invalidar caché
   */
  invalidateCache(): void {
    this.cacheService.invalidate(this.cacheKey);
  }
}