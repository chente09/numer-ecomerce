import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, getDoc, addDoc, updateDoc, deleteDoc, query, where } from '@angular/fire/firestore';
import { Observable, from, of, throwError } from 'rxjs';
import { map, shareReplay, catchError, switchMap } from 'rxjs/operators';
import { Color } from '../../../models/models';
import { ProductImageService } from '../image/product-image.service';
import { ErrorUtil } from '../../../utils/error-util';

@Injectable({
  providedIn: 'root'
})
export class ColorService {

  private collectionName = 'colors';
  private colorsCache$?: Observable<Color[]>;

  constructor(
    private firestore: Firestore,
    private imageService: ProductImageService
  ) { }

  // Obtener todos los colores con caché
  getColors(): Observable<Color[]> {
    if (!this.colorsCache$) {
      const colorsRef = collection(this.firestore, this.collectionName);
      this.colorsCache$ = collectionData(colorsRef, { idField: 'id' }).pipe(
        map(data => data as Color[]),
        shareReplay(1),
        catchError(error => ErrorUtil.handleError(error, 'getColors'))
      );
    }
    return this.colorsCache$;
  }

  // Invalidar caché
  invalidateCache(): void {
    this.colorsCache$ = undefined;
  }

  // Crear un nuevo color
  createColor(color: Omit<Color, 'id'>, imageFile?: File): Observable<string> {
    return from(this.processColorCreate(color, imageFile)).pipe(
      catchError(error => ErrorUtil.handleError(error, 'createColor'))
    );
  }

  // Método privado para procesar la creación
  private async processColorCreate(color: Omit<Color, 'id'>, imageFile?: File): Promise<string> {
    const colorsRef = collection(this.firestore, this.collectionName);

    // Si hay imagen, subirla primero
    let imageUrl = '';
    if (imageFile) {
      imageUrl = await this.imageService.uploadCompressedImage(
        `colors/${color.name.toLowerCase()}.webp`,
        imageFile
      );
    }

    // Crear el documento con la URL de la imagen
    const colorData = {
      ...color,
      imageUrl,
      createdAt: new Date()
    };

    const docRef = await addDoc(colorsRef, colorData);
    this.invalidateCache();
    return docRef.id;
  }

  // Obtener un color por su ID
  getColorById(id: string): Observable<Color | undefined> {
    return from(this.processGetColorById(id)).pipe(
      catchError(error => ErrorUtil.handleError(error, `getColorById(${id})`))
    );
  }

  private async processGetColorById(id: string): Promise<Color | undefined> {
    const colorRef = doc(this.firestore, this.collectionName, id);
    const colorSnap = await getDoc(colorRef);

    if (colorSnap.exists()) {
      return { id: colorSnap.id, ...colorSnap.data() } as Color;
    }

    return undefined;
  }

  // Actualizar un color existente
  updateColor(id: string, colorData: Partial<Color>, imageFile?: File): Observable<void> {
    return from(this.processColorUpdate(id, colorData, imageFile)).pipe(
      catchError(error => ErrorUtil.handleError(error, `updateColor(${id})`))
    );
  }

  private async processColorUpdate(id: string, colorData: Partial<Color>, imageFile?: File): Promise<void> {
    const colorRef = doc(this.firestore, this.collectionName, id);

    // Si hay nueva imagen, procesar
    if (imageFile) {
      const currentColorData = await this.processGetColorById(id);

      // Eliminar imagen anterior si existe
      if (currentColorData?.imageUrl) {
        await this.imageService.deleteImageIfExists(currentColorData.imageUrl);
      }

      // Subir nueva imagen
      const imageUrl = await this.imageService.uploadCompressedImage(
        `colors/${colorData.name?.toLowerCase() || 'unknown'}.webp`,
        imageFile
      );

      colorData.imageUrl = imageUrl;
    }

    // Añadir fecha de actualización
    const updateData = {
      ...colorData,
      updatedAt: new Date()
    };

    await updateDoc(colorRef, updateData);
    this.invalidateCache();
  }

  // Eliminar un color
  deleteColor(id: string): Observable<void> {
    return from(this.processColorDelete(id)).pipe(
      catchError(error => ErrorUtil.handleError(error, `deleteColor(${id})`))
    );
  }

  private async processColorDelete(id: string): Promise<void> {
    const colorData = await this.processGetColorById(id);

    // Eliminar imagen si existe
    if (colorData?.imageUrl) {
      await this.imageService.deleteImageIfExists(colorData.imageUrl);
    }

    const colorRef = doc(this.firestore, this.collectionName, id);
    await deleteDoc(colorRef);
    this.invalidateCache();
  }

  // Obtener colores por nombre
  getColorsByName(name: string): Observable<Color[]> {
    const colorsRef = collection(this.firestore, this.collectionName);
    const q = query(colorsRef, where('name', '==', name));

    return collectionData(q, { idField: 'id' }).pipe(
      map(data => data as Color[]),
      catchError(error => ErrorUtil.handleError(error, `getColorsByName(${name})`))
    );
  }
}