import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc, getDoc, query, where } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

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
  private categoriesCache$?: Observable<Category[]>;

  constructor(
    private firestore: Firestore,
    private storage: Storage
  ) {}

  // Obtener todas las categorías con caché
  getCategories(): Observable<Category[]> {
  if (!this.categoriesCache$) {
    const categoriesRef = collection(this.firestore, this.collectionName);
    this.categoriesCache$ = collectionData(categoriesRef, { idField: 'id' }).pipe(
      map(data => data as Category[]),   // fuerza el tipo aquí
      shareReplay(1)
    );
  }
  return this.categoriesCache$;
}

  private invalidateCache() {
    this.categoriesCache$ = undefined;
  }

  // Obtener categoría por slug
  getCategoryBySlug(slug: string): Observable<Category[]> {
    const categoriesRef = collection(this.firestore, this.collectionName);
    const q = query(categoriesRef, where('slug', '==', slug));
    return collectionData(q, { idField: 'id' }) as Observable<Category[]>;
  }

  // Crear una nueva categoría
  async createCategory(category: Omit<Category, 'id' | 'imageUrl'>, imageFile: File): Promise<string> {
    const categoriesRef = collection(this.firestore, this.collectionName);
    const id = uuidv4();
    const imagePath = `categories/${id}/main.webp`;

    try {
      const imageUrl = await this.uploadImage(imagePath, imageFile);
      const newCategory = { ...category, imageUrl };

      const docRef = await addDoc(categoriesRef, newCategory);
      this.invalidateCache();
      return docRef.id;
    } catch (error: any) {
      throw new Error(`Error al crear la categoría: ${error.message}`);
    }
  }

  // Actualizar una categoría existente
  async updateCategory(id: string, data: Partial<Category>, imageFile?: File): Promise<void> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    const updatedData: Partial<Category> = { ...data };

    if (imageFile) {
      const current = await this.getCategoryById(id);
      if (current?.imageUrl) {
        try {
          const oldImageRef = ref(this.storage, current.imageUrl);
          await deleteObject(oldImageRef);
        } catch (e) {
          console.warn('No se pudo eliminar la imagen anterior:', e);
        }
      }

      updatedData.imageUrl = await this.uploadImage(`categories/${id}/main.webp`, imageFile);
    }

    await updateDoc(docRef, updatedData);
    this.invalidateCache();
  }

  // Eliminar una categoría y su imagen
  async deleteCategory(id: string): Promise<void> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    const category = await this.getCategoryById(id);

    if (!category) {
      throw new Error(`La categoría con ID ${id} no existe.`);
    }

    if (category.imageUrl) {
      try {
        const imageRef = ref(this.storage, category.imageUrl);
        await deleteObject(imageRef);
      } catch (e) {
        console.warn('No se pudo eliminar la imagen:', e);
      }
    }

    await deleteDoc(docRef);
    this.invalidateCache();
  }

  // Obtener categoría por ID
  async getCategoryById(id: string): Promise<Category | undefined> {
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
