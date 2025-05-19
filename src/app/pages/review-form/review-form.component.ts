import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzUploadModule, NzUploadFile } from 'ng-zorro-antd/upload';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { Router, RouterModule } from '@angular/router';
import { ReviewService } from '../../services/review/review.service';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { Review } from '../../models/models';
import { UsersService } from '../../services/users/users.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { NzBadgeModule } from 'ng-zorro-antd/badge';

@Component({
  selector: 'app-review-form',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzRateModule,
    NzUploadModule,
    NzAlertModule,
    NzGridModule,
    RouterModule,
    NzCardModule,
    NzAvatarModule,
    NzEmptyModule,
    NzSpinModule,
    NzDividerModule,
    NzTabsModule,
    NzIconModule,
    NzModalModule,
    NzBadgeModule
  ],
  templateUrl: './review-form.component.html',
  styleUrl: './review-form.component.css',
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(20px)' }))
      ])
    ])
  ]
})
export class ReviewFormComponent implements OnInit {

  // Estados
  showForm = false;
  reviews: Review[] = [];
  userReviews: Review[] = [];
  loading = true;
  formLoading = false;
  submitting = false;
  submitSuccess = false;
  isAuthenticated = false;
  
  // Formulario
  reviewForm!: FormGroup;
  
  // Para el avatar
  avatarFile: File | null = null;
  avatarFileList: NzUploadFile[] = [];

  constructor(
    private fb: FormBuilder,
    private reviewService: ReviewService,
    private usersService: UsersService,
    private message: NzMessageService,
    private modal: NzModalService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadReviews();
    this.checkAuthStatus();
  }

  initForm(): void {
    this.reviewForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      location: ['', [Validators.required]],
      rating: [5, [Validators.required, Validators.min(1), Validators.max(5)]],
      text: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]]
    });
  }

  loadReviews(): void {
    this.loading = true;
    this.reviewService.getApprovedReviews(50)
      .subscribe({
        next: (data) => {
          this.reviews = data;
          this.loading = false;
          // Cargar las reseñas del usuario si está autenticado
          if (this.isAuthenticated) {
            this.loadUserReviews();
          }
        },
        error: (error) => {
          console.error('Error al cargar reseñas:', error);
          this.loading = false;
        }
      });
  }

  async loadUserReviews(): Promise<void> {
    if (!this.isAuthenticated) return;
    
    try {
      this.userReviews = await this.reviewService.getCurrentUserReviews();
    } catch (error) {
      console.error('Error al cargar reseñas del usuario:', error);
    }
  }

  checkAuthStatus(): void {
    this.usersService.user$.subscribe(user => {
      this.isAuthenticated = !!user;
      
      // Si el usuario está autenticado, pre-llenar algunos campos
      if (user) {
        this.reviewForm.patchValue({
          name: user.displayName || '',
          // No podemos obtener la ubicación automáticamente, pero podríamos tenerla en el perfil
        });
        
        // Si el usuario ya tiene reseñas, cargarlas
        this.loadUserReviews();
      }
    });
  }

  toggleForm(): void {
    // Si el formulario está oculto y se va a mostrar, verificar autenticación
    if (!this.showForm && !this.isAuthenticated) {
      this.promptLogin();
      return;
    }
    
    this.showForm = !this.showForm;
    
    // Si se muestra el formulario, desplazarse a él
    if (this.showForm) {
      setTimeout(() => {
        const formElement = document.getElementById('review-form');
        formElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }

  promptLogin(): void {
    this.modal.confirm({
      nzTitle: 'Iniciar sesión requerido',
      nzContent: 'Para publicar una reseña necesitas iniciar sesión. ¿Deseas iniciar sesión con Google ahora?',
      nzOkText: 'Iniciar sesión',
      nzCancelText: 'Cancelar',
      nzOnOk: () => this.loginWithGoogle()
    });
  }

  async loginWithGoogle(): Promise<void> {
    try {
      await this.usersService.loginWithGoogle();
      this.message.success('¡Has iniciado sesión correctamente!');
      // Mostrar el formulario después de iniciar sesión
      this.showForm = true;
      
      // Pre-llenar campos con datos del usuario
      const user = this.usersService.getCurrentUser();
      if (user) {
        this.reviewForm.patchValue({
          name: user.displayName || ''
        });
      }
      
      setTimeout(() => {
        const formElement = document.getElementById('review-form');
        formElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (error) {
      this.message.error('Error al iniciar sesión. Inténtalo de nuevo.');
    }
  }

  // Para manejar la subida del avatar
  beforeUploadAvatar = (file: NzUploadFile): boolean => {
    // Verificar que sea una imagen
    const isImage = file.type?.startsWith('image/');
    if (!isImage) {
      this.message.error('Solo puedes subir archivos de imagen');
      return false;
    }

    // Verificar tamaño
    const isLt2M = (file.size || 0) / 1024 / 1024 < 2;
    if (!isLt2M) {
      this.message.error('La imagen debe pesar menos de 2MB');
      return false;
    }

    // Guardar archivo
    this.avatarFile = file as unknown as File;
    this.avatarFileList = [file];

    return false; // Prevenir subida automática
  };

  removeAvatar = (): boolean => {
    this.avatarFile = null;
    this.avatarFileList = [];
    return true;
  };

  async onSubmit(): Promise<void> {
    if (this.reviewForm.invalid) {
      // Marcar campos como touched para mostrar errores
      Object.values(this.reviewForm.controls).forEach(control => {
        control.markAsTouched();
      });
      return;
    }

    // Verificar autenticación una vez más
    if (!this.isAuthenticated) {
      this.promptLogin();
      return;
    }

    this.submitting = true;

    try {
      await this.reviewService.createReview(
        this.reviewForm.value,
        this.avatarFile || undefined
      );

      this.submitSuccess = true;
      this.message.success('¡Gracias por tu reseña! Será revisada antes de publicarse.');
      
      // Actualizar las reseñas del usuario
      await this.loadUserReviews();
      
      // Resetear formulario y ocultar
      setTimeout(() => {
        this.reviewForm.reset();
        this.avatarFile = null;
        this.avatarFileList = [];
        this.submitting = false;
        this.showForm = false;
        this.submitSuccess = false;
      }, 3000);
    } catch (error: any) {
      this.message.error(`Error al enviar la reseña: ${error.message || 'Inténtalo de nuevo'}`);
      this.submitting = false;
    }
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

}
