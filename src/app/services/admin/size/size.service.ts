import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, getDoc, addDoc, updateDoc, deleteDoc, query, where } from '@angular/fire/firestore';
import { Observable, map, shareReplay } from 'rxjs';
import { Size } from '../../../models/models';
import { ProductImageService } from '../image/product-image.service';

@Injectable({
  providedIn: 'root'
})
export class SizeService {
  private collectionName = 'sizes';
  private sizesCache$?: Observable<Size[]>;

  constructor(
    private firestore: Firestore,
    private imageService: ProductImageService
  ) { }

  // Obtener todas las tallas con caché
  getSizes(): Observable<Size[]> {
    if (!this.sizesCache$) {
      const sizesRef = collection(this.firestore, this.collectionName);
      this.sizesCache$ = collectionData(sizesRef, { idField: 'id' }).pipe(
        map(data => data as Size[]),
        shareReplay(1)
      );
    }
    return this.sizesCache$;
  }

  // Invalidar caché
  invalidateCache(): void {
    this.sizesCache$ = undefined;
  }

  // Crear una nueva talla
  async createSize(size: Omit<Size, 'id'>, imageFile?: File): Promise<string> {
    try {
      const sizesRef = collection(this.firestore, this.collectionName);

      // Si hay imagen, subirla primero
      let imageUrl = '';
      if (imageFile) {
        imageUrl = await this.imageService.uploadCompressedImage(
          `sizes/${size.name.toLowerCase()}.webp`,
          imageFile
        );
      }

      // Crear el documento con la URL de la imagen
      const sizeData = {
        ...size,
        imageUrl,
        createdAt: new Date()
      };

      const docRef = await addDoc(sizesRef, sizeData);
      this.invalidateCache();
      return docRef.id;
    } catch (error: any) {
      console.error('Error al crear talla:', error);
      throw new Error(`Error al crear talla: ${error.message}`);
    }
  }

  // Obtener una talla por su ID
  async getSizeById(id: string): Promise<Size | undefined> {
    try {
      const sizeRef = doc(this.firestore, this.collectionName, id);
      const sizeSnap = await getDoc(sizeRef);

      if (sizeSnap.exists()) {
        // Obtener los datos del documento
        const data = sizeSnap.data();

        // Verificar que los datos tienen la propiedad name (requerida)
        if (!data['name']) {
          console.warn(`La talla con ID ${id} no tiene la propiedad 'name' requerida`);
          return undefined;
        }

        // Combinar ID con datos y asegurar que se cumpla la interfaz Size
        return {
          id: sizeSnap.id,
          name: data['name'],
          stock: data['stock'] || 0,  // Valor por defecto si no existe
          colorStocks: data['colorStocks'] || [],
          imageUrl: data['imageUrl'] || '',
          active: data['active'] !== undefined ? data['active'] : true,
          categories: data['categories'] || [],
          description: data['description'] || '',
          createdAt: data['createdAt'] || new Date(),
          updatedAt: data['updatedAt'] || data['createdAt'] || new Date()
        } as Size;
      }

      return undefined;
    } catch (error) {
      console.error(`Error al obtener talla ${id}:`, error);
      return undefined;
    }
  }

  // Actualizar una talla
  async updateSize(id: string, size: Partial<Size>, imageFile?: File): Promise<void> {
    try {
      const sizeRef = doc(this.firestore, this.collectionName, id);

      // Si hay nueva imagen, procesar
      if (imageFile) {
        const currentSize = await this.getSizeById(id);

        // Eliminar imagen anterior si existe
        if (currentSize?.imageUrl) {
          await this.imageService.deleteImageIfExists(currentSize.imageUrl);
        }

        // Subir nueva imagen
        const imageUrl = await this.imageService.uploadCompressedImage(
          `sizes/${size.name?.toLowerCase() || 'unknown'}.webp`,
          imageFile
        );

        size.imageUrl = imageUrl;
      }

      // Añadir timestamp de actualización
      const updateData = {
        ...size,
        updatedAt: new Date()
      };

      await updateDoc(sizeRef, updateData);
      this.invalidateCache();
    } catch (error: any) {
      console.error(`Error al actualizar talla ${id}:`, error);
      throw new Error(`Error al actualizar talla: ${error.message}`);
    }
  }

  // Eliminar una talla
  async deleteSize(id: string): Promise<void> {
    try {
      const size = await this.getSizeById(id);
      if (!size) {
        throw new Error(`No se encontró la talla con ID ${id}`);
      }

      // Eliminar imagen si existe
      if (size.imageUrl) {
        await this.imageService.deleteImageIfExists(size.imageUrl);
      }

      const sizeRef = doc(this.firestore, this.collectionName, id);
      await deleteDoc(sizeRef);
      this.invalidateCache();
    } catch (error: any) {
      console.error(`Error al eliminar talla ${id}:`, error);
      throw new Error(`Error al eliminar talla: ${error.message}`);
    }
  }

  // Obtener tallas por categoría (útil para filtrar tallas por tipo de producto)
  getSizesByCategory(category: string): Observable<Size[]> {
    const sizesRef = collection(this.firestore, this.collectionName);
    const q = query(sizesRef, where('categories', 'array-contains', category));

    return collectionData(q, { idField: 'id' }).pipe(
      map(data => data as Size[])
    );
  }

  // Obtener tallas activas (útil para filtrar tallas inactivas)
  getActiveSizes(): Observable<Size[]> {
    const sizesRef = collection(this.firestore, this.collectionName);
    const q = query(sizesRef, where('active', '==', true));

    return collectionData(q, { idField: 'id' }).pipe(
      map(data => data as Size[])
    );
  }

  // Buscar tallas por nombre (útil para funcionalidades de búsqueda)
  searchSizesByName(searchTerm: string): Observable<Size[]> {
    // Firestore no admite búsquedas de texto completo nativas
    // Esta es una implementación simple que busca coincidencias exactas
    // Para una búsqueda más avanzada, considera Algolia o ElasticSearch
    return this.getSizes().pipe(
      map(sizes => sizes.filter(size =>
        size.name.toLowerCase().includes(searchTerm.toLowerCase())
      ))
    );
  }
}