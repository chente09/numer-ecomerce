import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, from } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { ErrorUtil } from '../../../utils/error-util';

export interface AuthorizedDistributor {
  id: string;
  nombreComercial: string;
  nombreContacto: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  telefono: string;
  whatsapp?: string;
  email: string;
  tipo: 'minorista' | 'mayorista' | 'online';
  productosAutorizados: string[];
  fechaAutorizacion: Date;
  activo: boolean;
  logoUrl: string;
  storeImageUrl: string;
  sitioWeb?: string;
  googleMapsLink?: string;
  redesSociales?: {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    twitter?: string;
  };
  comentarios?: string;
}

export interface DistributorRequest {
  id: string;
  nombreComercial: string;
  nombreContacto: string;
  email: string;
  telefono: string;
  direccion?: string;
  ciudad: string;
  provincia: string;
  tipoNegocio: 'minorista' | 'mayorista' | 'online';
  experiencia: string;
  volumenEstimado: string;
  motivacion: string;
  sitioWeb?: string;
  rlc: string;
  fechaSolicitud: Date;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
}

@Injectable({
  providedIn: 'root'
})
export class AuthorizedDistributorService {
  private distributorsCollection = 'authorized_distributors';
  private requestsCollection = 'distributor_requests';

  constructor(
    private firestore: Firestore,
    private storage: Storage
  ) { }

  // ==================== CRUD DISTRIBUIDORES AUTORIZADOS ====================

  getAuthorizedDistributors(): Observable<AuthorizedDistributor[]> {
    const distributorsRef = collection(this.firestore, this.distributorsCollection);
    return collectionData(distributorsRef, { idField: 'id' }).pipe(
      map(data => data as AuthorizedDistributor[]),
      catchError(error => ErrorUtil.handleError(error, 'getAuthorizedDistributors'))
    );
  }

  getAuthorizedDistributorById(id: string): Observable<AuthorizedDistributor | undefined> {
    return from(this.fetchDistributorById(id)).pipe(
      catchError(error => ErrorUtil.handleError(error, `getAuthorizedDistributorById(${id})`))
    );
  }

  private async fetchDistributorById(id: string): Promise<AuthorizedDistributor | undefined> {
    const docRef = doc(this.firestore, `${this.distributorsCollection}/${id}`);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as AuthorizedDistributor;
    }
    return undefined;
  }

  createAuthorizedDistributor(
    distributor: Omit<AuthorizedDistributor, 'id' | 'logoUrl' | 'storeImageUrl' | 'fechaAutorizacion'>,
    logoFile: File,
    storeImageFile: File
  ): Observable<string> {
    const distributorId = uuidv4();

    return from(
      Promise.all([
        this.uploadImage(`authorized_distributors/${distributorId}/logo.webp`, logoFile),
        this.uploadImage(`authorized_distributors/${distributorId}/store.webp`, storeImageFile)
      ])
    ).pipe(
      switchMap(([logoUrl, storeImageUrl]) => {
        const distributorsRef = collection(this.firestore, this.distributorsCollection);
        const newDistributor = {
          ...distributor,
          logoUrl,
          storeImageUrl,
          fechaAutorizacion: serverTimestamp()
        };
        return from(addDoc(distributorsRef, newDistributor));
      }),
      map(docRef => docRef.id),
      catchError(error => ErrorUtil.handleError(error, 'createAuthorizedDistributor'))
    );
  }

  updateAuthorizedDistributor(
    id: string,
    data: Partial<AuthorizedDistributor>,
    logoFile?: File,
    storeImageFile?: File
  ): Observable<void> {
    const docRef = doc(this.firestore, `${this.distributorsCollection}/${id}`);

    // Si hay imágenes nuevas
    if (logoFile || storeImageFile) {
      return from(this.getAuthorizedDistributorById(id)).pipe(
        switchMap(current => {
          const uploadPromises: Promise<string>[] = [];

          // Subir logo nuevo
          if (logoFile) {
            if (current?.logoUrl) {
              this.deleteImageIfExists(current.logoUrl).catch(() => { });
            }
            uploadPromises.push(this.uploadImage(`authorized_distributors/${id}/logo.webp`, logoFile));
          } else {
            uploadPromises.push(Promise.resolve(current?.logoUrl || ''));
          }

          // Subir imagen de tienda nueva
          if (storeImageFile) {
            if (current?.storeImageUrl) {
              this.deleteImageIfExists(current.storeImageUrl).catch(() => { });
            }
            uploadPromises.push(this.uploadImage(`authorized_distributors/${id}/store.webp`, storeImageFile));
          } else {
            uploadPromises.push(Promise.resolve(current?.storeImageUrl || ''));
          }

          return from(Promise.all(uploadPromises));
        }),
        switchMap(([logoUrl, storeImageUrl]) => {
          const updatedData: any = { ...data };
          if (logoFile) updatedData.logoUrl = logoUrl;
          if (storeImageFile) updatedData.storeImageUrl = storeImageUrl;
          return from(updateDoc(docRef, updatedData));
        }),
        catchError(error => ErrorUtil.handleError(error, `updateAuthorizedDistributor(${id})`))
      );
    }

    // Si no hay imágenes nuevas, solo actualizar datos
    return from(updateDoc(docRef, data)).pipe(
      catchError(error => ErrorUtil.handleError(error, `updateAuthorizedDistributor(${id})`))
    );
  }

  deleteAuthorizedDistributor(id: string): Observable<void> {
    return from(this.getAuthorizedDistributorById(id)).pipe(
      switchMap(distributor => {
        if (!distributor) {
          return ErrorUtil.handleError(`El distribuidor con ID ${id} no existe.`, `deleteAuthorizedDistributor(${id})`);
        }

        // ✅ CAMBIO: Recopilar promesas de eliminación de imágenes
        const deletePromises: Promise<void>[] = [];

        if (distributor.logoUrl) {
          deletePromises.push(
            this.deleteImageIfExists(distributor.logoUrl)
              .catch(err => {
                console.error('Error eliminando logo, pero continuando:', err);
                // No re-lanzar para que continúe con el resto del proceso
              })
          );
        }

        if (distributor.storeImageUrl) {
          deletePromises.push(
            this.deleteImageIfExists(distributor.storeImageUrl)
              .catch(err => {
                console.error('Error eliminando imagen de tienda, pero continuando:', err);
              })
          );
        }

        // Esperar a que terminen las eliminaciones (aunque fallen)
        return from(Promise.allSettled(deletePromises)).pipe(
          switchMap(results => {
            // ✅ Logging de resultados
            const failed = results.filter(r => r.status === 'rejected');
            if (failed.length > 0) {
              console.warn(`⚠️ ${failed.length} imagen(es) no pudieron eliminarse, pero continuando...`);
            }

            // Eliminar documento de Firestore
            const docRef = doc(this.firestore, `${this.distributorsCollection}/${id}`);
            return from(deleteDoc(docRef));
          })
        );
      }),
      catchError(error => ErrorUtil.handleError(error, `deleteAuthorizedDistributor(${id})`))
    );
  }

  // ==================== SOLICITUDES ====================

  getDistributorRequests(): Observable<DistributorRequest[]> {
    const requestsRef = collection(this.firestore, this.requestsCollection);
    return collectionData(requestsRef, { idField: 'id' }).pipe(
      map(data => data as DistributorRequest[]),
      catchError(error => ErrorUtil.handleError(error, 'getDistributorRequests'))
    );
  }

  createDistributorRequest(request: Omit<DistributorRequest, 'id' | 'fechaSolicitud' | 'estado'>): Observable<string> {
    const requestsRef = collection(this.firestore, this.requestsCollection);
    const newRequest = {
      ...request,
      fechaSolicitud: serverTimestamp(),
      estado: 'pendiente'
    };
    return from(addDoc(requestsRef, newRequest)).pipe(
      map(docRef => docRef.id),
      catchError(error => ErrorUtil.handleError(error, 'createDistributorRequest'))
    );
  }

  // Método para actualizar el estado de una solicitud
  updateDistributorRequestStatus(id: string, estado: 'pendiente' | 'aprobada' | 'rechazada'): Observable<void> {
    const docRef = doc(this.firestore, `${this.requestsCollection}/${id}`);
    return from(updateDoc(docRef, { estado })).pipe(
      catchError(error => ErrorUtil.handleError(error, `updateDistributorRequestStatus(${id})`))
    );
  }

  // ==================== MÉTODOS PRIVADOS ====================

  private async uploadImage(path: string, file: File): Promise<string> {
    const compressed = await this.compressImage(file);
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, compressed);
    return await getDownloadURL(storageRef);
  }

  private async deleteImageIfExists(imageUrl: string): Promise<void> {
    try {

      const path = this.extractPathFromUrl(imageUrl);
      if (!path) {
        console.warn('⚠️ No se pudo extraer el path de la URL:', imageUrl);
        return;
      }

      const imageRef = ref(this.storage, path);

      await deleteObject(imageRef);
    } catch (e: any) {
      if (e.code === 'storage/object-not-found') {
        console.warn('⚠️ La imagen ya no existe en Storage:', imageUrl);
      } else {
        console.error('❌ Error al eliminar imagen:', {
          url: imageUrl,
          code: e.code,
          message: e.message,
          fullError: e
        });
        throw e;
      }
    }
  }

  // Método auxiliar para extraer el path de una URL de Firebase Storage
  private extractPathFromUrl(url: string): string | null {
    try {

      // Buscar el contenido entre /o/ y ?
      const regex = /\/o\/([^?]+)/;
      const match = url.match(regex);

      if (match && match[1]) {
        // Decodificar el path completo
        const decodedPath = decodeURIComponent(match[1]);
        console.log('🔍 Path extraído y decodificado:', decodedPath);
        return decodedPath;
      }

      console.error('❌ No se pudo extraer el path. URL:', url);
      return null;
    } catch (e) {
      console.error('❌ Error al extraer path:', e);
      return null;
    }
  }


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