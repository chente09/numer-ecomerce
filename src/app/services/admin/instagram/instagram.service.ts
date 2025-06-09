import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, getDoc, addDoc,
  updateDoc, deleteDoc, query, orderBy, where, writeBatch, serverTimestamp,
  getDocs,
  limit,
  setDoc
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, BehaviorSubject, from, of, throwError } from 'rxjs';
import { map, catchError, tap, shareReplay, take, finalize } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../../users/users.service';
import { Auth } from '@angular/fire/auth';
// Interfaces actualizadas
export interface InstagramComment {
  id: string;
  username: string;
  text: string;
  timestamp: Date;
  userAvatar?: string;
  approved?: boolean;
  userId?: string; // ✅ AGREGAR para asociar usuario
}

export interface InstagramPost {
  id: string;
  imageUrl: string;
  caption: string;
  likesCount: number; // ✅ MANTENER: Nueva propiedad
  liked?: boolean; // Estado local para UI
  username: string;
  userAvatar?: string;
  comments: InstagramComment[];
  hashtags?: string[];
  isActive?: boolean;
  priority?: number;
  createdAt: Date;
  updatedAt?: Date;
  likedBy: string[]; // ✅ HACER REQUERIDO (no opcional)
}

interface ImageConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  format: 'webp' | 'jpeg';
}

export interface UserLike {
  postId: string;
  userId: string;
  timestamp: Date;
}

const INSTAGRAM_IMAGE_CONFIG: ImageConfig = {
  maxWidth: 1080,
  maxHeight: 1080,
  quality: 0.85,
  format: 'webp'
};

@Injectable({
  providedIn: 'root'
})
export class InstagramService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private auth = inject(Auth);

  private collectionName = 'instagram_posts';
  // Estado reactivo
  private postsSubject$ = new BehaviorSubject<InstagramPost[]>([]);
  private loadingSubject$ = new BehaviorSubject<boolean>(false);
  private errorSubject$ = new BehaviorSubject<string | null>(null);

  constructor(
    private usersService: UsersService
  ) {
    this.initializeRealtimeListener();
  }


  // ==================== LISTENERS EN TIEMPO REAL ====================

  private initializeRealtimeListener(): void {
    const postsRef = collection(this.firestore, this.collectionName);
    const postsQuery = query(
      postsRef,
      where('isActive', '==', true),
      orderBy('priority', 'asc'),
      orderBy('createdAt', 'desc')
    );

    collectionData(postsQuery, { idField: 'id' }).pipe(
      map(posts => posts as InstagramPost[]),
      catchError(error => {
        console.error('❌ Error en listener de posts:', error);
        this.errorSubject$.next('Error al cargar posts de Instagram');
        return of([]);
      })
    ).subscribe(posts => {
      this.postsSubject$.next(posts);
    });
  }

  // ==================== MÉTODOS PÚBLICOS OBSERVABLES ====================

  getPosts(): Observable<InstagramPost[]> {
    return this.postsSubject$.asObservable();
  }

  getLoadingState(): Observable<boolean> {
    return this.loadingSubject$.asObservable();
  }

  getErrorState(): Observable<string | null> {
    return this.errorSubject$.asObservable();
  }

  // ==================== CRUD DE POSTS ====================

  /**
   * Crear nuevo post de Instagram
   */
  async createPost(
    postData: Omit<InstagramPost, 'id' | 'comments' | 'createdAt' | 'updatedAt' | 'likedBy' | 'likesCount'>,
    imageFile: File
  ): Promise<string> {
    try {
      this.loadingSubject$.next(true);
      this.errorSubject$.next(null);

      const postId = uuidv4();
      const imageUrl = await this.uploadPostImage(postId, imageFile);

      // ✅ CORREGIR: Usar nuevas propiedades
      const newPost: Omit<InstagramPost, 'id'> = {
        ...postData,
        imageUrl,
        comments: [],
        likesCount: 0, // ✅ USAR likesCount en lugar de likes
        likedBy: [],   // ✅ AGREGAR array vacío
        priority: postData.priority || 999,
        isActive: postData.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // ✅ CORREGIR: Usar setDoc en lugar de addDoc con ID específico
      const docRef = doc(this.firestore, this.collectionName, postId);
      await setDoc(docRef, newPost);

      console.log('✅ Post de Instagram creado:', postId);
      return postId;

    } catch (error: any) {
      console.error('💥 Error creando post:', error);
      this.errorSubject$.next(error.message || 'Error al crear post');
      throw error;
    } finally {
      this.loadingSubject$.next(false);
    }
  }

  /**
   * Actualizar post existente
   */
  async updatePost(
    postId: string,
    updates: Partial<InstagramPost>,
    newImage?: File
  ): Promise<void> {
    try {
      this.loadingSubject$.next(true);
      this.errorSubject$.next(null);

      const updateData: any = {
        ...updates,
        updatedAt: new Date()
      };

      // Si hay nueva imagen, procesar
      if (newImage) {
        // Obtener post actual para eliminar imagen anterior
        const currentPost = await this.getPostById(postId);

        if (currentPost?.imageUrl) {
          await this.deleteImageFromStorage(currentPost.imageUrl);
        }

        // Subir nueva imagen
        const newImageUrl = await this.uploadPostImage(postId, newImage);
        updateData.imageUrl = newImageUrl;
      }

      // Actualizar en Firestore
      const docRef = doc(this.firestore, this.collectionName, postId);
      await updateDoc(docRef, updateData);

      console.log('✅ Post actualizado:', postId);

    } catch (error: any) {
      console.error('💥 Error actualizando post:', error);
      this.errorSubject$.next(error.message || 'Error al actualizar post');
      throw error;
    } finally {
      this.loadingSubject$.next(false);
    }
  }

  /**
   * Eliminar post
   */
  async deletePost(postId: string): Promise<void> {
    try {
      this.loadingSubject$.next(true);
      this.errorSubject$.next(null);

      // 1. Obtener datos del post para eliminar imagen
      const post = await this.getPostById(postId);

      if (!post) {
        throw new Error('Post no encontrado');
      }

      // 2. Eliminar imagen del storage
      if (post.imageUrl) {
        await this.deleteImageFromStorage(post.imageUrl);
      }

      // 3. Eliminar comentarios asociados
      await this.deletePostComments(postId);

      // 4. Eliminar post de Firestore
      const docRef = doc(this.firestore, this.collectionName, postId);
      await deleteDoc(docRef);

      console.log('✅ Post eliminado:', postId);

    } catch (error: any) {
      console.error('💥 Error eliminando post:', error);
      this.errorSubject$.next(error.message || 'Error al eliminar post');
      throw error;
    } finally {
      this.loadingSubject$.next(false);
    }
  }

  /**
   * Obtener post por ID
   */
  async getPostById(postId: string): Promise<InstagramPost | null> {
    try {
      const docRef = doc(this.firestore, this.collectionName, postId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: data['createdAt']?.toDate() || new Date(),
          updatedAt: data['updatedAt']?.toDate() || new Date()
        } as InstagramPost;
      }

      return null;
    } catch (error) {
      console.error(`Error obteniendo post ${postId}:`, error);
      return null;
    }
  }

  // ==================== GESTIÓN DE COMENTARIOS ====================

  /**
   * Agregar comentario a un post
   */
  async addComment(
    postId: string,
    commentData: Omit<InstagramComment, 'id' | 'timestamp'>
  ): Promise<string> {
    try {
      const commentId = uuidv4();

      const newComment: InstagramComment = {
        id: commentId,
        ...commentData,
        timestamp: new Date(),
        approved: true // Por defecto aprobado, puedes cambiar esto
      };

      // Obtener post actual
      const post = await this.getPostById(postId);
      if (!post) throw new Error('Post no encontrado');

      // Agregar comentario al array existente
      const updatedComments = [...post.comments, newComment];

      // Actualizar el post con los nuevos comentarios
      await this.updatePost(postId, { comments: updatedComments });

      console.log('✅ Comentario agregado:', commentId);
      return commentId;

    } catch (error: any) {
      console.error('💥 Error agregando comentario:', error);
      throw error;
    }
  }

  /**
   * Eliminar comentario
   */
  async deleteComment(postId: string, commentId: string): Promise<void> {
    try {
      // Obtener post actual
      const post = await this.getPostById(postId);
      if (!post) throw new Error('Post no encontrado');

      // Filtrar el comentario a eliminar
      const updatedComments = post.comments.filter(c => c.id !== commentId);

      // Actualizar el post con los comentarios filtrados
      await this.updatePost(postId, { comments: updatedComments });

      console.log('✅ Comentario eliminado:', commentId);

    } catch (error: any) {
      console.error('💥 Error eliminando comentario:', error);
      throw error;
    }
  }

  /**
   * Aprobar/desaprobar comentario
   */
  async moderateComment(postId: string, commentId: string, approved: boolean): Promise<void> {
    try {
      const post = await this.getPostById(postId);
      if (!post) throw new Error('Post no encontrado');

      // Actualizar estado de aprobación del comentario
      const updatedComments = post.comments.map(comment =>
        comment.id === commentId ? { ...comment, approved } : comment
      );

      await this.updatePost(postId, { comments: updatedComments });

      console.log(`✅ Comentario ${approved ? 'aprobado' : 'rechazado'}:`, commentId);

    } catch (error: any) {
      console.error('💥 Error moderando comentario:', error);
      throw error;
    }
  }

  /**
   * Eliminar todos los comentarios de un post (simplificado)
   */
  private async deletePostComments(postId: string): Promise<void> {
    try {
      await this.updatePost(postId, { comments: [] });
      console.log(`✅ Comentarios eliminados del post ${postId}`);

    } catch (error) {
      console.error('Error eliminando comentarios del post:', error);
    }
  }

  // ==================== GESTIÓN DE ORDEN ====================

  /**
   * Actualizar orden de posts
   */
  async updatePostsOrder(orderedPostIds: string[]): Promise<void> {
    try {
      this.loadingSubject$.next(true);

      const batch = writeBatch(this.firestore);

      orderedPostIds.forEach((postId, index) => {
        const docRef = doc(this.firestore, this.collectionName, postId);
        batch.update(docRef, {
          priority: index + 1,
          updatedAt: new Date()
        });
      });

      await batch.commit();
      console.log('✅ Orden de posts actualizado');

    } catch (error: any) {
      console.error('💥 Error actualizando orden:', error);
      this.errorSubject$.next(error.message || 'Error al actualizar orden');
      throw error;
    } finally {
      this.loadingSubject$.next(false);
    }
  }

  // ==================== MÉTODOS DE STORAGE ====================

  /**
   * Subir imagen del post
   */
  private async uploadPostImage(postId: string, file: File): Promise<string> {
    try {
      const compressedFile = await this.compressImage(file);
      const fileName = `instagram-posts/${postId}/${Date.now()}_post.${INSTAGRAM_IMAGE_CONFIG.format}`;
      const storageRef = ref(this.storage, fileName);

      await uploadBytes(storageRef, compressedFile, {
        cacheControl: 'public,max-age=31536000',
        contentType: `image/${INSTAGRAM_IMAGE_CONFIG.format}`
      });

      const downloadURL = await getDownloadURL(storageRef);
      console.log(`✅ Imagen subida (${(compressedFile.size / 1024).toFixed(1)}KB):`, downloadURL);

      return downloadURL;

    } catch (error) {
      console.error('💥 Error subiendo imagen:', error);
      throw new Error('Error al subir imagen del post');
    }
  }

  /**
   * Comprimir imagen
   */
  private async compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        try {
          // Calcular dimensiones manteniendo ratio 1:1 (cuadrado como Instagram)
          const size = Math.min(img.width, img.height);
          const targetSize = Math.min(size, INSTAGRAM_IMAGE_CONFIG.maxWidth);

          canvas.width = targetSize;
          canvas.height = targetSize;

          if (!ctx) {
            reject(new Error('No se pudo obtener contexto del canvas'));
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Centrar la imagen en el canvas (crop al centro)
          const offsetX = (img.width - size) / 2;
          const offsetY = (img.height - size) / 2;

          ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, targetSize, targetSize);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: `image/${INSTAGRAM_IMAGE_CONFIG.format}`,
                  lastModified: Date.now()
                });
                resolve(compressedFile);
              } else {
                reject(new Error('Error al generar imagen comprimida'));
              }
            },
            `image/${INSTAGRAM_IMAGE_CONFIG.format}`,
            INSTAGRAM_IMAGE_CONFIG.quality
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Error al cargar imagen'));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Eliminar imagen del storage
   */
  private async deleteImageFromStorage(imageUrl: string): Promise<void> {
    try {
      if (!imageUrl || !this.isFirebaseStorageUrl(imageUrl)) {
        console.log('ℹ️ Saltando eliminación de URL externa:', imageUrl);
        return;
      }

      const path = this.extractFirebaseStoragePath(imageUrl);
      if (!path) {
        console.warn('⚠️ No se pudo extraer path de:', imageUrl);
        return;
      }

      const imageRef = ref(this.storage, path);
      await deleteObject(imageRef);
      console.log('✅ Imagen eliminada:', path);

    } catch (error: any) {
      if (error?.code === 'storage/object-not-found') {
        console.log('ℹ️ Imagen ya no existe:', imageUrl);
      } else {
        console.warn('⚠️ Error eliminando imagen:', error);
      }
    }
  }

  // ==================== MÉTODOS AUXILIARES ====================

  private isFirebaseStorageUrl(url: string): boolean {
    return url.includes('firebasestorage.googleapis.com') ||
      url.includes('firebase') ||
      url.includes('appspot.com');
  }

  private extractFirebaseStoragePath(url: string): string | null {
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
      console.error('❌ Error extrayendo path de URL:', error);
      return null;
    }
  }

  // ==================== MÉTODOS PARA FILTROS Y BÚSQUEDA ====================

  /**
   * Buscar posts por hashtags
   */
  getPostsByHashtag(hashtag: string): Observable<InstagramPost[]> {
    return this.getPosts().pipe(
      map(posts => posts.filter(post =>
        post.hashtags?.some(tag =>
          tag.toLowerCase().includes(hashtag.toLowerCase())
        ) || post.caption.toLowerCase().includes(`#${hashtag.toLowerCase()}`)
      ))
    );
  }

  /**
   * Obtener estadísticas de posts
   */
  // ✅ CORREGIR en InstagramService
  // ✅ CORREGIR para usar likesCount
getPostsStats(): Observable<{
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  averageLikes: number;
}> {
  return this.getAllPostsForAdmin().pipe(
    map(posts => {
      const totalPosts = posts.length;
      const totalLikes = posts.reduce((sum, post) => sum + (post.likesCount || 0), 0);
      const totalComments = posts.reduce((sum, post) => sum + (post.comments?.length || 0), 0);
      const averageLikes = totalPosts > 0 ? Math.round(totalLikes / totalPosts) : 0;

      return {
        totalPosts,
        totalLikes,
        totalComments,
        averageLikes
      };
    }),
    catchError(error => {
      console.error('❌ Error calculando estadísticas:', error);
      return of({
        totalPosts: 0,
        totalLikes: 0,
        totalComments: 0,
        averageLikes: 0
      });
    })
  );
}

  // ✅ AGREGAR al InstagramService - método simple como ReviewService
  getAllPostsForAdmin(): Observable<InstagramPost[]> {
    return new Observable<InstagramPost[]>(observer => {
      const postsRef = collection(this.firestore, this.collectionName);

      // Query simple sin where complicados
      const q = query(postsRef, orderBy('createdAt', 'desc'));

      getDocs(q)
        .then(snapshot => {
          console.log('📸 Documents found:', snapshot.size);

          const posts = snapshot.docs.map(doc => {
            const data = doc.data();
            console.log('📸 Document data:', doc.id, data);

            return this.convertToInstagramPost({ ...data, id: doc.id });
          });

          console.log('📸 Converted posts:', posts.length);
          observer.next(posts);
          observer.complete();
        })
        .catch(error => {
          console.error('❌ Error getting posts:', error);
          observer.next([]);
          observer.complete();
        });
    });
  }

  // ✅ AGREGAR método de conversión
  private convertToInstagramPost(data: any): InstagramPost {
    let createdAt: Date;
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
      createdAt = data.createdAt.toDate();
    } else {
      createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    }

    let updatedAt: Date;
    if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
      updatedAt = data.updatedAt.toDate();
    } else {
      updatedAt = data.updatedAt ? new Date(data.updatedAt) : createdAt;
    }

    return {
      id: data.id || '',
      imageUrl: data.imageUrl || '',
      caption: data.caption || '',
      likesCount: data.likesCount || data.likes || 0,
      liked: data.liked || false,
      username: data.username || 'numer.ec',
      userAvatar: data.userAvatar || '',
      comments: data.comments || [],
      hashtags: data.hashtags || [],
      isActive: data.isActive !== false,
      priority: data.priority || 999,
      likedBy: data.likedBy || [], // ✅ ASEGURAR que siempre sea array
      createdAt,
      updatedAt
    };
  }

  /**
   * Toggle like CON autenticación de usuario
   */
  async toggleLikeAuthenticated(postId: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Debes iniciar sesión para dar like');
    }

    try {
      const post = await this.getPostById(postId);
      if (!post) throw new Error('Post no encontrado');

      const userId = user.uid;
      const likedBy = post.likedBy || [];
      const hasLiked = likedBy.includes(userId);

      let updatedLikedBy: string[];
      let newLikesCount: number;

      if (hasLiked) {
        // Remover like
        updatedLikedBy = likedBy.filter(id => id !== userId);
        newLikesCount = Math.max(0, post.likesCount - 1);
      } else {
        // Agregar like
        updatedLikedBy = [...likedBy, userId];
        newLikesCount = post.likesCount + 1;
      }

      await this.updatePost(postId, {
        likedBy: updatedLikedBy,
        likesCount: newLikesCount
      });

      console.log(`✅ Like ${hasLiked ? 'removido' : 'agregado'} por usuario ${userId}`);

    } catch (error: any) {
      console.error('💥 Error en toggleLikeAuthenticated:', error);
      throw error;
    }
  }

  /**
   * Verificar si el usuario actual dio like al post
   */
  async hasUserLikedPost(postId: string): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) return false;

    try {
      const post = await this.getPostById(postId);
      return post?.likedBy?.includes(user.uid) || false;
    } catch (error) {
      console.error('Error verificando like del usuario:', error);
      return false;
    }
  }

  /**
   * Agregar comentario CON autenticación
   */
  async addCommentAuthenticated(
    postId: string,
    text: string
  ): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Debes iniciar sesión para comentar');
    }

    try {
      // Obtener datos del usuario
      const userProfile = await this.usersService.getUserProfile();

      const commentData = {
        username: userProfile?.displayName || userProfile?.firstName || user.displayName || 'Usuario',
        text: text.trim(),
        userAvatar: userProfile?.photoURL || user.photoURL || '',
        userId: user.uid, // ✅ CRÍTICO: Asociar comentario al usuario
        approved: true // O false si quieres moderación previa
      };

      return await this.addComment(postId, commentData);

    } catch (error: any) {
      console.error('💥 Error agregando comentario autenticado:', error);
      throw error;
    }
  }

  // ✅ AGREGAR al InstagramService (si no lo tienes)
  getActivePostsForPublic(): Observable<InstagramPost[]> {
    return new Observable<InstagramPost[]>(observer => {
      const postsRef = collection(this.firestore, this.collectionName);

      // Solo posts activos para el público
      const q = query(
        postsRef,
        where('isActive', '==', true),
        orderBy('createdAt', 'desc'),
        limit(20) // Límite para performance
      );

      getDocs(q)
        .then(snapshot => {

          const posts = snapshot.docs.map(doc => (
            this.convertToInstagramPost({ ...doc.data(), id: doc.id })
          ));

          // Ordenar por prioridad y fecha
          const sortedPosts = posts.sort((a, b) => {
            const priorityA = a.priority || 999;
            const priorityB = b.priority || 999;

            if (priorityA !== priorityB) {
              return priorityA - priorityB;
            }

            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          observer.next(sortedPosts);
          observer.complete();
        })
        .catch(error => {
          console.error('❌ Error obteniendo posts públicos:', error);
          // Fallback: intentar sin where clause
          const fallbackQ = query(postsRef, orderBy('createdAt', 'desc'), limit(20));

          getDocs(fallbackQ)
            .then(fallbackSnapshot => {
              const posts = fallbackSnapshot.docs
                .map(doc => (
                  this.convertToInstagramPost({ ...doc.data(), id: doc.id })
                ))
                .filter(post => post.isActive) // Filtrar en cliente
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

              observer.next(posts);
              observer.complete();
            })
            .catch(() => {
              observer.next([]);
              observer.complete();
            });
        });
    });
  }
  /**
   * Método de debugging
   */
  debugService(): void {
    console.group('📸 [INSTAGRAM SERVICE DEBUG]');

    this.getPosts().pipe(take(1)).subscribe(posts => {
      console.log(`📊 Total posts: ${posts.length}`);

      if (posts.length > 0) {
        const summary = posts.slice(0, 5).map(post => ({
          id: post.id,
          caption: post.caption.substring(0, 50) + '...',
          likes: post.likesCount,
          comments: post.comments.length,
          isActive: post.isActive ? '✅' : '❌'
        }));

        console.table(summary);
      }
    });

    this.getPostsStats().pipe(take(1)).subscribe(stats => {
      console.log('📈 Estadísticas:', stats);
    });

    console.groupEnd();
  }
}