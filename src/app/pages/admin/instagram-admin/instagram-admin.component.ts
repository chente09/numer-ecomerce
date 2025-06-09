import { ChangeDetectorRef, Component, HostListener, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzUploadFile } from 'ng-zorro-antd/upload';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { EMPTY, Subject, catchError, of, finalize, take, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { InstagramService, InstagramPost, InstagramComment } from '../../../services/admin/instagram/instagram.service';

@Component({
  selector: 'app-instagram-admin',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzModalModule,
    NzTableModule,
    NzFormModule,
    NzInputModule,
    NzCardModule,
    NzUploadModule,
    NzIconModule,
    NzPopconfirmModule,
    NzAvatarModule,
    NzToolTipModule,
    NzEmptyModule,
    NzSkeletonModule,
    NzSwitchModule,
    NzInputNumberModule,
    NzTagModule,
    NzDividerModule
  ],
  templateUrl: './instagram-admin.component.html',
  styleUrl: './instagram-admin.component.css'
})
export class InstagramAdminComponent implements OnInit, OnDestroy {
  // Variables principales
  posts: InstagramPost[] = [];
  loading = false;
  saving = false;
  modalVisible = false;
  commentsModalVisible = false;
  isEditMode = false;
  postForm!: FormGroup;
  editingId: string | null = null;
  selectedPost: InstagramPost | null = null;
  fileList: NzUploadFile[] = [];
  imageFile: File | null = null;
  fallbackImageUrl: SafeUrl;

  // Manejo de errores y UI
  imageErrorMessage: string | null = null;
  modalWidth = 800;
  stats = {
    totalPosts: 0,
    totalLikes: 0,
    totalComments: 0,
    averageLikes: 0
  };

  // Para control de suscripciones
  private destroy$ = new Subject<void>();

  constructor(
    private instagramService: InstagramService,
    private message: NzMessageService,
    private modalService: NzModalService,
    private sanitizer: DomSanitizer,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {
    // Crear imagen de fallback
    const fallbackImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmaWxsPSIjOTk5OTk5Ij5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';
    this.fallbackImageUrl = this.sanitizer.bypassSecurityTrustUrl(fallbackImage);

    this.createForm();
  }

  createForm(): void {
    this.postForm = this.fb.group({
      caption: ['', [Validators.required, Validators.maxLength(2200)]],
      username: ['numer.ec', [Validators.required]],
      userAvatar: ['https://i.postimg.cc/7LgKRbyJ/Logo-Numer-negro.png'],
      hashtags: [''],
      isActive: [true],
      priority: [999, [Validators.min(1)]]
    });
  }

  // ✅ MEJORAR ngOnInit en InstagramAdminComponent
  ngOnInit(): void {
    this.loadPosts();
    this.loadStats();
    this.setModalWidth();

  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ✅ En InstagramAdminComponent
  // ✅ CORREGIR loadPosts() en InstagramAdminComponent
  loadPosts(): void {
    this.loading = true;

    this.instagramService.getAllPostsForAdmin()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data) => {
          this.posts = data || [];

          // ✅ CALCULAR ESTADÍSTICAS DIRECTAMENTE DE LOS POSTS CARGADOS
          this.calculateStatsFromLoadedPosts();

          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error al cargar posts:', error);
          this.message.error('Error al cargar posts de Instagram.');
          this.posts = [];
          this.calculateStatsFromLoadedPosts(); // Estadísticas vacías
        }
      });
  }

  // ✅ AGREGAR al InstagramAdminComponent
  private calculateStatsFromLoadedPosts(): void {
    if (!this.posts || this.posts.length === 0) {
      this.stats = {
        totalPosts: 0,
        totalLikes: 0,
        totalComments: 0,
        averageLikes: 0
      };
      return;
    }

    const totalPosts = this.posts.length;
    const totalLikes = this.posts.reduce((sum, post) => sum + (post.likesCount || 0), 0);
    const totalComments = this.posts.reduce((sum, post) => sum + (post.comments?.length || 0), 0);
    const averageLikes = totalPosts > 0 ? Math.round(totalLikes / totalPosts) : 0;

    this.stats = {
      totalPosts,
      totalLikes,
      totalComments,
      averageLikes
    };

    console.log('📊 Estadísticas calculadas localmente:', this.stats);
    this.cdr.detectChanges();
  }

  private reloadPostsAfterChange(): void {
    this.loadPosts();
  }

  loadStats(): void {
    this.instagramService.getPostsStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.stats = stats;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error cargando estadísticas:', error);
        }
      });
  }

  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement && !imgElement.src.includes('data:image')) {
      imgElement.src = this.fallbackImageUrl as string;
      imgElement.classList.add('error-image');
    }
  }

  openModal(): void {
    this.modalVisible = true;
    this.postForm.reset({
      username: 'numer.ec',
      userAvatar: 'https://i.postimg.cc/7LgKRbyJ/Logo-Numer-negro.png',
      isActive: true,
      priority: 999
    });
    this.fileList = [];
    this.isEditMode = false;
    this.editingId = null;
    this.imageFile = null;
    this.imageErrorMessage = '';
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  closeModal(): void {
    this.modalVisible = false;
    this.postForm.reset();
    this.cdr.detectChanges();
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    this.imageErrorMessage = null;

    const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name || '');
    if (!isImage) {
      this.imageErrorMessage = 'Solo puedes subir archivos de imagen (.jpg, .png, .gif, .webp).';
      return false;
    }

    const actualFile = (file.originFileObj as File) || (file as any);

    if (!actualFile || typeof actualFile.size !== 'number') {
      this.imageErrorMessage = 'El archivo es inválido o está corrupto.';
      return false;
    }

    // Verificar tamaño mínimo
    const minSizeKB = 50;
    if (actualFile.size / 1024 <= minSizeKB) {
      this.imageErrorMessage = `La imagen debe pesar al menos ${minSizeKB}KB para Instagram.`;
      return false;
    }

    // Verificar tamaño máximo
    const maxSizeMB = 8;
    if (actualFile.size / 1024 / 1024 >= maxSizeMB) {
      this.imageErrorMessage = `La imagen debe pesar menos de ${maxSizeMB}MB.`;
      return false;
    }

    this.validateImageDimensionsAsync(actualFile);
    return false;
  };

  private async validateImageDimensionsAsync(file: File): Promise<void> {
    try {
      const isValid = await this.checkImageDimensions(file);
      if (isValid) {
        this.createImagePreview(file);
      }
      this.cdr.detectChanges();
    } catch (error) {
      this.imageErrorMessage = 'Error al validar la imagen.';
      this.cdr.detectChanges();
    }
  }

  private checkImageDimensions(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        const minSize = 400;
        if (img.width < minSize || img.height < minSize) {
          this.imageErrorMessage = `La imagen debe tener al menos ${minSize}x${minSize} píxeles para Instagram.`;
          resolve(false);
          return;
        }

        // Para Instagram, idealmente cuadrada
        const aspectRatio = img.width / img.height;
        if (aspectRatio < 0.8 || aspectRatio > 1.91) {
          this.imageErrorMessage = 'Para mejores resultados, usa imágenes cuadradas o con proporción 16:9.';
          // No bloqueamos, solo advertimos
        }

        resolve(true);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        this.imageErrorMessage = 'No se pudo cargar la imagen. Archivo corrupto.';
        resolve(false);
      };

      img.src = objectUrl;
    });
  }

  private createImagePreview(file: File): void {
    try {
      const objectUrl = URL.createObjectURL(file);
      this.fileList = [{
        uid: `${Date.now()}-${file.name}`,
        name: file.name || 'imagen.jpg',
        status: 'done',
        url: objectUrl
      }];
      this.imageFile = file;
    } catch (e) {
      this.imageErrorMessage = 'No se pudo cargar la vista previa.';
    }
  }

  handlePreview = (file: NzUploadFile): void => {
    const imgUrl = file.url || file.thumbUrl;
    if (imgUrl) {
      this.modalService.create({
        nzContent: `<img src="${imgUrl}" style="width: 100%; max-height: 80vh;" alt="Vista previa" />`,
        nzFooter: null,
        nzWidth: 'auto',
        nzCentered: true,
        nzBodyStyle: { padding: '0' }
      });
    }
  };

  handleRemove = (file: NzUploadFile): boolean => {
    this.fileList = [];
    this.imageFile = null;
    this.cdr.detectChanges();
    return true;
  };

  // ✅ CORREGIR en InstagramAdminComponent (reemplazar el método existente)
  async handleSubmit(): Promise<void> {
    Object.keys(this.postForm.controls).forEach(key => {
      this.postForm.get(key)?.markAsDirty();
      this.postForm.get(key)?.updateValueAndValidity();
    });

    if (!this.postForm.valid) {
      this.message.warning('Por favor complete todos los campos obligatorios correctamente.');
      return;
    }

    if (!this.imageFile && !this.isEditMode) {
      this.imageErrorMessage = 'Por favor seleccione una imagen para el post.';
      return;
    }

    this.saving = true;
    this.cdr.detectChanges();

    const formData = this.postForm.value;

    // Procesar hashtags
    const hashtags = formData.hashtags
      ? formData.hashtags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag)
      : [];

    const postData = {
      ...formData,
      hashtags,
      comments: [] // Inicializar array vacío
    };

    try {
      if (this.isEditMode && this.editingId) {
        await this.instagramService.updatePost(this.editingId, postData, this.imageFile || undefined);
        this.message.success('Post actualizado correctamente.');
      } else {
        const newPostId = await this.instagramService.createPost(postData, this.imageFile!);
        console.log('✅ Post creado con ID:', newPostId);
        this.message.success('Post creado correctamente.');
      }

      this.modalVisible = false;

      // ✅ RECARGAR posts después de crear/editar
      this.reloadPostsAfterChange();
      this.loadStats();

    } catch (error: any) {
      console.error('Error al procesar post:', error);
      this.message.error(error.message || 'Error al procesar el post. Intente nuevamente.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async editPost(post: InstagramPost): Promise<void> {
    this.postForm.setValue({
      caption: post.caption || '',
      username: post.username || 'numer.ec',
      userAvatar: post.userAvatar || '',
      hashtags: post.hashtags?.join(', ') || '',
      isActive: post.isActive ?? true,
      priority: post.priority || 999
    });

    this.editingId = post.id;
    this.isEditMode = true;

    // Mostrar la imagen actual
    this.fileList = post.imageUrl ? [{
      uid: '-1',
      name: 'current-image.jpg',
      status: 'done',
      url: post.imageUrl
    }] : [];

    this.modalVisible = true;
    this.setModalWidth();
    this.cdr.detectChanges();
  }

  async deletePost(id: string): Promise<void> {
    try {
      await this.instagramService.deletePost(id);
      this.message.success('Post eliminado correctamente.');

      // ✅ RECARGAR posts después de eliminar
      this.reloadPostsAfterChange();
      this.loadStats();

    } catch (error: any) {
      console.error('Error al eliminar post:', error);
      this.message.error(error.message || 'Error al eliminar el post. Intente nuevamente.');
    }
  }

  // ✅ CORREGIR en InstagramAdminComponent
  async togglePostStatus(post: InstagramPost): Promise<void> {
    try {
      const newStatus = !post.isActive;
      await this.instagramService.updatePost(post.id, { isActive: newStatus });

      // ✅ ACTUALIZAR estado local inmediatamente
      post.isActive = newStatus;

      this.message.success(`Post ${newStatus ? 'activado' : 'desactivado'} correctamente.`);

      // ✅ RECARGAR para sincronizar completamente
      this.reloadPostsAfterChange();

    } catch (error: any) {
      console.error('Error al cambiar estado del post:', error);
      this.message.error('Error al cambiar el estado del post.');

      // ✅ REVERTIR cambio local si hay error
      post.isActive = !post.isActive;
    }
  }

  // Gestión de comentarios
  showComments(post: InstagramPost): void {
    this.selectedPost = post;
    this.commentsModalVisible = true;
  }

  async deleteComment(commentId: string): Promise<void> {
    if (!this.selectedPost) return;

    try {
      await this.instagramService.deleteComment(this.selectedPost.id, commentId);
      this.message.success('Comentario eliminado correctamente.');

      // ✅ ACTUALIZAR tanto local como lista principal
      this.selectedPost.comments = this.selectedPost.comments.filter(c => c.id !== commentId);

      // ✅ RECARGAR la tabla principal para reflejar cambios
      this.reloadPostsAfterChange();

    } catch (error: any) {
      console.error('Error al eliminar comentario:', error);
      this.message.error('Error al eliminar el comentario.');
    }
  }

  // ✅ CORREGIR en InstagramAdminComponent
  async moderateComment(commentId: string, approved: boolean): Promise<void> {
    if (!this.selectedPost) return;

    try {
      await this.instagramService.moderateComment(this.selectedPost.id, commentId, approved);
      this.message.success(`Comentario ${approved ? 'aprobado' : 'rechazado'} correctamente.`);

      // ✅ ACTUALIZAR estado local
      const comment = this.selectedPost.comments.find(c => c.id === commentId);
      if (comment) {
        comment.approved = approved;
      }

      // ✅ RECARGAR para sincronizar con Firestore
      this.reloadPostsAfterChange();

    } catch (error: any) {
      console.error('Error al moderar comentario:', error);
      this.message.error('Error al moderar el comentario.');
    }
  }

  @HostListener('window:resize')
  setModalWidth() {
    if (window.innerWidth < 576) {
      this.modalWidth = window.innerWidth - 32;
    } else if (window.innerWidth < 768) {
      this.modalWidth = window.innerWidth - 64;
    } else {
      this.modalWidth = 800;
    }
  }

  // Utilidades
  extractHashtags(caption: string): string[] {
    const hashtagRegex = /#[\w\u00c0-\u024f\u1e00-\u1eff]+/gi;
    return caption.match(hashtagRegex) || [];
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getPostPreview(caption: string, maxLength: number = 100): string {
    return caption.length > maxLength ? caption.substring(0, maxLength) + '...' : caption;
  }
}
