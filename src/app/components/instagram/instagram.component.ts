// ✅ INSTAGRAM COMPONENT COMPLETAMENTE CORREGIDO
import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, OnDestroy, TemplateRef, ViewChild, HostListener, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subject, takeUntil, finalize } from 'rxjs';
import { User } from '@angular/fire/auth';

import { InstagramService, InstagramComment, InstagramPost } from '../../services/admin/instagram/instagram.service';
import { UsersService } from '../../services/users/users.service';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { Router } from '@angular/router';

@Component({
  selector: 'app-instagram',
  imports: [
    CommonModule,
    FormsModule,
    NzGridModule,
    NzButtonModule,
    NzModalModule,
    NzIconModule,
    NzToolTipModule
  ],
  templateUrl: './instagram.component.html',
  styleUrl: './instagram.component.css'
})
export class InstagramComponent implements OnInit, OnDestroy {
  instagramFeed: InstagramPost[] = [];
  selectedPost: InstagramPost | null = null;
  newComment: string = '';
  loading = false;
  maxVisiblePosts = this.calculateMaxVisiblePosts();

  // ✅ NUEVAS PROPIEDADES PARA AUTENTICACIÓN
  currentUser: User | null = null;
  isAuthenticated = false;
  userProfile: any = null;

  // ✅ AGREGAR para manejar suscripciones
  private destroy$ = new Subject<void>();

  @ViewChild('postDetailModal') postDetailModal!: TemplateRef<any>;
  @ViewChild('commentInput') commentInput!: ElementRef;
  modalVisible: boolean | undefined;

  constructor(
    private modalService: NzModalService,
    private instagramService: InstagramService,
    private message: NzMessageService,
    private usersService: UsersService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.loadInstagramPosts();
    this.checkAuthStatus(); // ✅ AGREGAR verificación de autenticación
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:resize')
  onResize() {
    this.maxVisiblePosts = this.calculateMaxVisiblePosts();
  }

  calculateMaxVisiblePosts() {
    const screenWidth = window.innerWidth;
    const containerWidth = screenWidth - 40;
    const gap = 16;

    let columns;
    if (screenWidth >= 992) columns = 4;      // lg
    else if (screenWidth >= 768) columns = 4; // md  
    else if (screenWidth >= 576) columns = 3; // sm
    else columns = 2;                         // xs

    return columns;
  }

  // ✅ NUEVO: Verificar estado de autenticación
  private checkAuthStatus(): void {
    this.usersService.user$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(async (user) => {
      this.currentUser = user;
      this.isAuthenticated = !!user;

      if (user) {
        try {
          // Obtener perfil del usuario
          this.userProfile = await this.usersService.getUserProfile();

          // Actualizar estado de likes para el usuario actual
          await this.updateUserLikeStatus();
        } catch (error) {
          console.error('Error obteniendo perfil de usuario:', error);
        }
      } else {
        // Si no está autenticado, resetear estados de like
        this.resetLikeStates();
      }
    });
  }

  // ✅ NUEVO: Actualizar estado de likes del usuario
  private async updateUserLikeStatus(): Promise<void> {
    if (!this.isAuthenticated || this.instagramFeed.length === 0) return;

    try {
      // ✅ PROCESAR EN PARALELO PARA MAYOR VELOCIDAD
      const likePromises = this.instagramFeed.map(async (post) => {
        const liked = await this.instagramService.hasUserLikedPost(post.id);
        return { postId: post.id, liked };
      });

      const likeStates = await Promise.all(likePromises);

      // ✅ ACTUALIZAR TODOS LOS ESTADOS DE UNA VEZ
      likeStates.forEach(({ postId, liked }) => {
        const post = this.instagramFeed.find(p => p.id === postId);
        if (post) {
          post.liked = liked;
        }
      });

      this.cdr.detectChanges(); // ✅ FORZAR DETECCIÓN DESPUÉS DE ACTUALIZAR TODO

    } catch (error) {
      console.error('Error verificando estados de like:', error);
    }
  }

  // ✅ NUEVO: Resetear estados de like cuando no está autenticado
  private resetLikeStates(): void {
    this.instagramFeed.forEach(post => {
      post.liked = false;
    });
  }

  // ✅ CORREGIDO: Método para cargar posts
  loadInstagramPosts(): void {
    this.loading = true;

    this.instagramService.getActivePostsForPublic()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges(); // ✅ FORZAR DETECCIÓN
        })
      )
      .subscribe({
        next: async (posts) => {
          this.instagramFeed = posts;

          // Si el usuario está autenticado, actualizar estados de like
          if (this.isAuthenticated) {
            await this.updateUserLikeStatus();
          }

          this.cdr.detectChanges(); // ✅ FORZAR DETECCIÓN
        },
        error: (error) => {
          console.error('❌ Error cargando posts de Instagram:', error);
          this.instagramFeed = [];
          this.message.error('Error al cargar el feed de Instagram');
        }
      });
  }

  openPostModal(post: InstagramPost): void {
    this.selectedPost = post;

    this.modalService.create({
      nzContent: this.postDetailModal,
      nzFooter: null,
      nzWidth: '900px',
      nzClassName: 'instagram-modal',
      nzCentered: true,
      nzClosable: false,
      nzMaskClosable: true,
      nzBodyStyle: {
        padding: '0',
      },
    });
  }

  // ✅ Método para cerrar el modal
  closeModal(): void {
    // Si usas una variable para controlar el modal
    this.modalVisible = false;
    // O si usas el servicio, puedes cerrar todos los modales
    this.modalService.closeAll();
  }

  // ✅ CORREGIDO: Método de like con autenticación
  async toggleLike(post: InstagramPost): Promise<void> {
    if (!this.isAuthenticated) {
      this.showLoginPrompt('dar like');
      return;
    }

    // ✅ ENCONTRAR EL POST ORIGINAL EN EL FEED
    const originalPost = this.instagramFeed.find(p => p.id === post.id);
    if (!originalPost) {
      console.error('Post no encontrado en el feed');
      return;
    }

    // ✅ GUARDAR ESTADO ORIGINAL PARA REVERTIR EN CASO DE ERROR
    const originalState = {
      liked: originalPost.liked,
      likesCount: originalPost.likesCount
    };

    try {
      // ✅ ACTUALIZACIÓN OPTIMISTA - ACTUALIZAR AMBOS OBJETOS
      const newLikedState = !originalPost.liked;
      const newLikesCount = newLikedState
        ? (originalPost.likesCount || 0) + 1
        : Math.max(0, (originalPost.likesCount || 0) - 1);

      // Actualizar post original en el feed
      originalPost.liked = newLikedState;
      originalPost.likesCount = newLikesCount;

      // ✅ SINCRONIZAR SELECTEDPOST SI ES EL MISMO POST
      if (this.selectedPost && this.selectedPost.id === originalPost.id) {
        this.selectedPost.liked = newLikedState;
        this.selectedPost.likesCount = newLikesCount;
      }

      // ✅ FORZAR DETECCIÓN DE CAMBIOS INMEDIATA
      this.cdr.detectChanges();

      // Llamada al servidor
      await this.instagramService.toggleLikeAuthenticated(originalPost.id);

      this.message.success(newLikedState ? '❤️ Te gusta este post' : 'Like removido');

    } catch (error: any) {
      // ✅ REVERTIR CAMBIOS EN CASO DE ERROR
      originalPost.liked = originalState.liked;
      originalPost.likesCount = originalState.likesCount;

      if (this.selectedPost && this.selectedPost.id === originalPost.id) {
        this.selectedPost.liked = originalState.liked;
        this.selectedPost.likesCount = originalState.likesCount;
      }

      this.cdr.detectChanges();

      console.error('Error al actualizar like:', error);

      if (error.message?.includes('iniciar sesión')) {
        this.showLoginPrompt('dar like');
      } else {
        this.message.error(error.message || 'Error al actualizar el like');
      }
    }
  }

  // ✅ CORREGIDO: Método de comentario con autenticación
  async addComment(): Promise<void> {
    if (!this.newComment.trim() || !this.selectedPost) return;

    if (!this.isAuthenticated) {
      this.showLoginPrompt('comentar');
      return;
    }

    // ✅ CREAR COMENTARIO OPTIMISTA
    const optimisticComment = {
      id: `temp-${Date.now()}`, // ID temporal
      username: this.getUserDisplayName(),
      text: this.newComment.trim(),
      timestamp: new Date(),
      userAvatar: this.getUserAvatar(),
      userId: this.currentUser?.uid,
      approved: true
    };

    // ✅ GUARDAR ESTADO ORIGINAL
    const originalComments = [...this.selectedPost.comments];
    const commentText = this.newComment.trim();

    try {
      // ✅ ACTUALIZACIÓN OPTIMISTA - MOSTRAR INMEDIATAMENTE
      this.selectedPost.comments = [...this.selectedPost.comments, optimisticComment];

      // Actualizar en el feed principal
      const originalPost = this.instagramFeed.find(p => p.id === this.selectedPost!.id);
      if (originalPost) {
        originalPost.comments = [...this.selectedPost.comments];
      }

      // Limpiar input inmediatamente
      this.newComment = '';

      // ✅ FORZAR DETECCIÓN DE CAMBIOS
      this.cdr.detectChanges();

      // Llamada al servidor
      await this.instagramService.addCommentAuthenticated(
        this.selectedPost.id,
        commentText
      );

      // ✅ OBTENER COMENTARIOS REALES DEL SERVIDOR
      const updatedPost = await this.instagramService.getPostById(this.selectedPost.id);
      if (updatedPost) {
        this.selectedPost.comments = updatedPost.comments;

        if (originalPost) {
          originalPost.comments = updatedPost.comments;
        }

        this.cdr.detectChanges();
      }

      this.message.success('Comentario agregado correctamente');

    } catch (error: any) {
      // ✅ REVERTIR EN CASO DE ERROR
      this.selectedPost.comments = originalComments;

      const originalPost = this.instagramFeed.find(p => p.id === this.selectedPost!.id);
      if (originalPost) {
        originalPost.comments = originalComments;
      }

      // Restaurar texto del comentario
      this.newComment = commentText;

      this.cdr.detectChanges();

      console.error('Error al agregar comentario:', error);

      if (error.message?.includes('iniciar sesión')) {
        this.showLoginPrompt('comentar');
      } else {
        this.message.error(error.message || 'Error al agregar comentario');
      }
    }
  }

  // ✅ NUEVO: Mostrar prompt de login
  private showLoginPrompt(action: string): void {
    this.message.warning(`Inicia sesión para ${action}`, { nzDuration: 3000 });

    // Login automático después de 1 segundo
    setTimeout(() => {
      this.handleLoginFromButton();
    }, 1000);
  }

  focusCommentInput(): void {
    setTimeout(() => {
      this.commentInput?.nativeElement?.focus();
    }, 100);
  }

  // ✅ NUEVO: Método para manejar errores de imagen
  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDYwMCA2MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI2MDAiIGhlaWdodD0iNjAwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjI0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmaWxsPSIjOTk5OTk5Ij5JbWFnZW4gbm8gZGlzcG9uaWJsZTwvdGV4dD4KPC9zdmc+';
    }
  }

  // ✅ NUEVO: Método para formatear fecha
  formatDate(date: Date): string {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - new Date(date).getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Hace 1 día';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.ceil(diffDays / 7)} semanas`;

    return new Date(date).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  // ✅ NUEVO: Método para extraer hashtags del caption
  extractHashtags(caption: string): string[] {
    const hashtagRegex = /#[\w\u00c0-\u024f\u1e00-\u1eff]+/gi;
    return caption.match(hashtagRegex) || [];
  }

  // ✅ NUEVO: Mostrar información del usuario en comentarios
  getUserDisplayName(): string {
    if (!this.isAuthenticated) return 'Visitante';

    return this.userProfile?.firstName ||
      this.userProfile?.displayName ||
      this.currentUser?.displayName ||
      'Usuario';
  }

  // ✅ NUEVO: Obtener avatar del usuario
  getUserAvatar(): string {
    if (!this.isAuthenticated) {
      return '/logo.png';
    }

    return this.userProfile?.photoURL ||
      this.currentUser?.photoURL ||
      '/logo.png';
  }

  // ✅ NUEVO: Verificar si el usuario puede moderar comentarios (admin)
  async canModerateComments(): Promise<boolean> {
    if (!this.isAuthenticated) return false;

    try {
      return await this.usersService.hasRole('admin');
    } catch (error) {
      console.error('Error verificando permisos:', error);
      return false;
    }
  }

  // ✅ NUEVO: Manejar inicio de sesión desde los botones
  async handleLoginFromButton(): Promise<void> {
    if (this.isAuthenticated) {
      return;
    }

    try {
      this.loading = true;

      // Login directo con Google
      const result = await this.usersService.loginWithGoogle();

      if (result.user) {
        this.message.success(`¡Bienvenido, ${result.user.displayName || result.user.email}!`, { nzDuration: 4000 });

        // Actualizar estados después del login
        setTimeout(() => {
          this.updateUserLikeStatus();
        }, 1000);
      }

    } catch (error: any) {
      console.error('Error en login:', error);

      // Manejar errores específicos
      if (error.code === 'auth/popup-closed-by-user') {
        this.message.info('Login cancelado');
      } else if (error.code === 'auth/popup-blocked') {
        this.message.warning('Permite ventanas emergentes para continuar');
      } else {
        this.message.error('Error al iniciar sesión. Inténtalo de nuevo.');
      }
    } finally {
      this.loading = false;
    }
  }

  async sharePost(): Promise<void> {
    const shareUrl = 'https://numer-ecomerce.netlify.app/?utm_source=instagram&utm_medium=social';

    try {
      await navigator.clipboard.writeText(shareUrl);
      this.message.success('¡Link copiado! Compártelo donde quieras 📋✨');
    } catch (error) {
      this.message.error('No se pudo copiar. Intenta de nuevo.');
    }
  }

}