import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc, getDoc, query, where } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, of, from } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { CacheService } from '../cache/cache.service';
import { ErrorUtil } from '../../../utils/error-util';

export interface Category {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  slug: string;
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private collectionName = 'categories';
  private cacheKey = 'categories';
  
  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private cacheService: CacheService
  ) { }

  // Obtener todas las categorías con caché
  getCategories(): Observable<Category[]> {
    return this.cacheService.getCached<Category[]>(this.cacheKey, () => {
      const categoriesRef = collection(this.firestore, this.collectionName);
      return collectionData(categoriesRef, { idField: 'id' }).pipe(
        map(data => data as Category[]),
        catchError(error => ErrorUtil.handleError(error, 'getCategories'))
      );
    });
  }

  // Invalidar caché
  invalidateCache(): void {
    this.cacheService.invalidate(this.cacheKey);
  }

  // Obtener categoría por slug
  getCategoryBySlug(slug: string): Observable<Category[]> {
    const cacheKey = `${this.cacheKey}_slug_${slug}`;
    return this.cacheService.getCached<Category[]>(cacheKey, () => {
      const categoriesRef = collection(this.firestore, this.collectionName);
      const q = query(categoriesRef, where('slug', '==', slug));
      return collectionData(q, { idField: 'id' }).pipe(
        map(data => data as Category[]),
        catchError(error => ErrorUtil.handleError(error, `getCategoryBySlug(${slug})`))
      );
    });
  }

  // Crear una nueva categoría
  createCategory(category: Omit<Category, 'id' | 'imageUrl'>, imageFile: File): Observable<string> {
    return from(this.uploadImage(`categories/${uuidv4()}/main.webp`, imageFile)).pipe(
      switchMap(imageUrl => {
        const categoriesRef = collection(this.firestore, this.collectionName);
        const newCategory = { ...category, imageUrl };
        return from(addDoc(categoriesRef, newCategory));
      }),
      map(docRef => {
        this.invalidateCache();
        return docRef.id;
      }),
      catchError(error => ErrorUtil.handleError(error, 'createCategory'))
    );
  }

  // Actualizar una categoría existente
  updateCategory(id: string, data: Partial<Category>, imageFile?: File): Observable<void> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    
    // Si hay imagen nueva, primero subir y luego actualizar el documento
    if (imageFile) {
      return from(this.getCategoryById(id)).pipe(
        switchMap(current => {
          if (current?.imageUrl) {
            // Intentar eliminar la imagen anterior
            return from(this.deleteImageIfExists(current.imageUrl)).pipe(
              catchError(() => of(undefined)) // Si falla la eliminación, continuamos igual
            );
          }
          return of(undefined);
        }),
        switchMap(() => this.uploadImage(`categories/${id}/main.webp`, imageFile)),
        switchMap(imageUrl => {
          const updatedData = { ...data, imageUrl };
          return from(updateDoc(docRef, updatedData));
        }),
        map(() => {
          this.invalidateCache();
        }),
        catchError(error => ErrorUtil.handleError(error, `updateCategory(${id})`))
      );
    }
    
    // Si no hay imagen nueva, solo actualizar datos
    return from(updateDoc(docRef, data)).pipe(
      map(() => {
        this.invalidateCache();
      }),
      catchError(error => ErrorUtil.handleError(error, `updateCategory(${id})`))
    );
  }

  // Eliminar una categoría y su imagen
  deleteCategory(id: string): Observable<void> {
    return from(this.getCategoryById(id)).pipe(
      switchMap(category => {
        if (!category) {
          return ErrorUtil.handleError(`La categoría con ID ${id} no existe.`, `deleteCategory(${id})`);
        }
        
        // Eliminar imagen si existe
        if (category.imageUrl) {
          return from(this.deleteImageIfExists(category.imageUrl)).pipe(
            catchError(() => of(undefined)), // Continuar incluso si la eliminación de la imagen falla
            switchMap(() => {
              const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
              return from(deleteDoc(docRef));
            })
          );
        }
        
        // Si no hay imagen, solo eliminar el documento
        const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
        return from(deleteDoc(docRef));
      }),
      map(() => {
        this.invalidateCache();
      }),
      catchError(error => ErrorUtil.handleError(error, `deleteCategory(${id})`))
    );
  }

  // Obtener categoría por ID
  getCategoryById(id: string): Observable<Category | undefined> {
    const cacheKey = `${this.cacheKey}_id_${id}`;
    return this.cacheService.getCached<Category | undefined>(cacheKey, () => {
      return from(this.fetchCategoryById(id)).pipe(
        catchError(error => ErrorUtil.handleError(error, `getCategoryById(${id})`))
      );
    });
  }

  // Método privado para obtener categoría de Firestore
  private async fetchCategoryById(id: string): Promise<Category | undefined> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Category;
    }
    return undefined;
  }

  // Subir imagen a Storage con compresión y formato .webp
  private async uploadImage(path: string, file: File): Promise<string> {
    const compressed = await this.compressImage(file);
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, compressed);
    return await getDownloadURL(storageRef);
  }

  // Eliminar imagen si existe
  private async deleteImageIfExists(imageUrl: string): Promise<void> {
    try {
      const imageRef = ref(this.storage, imageUrl);
      await deleteObject(imageRef);
    } catch (e) {
      console.warn('No se pudo eliminar la imagen:', e);
    }
  }

  // Comprimir imagen y convertir a webp
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