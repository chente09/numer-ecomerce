// src/app/services/admin/review/review.service.ts
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
  limit
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, shareReplay, catchError } from 'rxjs/operators';
import { Review } from '../../models/models';
import { UsersService } from '../users/users.service';

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
  private collectionName = 'reviews';
  private reviewsCache$?: Observable<Review[]>;

  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private usersService: UsersService
  ) { }

  // Obtener todas las reseñas aprobadas con caché
  // En review.service.ts
  getApprovedReviews(maxResults: number = 10): Observable<Review[]> {
    return new Observable<Review[]>(observer => {
      const reviewsRef = collection(this.firestore, this.collectionName);

      const q = query(
        reviewsRef,
        where('approved', '==', true),
        orderBy('createdAt', 'desc'),
        limit(maxResults) // ✅ Ahora sí funciona
      );

      getDocs(q)
        .then(snapshot => {
          const reviews = snapshot.docs.map(doc => ({
            id: doc.id,
            ...this.convertToReview(doc.data() as any)
          }));
          observer.next(reviews);
          observer.complete();
        })
        .catch(error => {
          console.error('Error al obtener reseñas:', error);

          const simpleQuery = query(
            reviewsRef,
            where('approved', '==', true),
            limit(100)
          );

          getDocs(simpleQuery)
            .then(fallbackSnapshot => {
              const reviews = fallbackSnapshot.docs
                .map(doc => ({
                  id: doc.id,
                  ...this.convertToReview(doc.data() as any)
                }))
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                .slice(0, maxResults);

              observer.next(reviews);
              observer.complete();
            })
            .catch(fallbackError => {
              console.error('Error incluso con consulta de fallback:', fallbackError);
              observer.next([]);
              observer.complete();
            });
        });
    });
  }


  // Obtener todas las reseñas (admin)
  getAllReviews(): Observable<Review[]> {
    const reviewsRef = collection(this.firestore, this.collectionName);
    const q = query(reviewsRef, orderBy('createdAt', 'desc'));

    return collectionData(q, { idField: 'id' }).pipe(
      map(data => this.mapReviewsData(data as any[])),
      catchError(error => {
        console.error('Error al obtener todas las reseñas:', error);
        return of([]);
      })
    );
  }

  // Crear una nueva reseña
  async createReview(
    review: Omit<Review, 'id' | 'approved' | 'createdAt' | 'avatarUrl' | 'userId'>,
    avatarFile?: File
  ): Promise<string> {
    try {
      // Verificar si el usuario está autenticado
      const currentUser = this.usersService.getCurrentUser();
      if (!currentUser) {
        throw new Error('Debes iniciar sesión para publicar una reseña');
      }

      // Usar avatar del usuario de Google si no se proporciona uno
      let avatarUrl: string | undefined = undefined;
      if (avatarFile) {
        avatarUrl = await this.uploadAvatar(avatarFile);
      } else if (currentUser.photoURL) {
        avatarUrl = currentUser.photoURL;
      }

      // Datos para Firestore con información del usuario
      const reviewData: any = {
        ...review,
        approved: true, // Por defecto las reseñas requieren aprobación
        createdAt: new Date(),
        // ✅ Usar avatar base64 como fallback
        avatarUrl: avatarUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzIiIGZpbGw9IiNmMGYwZjAiLz4KPGNpcmNsZSBjeD0iMzIiIGN5PSIyNCIgcj0iMTAiIGZpbGw9IiM5OTk5OTkiLz4KPHBhdGggZD0iTTE2IDUyYzAtOC44IDcuMi0xNiAxNi0xNnMxNiA3LjIgMTYgMTYiIGZpbGw9IiM5OTk5OTkiLz4KPC9zdmc+',
        userId: currentUser.uid,
        userEmail: currentUser.email,
        // Usar el displayName de Google como nombre si no se proporciona uno
        name: review.name || currentUser.displayName || 'Usuario anónimo'
      };

      // Guardar en Firestore
      const docRef = await addDoc(collection(this.firestore, this.collectionName), reviewData);

      // Registrar la actividad del usuario
      await this.usersService.logUserActivity('create', 'review', { reviewId: docRef.id });

      // Invalidar caché
      this.invalidateCache();

      return docRef.id;
    } catch (error: any) {
      console.error('Error al crear reseña:', error);
      throw new Error(`Error al crear reseña: ${error.message}`);
    }
  }

  // Verificar si el usuario ya ha publicado una reseña
  async hasUserSubmittedReview(): Promise<boolean> {
    const currentUser = this.usersService.getCurrentUser();
    if (!currentUser) return false;

    try {
      const reviewsRef = collection(this.firestore, this.collectionName);
      const q = query(
        reviewsRef,
        where('userId', '==', currentUser.uid),
        limit(1)
      );

      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error al verificar reseñas del usuario:', error);
      return false;
    }
  }

  // Obtener reseñas del usuario actual
  async getCurrentUserReviews(): Promise<Review[]> {
    const currentUser = this.usersService.getCurrentUser();
    if (!currentUser) return [];

    try {
      const reviewsRef = collection(this.firestore, this.collectionName);
      const q = query(
        reviewsRef,
        where('userId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...this.convertToReview(doc.data() as any)
      }));
    } catch (error) {
      console.error('Error al obtener reseñas del usuario:', error);
      return [];
    }
  }

  // Aprobar o rechazar una reseña (admin)
  async approveReview(id: string, approved: boolean): Promise<void> {
    try {
      const docRef = doc(this.firestore, this.collectionName, id);
      await updateDoc(docRef, {
        approved,
        modifiedAt: new Date()
      });

      // Invalidar caché
      this.invalidateCache();
    } catch (error: any) {
      console.error(`Error al ${approved ? 'aprobar' : 'rechazar'} reseña:`, error);
      throw new Error(`Error al modificar estado de la reseña: ${error.message}`);
    }
  }

  // Eliminar una reseña (admin)
  async deleteReview(id: string): Promise<void> {
    try {
      const reviewDoc = await this.getReviewById(id);

      // Eliminar avatar si no es el predeterminado
      if (reviewDoc?.avatarUrl && !reviewDoc.avatarUrl.includes('unknown-user.png')) {
        await this.deleteImageIfExists(reviewDoc.avatarUrl);
      }

      const docRef = doc(this.firestore, this.collectionName, id);
      await deleteDoc(docRef);

      // Invalidar caché
      this.invalidateCache();
    } catch (error: any) {
      console.error('Error al eliminar reseña:', error);
      throw new Error(`Error al eliminar reseña: ${error.message}`);
    }
  }

  // Obtener una reseña específica por ID
  async getReviewById(id: string): Promise<Review | null> {
    try {
      const docRef = doc(this.firestore, this.collectionName, id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const data = docSnap.data() as any;
      return {
        id: docSnap.id,
        ...this.convertToReview(data)
      };
    } catch (error) {
      console.error(`Error al obtener reseña ${id}:`, error);
      return null;
    }
  }

  // Métodos privados para gestión de imágenes y datos
  private async uploadAvatar(file: File): Promise<string> {
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const path = `reviews/avatars/${uniqueId}.webp`;

    // Compresión y formato webp para mejor rendimiento
    const compressed = await this.compressImage(file);
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, compressed);
    return getDownloadURL(storageRef);
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
        const MAX_WIDTH = 300; // Tamaño máximo para avatares
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No se pudo obtener el contexto del canvas');

        // Dibujar recortando como círculo (para avatares)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject('Error al comprimir imagen')),
          'image/webp',
          0.8
        );
      };
    });
  }

  private async deleteImageIfExists(imageUrl: string): Promise<void> {
    try {
      // Extraer la ruta del storage de la URL
      const storageRef = ref(this.storage, this.getPathFromUrl(imageUrl));
      await deleteObject(storageRef);
    } catch (error) {
      console.warn('No se pudo eliminar la imagen de avatar:', error);
    }
  }

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

  private invalidateCache(): void {
    this.reviewsCache$ = undefined;
  }

  private mapReviewsData(data: any[]): Review[] {
    return data.map(item => ({
      id: item.id,
      ...this.convertToReview(item)
    }));
  }

  private convertToReview(data: any): Review {
    // Convertir timestamp de Firestore a Date
    let createdAt: Date;
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
      createdAt = data.createdAt.toDate();
    } else {
      createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    }

    return {
      name: data.name || '',
      location: data.location || '',
      rating: data.rating || 0,
      text: data.text || '',
      // ✅ Usar avatar base64 confiable
      avatarUrl: data.avatarUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzIiIGZpbGw9IiNmMGYwZjAiLz4KPGNpcmNsZSBjeD0iMzIiIGN5PSIyNCIgcj0iMTAiIGZpbGw9IiM5OTk5OTkiLz4KPHBhdGggZD0iTTE2IDUyYzAtOC44IDcuMi0xNiAxNi0xNnMxNiA3LjIgMTYgMTYiIGZpbGw9IiM5OTk5OTkiLz4KPC9zdmc+',
      approved: data.approved === true,
      createdAt,
      productId: data.productId
    };
  }
}