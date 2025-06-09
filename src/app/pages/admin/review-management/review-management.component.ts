import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { ReviewService } from '../../../services/review/review.service';
import { Review } from '../../../models/models';
import { FormsModule } from '@angular/forms';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { InstagramAdminComponent } from "../instagram-admin/instagram-admin.component";


@Component({
  selector: 'app-review-management',
  imports: [
    CommonModule,
    NzTableModule,
    NzButtonModule,
    NzPopconfirmModule,
    NzModalModule,
    NzTagModule,
    NzRateModule,
    NzAvatarModule,
    FormsModule,
    NzPaginationModule,
    NzSpinModule,
    NzDropDownModule,
    NzIconModule,
    InstagramAdminComponent
],
  templateUrl: './review-management.component.html',
  styleUrl: './review-management.component.css'
})
export class ReviewManagementComponent implements OnInit {

  reviews: Review[] = [];
  loading = true;

  fallbackImageUrl = 'assets/default-avatar.png';
  isMobileView = false;

  constructor(
    private reviewService: ReviewService,
    private message: NzMessageService,
    private modal: NzModalService
  ) { 
    this.checkScreenSize();
  }

  ngOnInit(): void {
    this.loadReviews();
  }

  // Método para manejar errores de carga de avatar
  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    imgElement.src = this.fallbackImageUrl;
  }
  
  // Detectar cambios de tamaño de pantalla
  @HostListener('window:resize', ['$event'])
  onResize() {
    this.checkScreenSize();
  }
  
  checkScreenSize() {
    this.isMobileView = window.innerWidth <= 768;
  }
  
  loadReviews(): void {
    this.loading = true;
    this.reviewService.getAllReviews().subscribe({
      next: (data) => {
        this.reviews = data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error al cargar reseñas:', error);
        this.message.error('Error al cargar reseñas');
        this.loading = false;
      }
    });
  }

  async approveReview(id: string): Promise<void> {
    try {
      await this.reviewService.approveReview(id, true);
      this.message.success('Reseña aprobada con éxito');
      this.loadReviews();
    } catch (error) {
      this.message.error('Error al aprobar la reseña');
    }
  }

  async rejectReview(id: string): Promise<void> {
    try {
      await this.reviewService.approveReview(id, false);
      this.message.success('Reseña rechazada');
      this.loadReviews();
    } catch (error) {
      this.message.error('Error al rechazar la reseña');
    }
  }

  async deleteReview(id: string): Promise<void> {
    try {
      await this.reviewService.deleteReview(id);
      this.message.success('Reseña eliminada con éxito');
      this.loadReviews();
    } catch (error) {
      this.message.error('Error al eliminar la reseña');
    }
  }

  viewReviewDetails(review: Review): void {
    this.modal.create({
      nzTitle: 'Detalles de la reseña',
      nzContent: `
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <img src="${review.avatarUrl}" style="width: 64px; height: 64px; border-radius: 50%; margin-right: 16px;" />
          <div>
            <h3 style="margin: 0;">${review.name}</h3>
            <p style="margin: 0; color: #666;">${review.location}</p>
            <div>${'⭐'.repeat(review.rating)}</div>
          </div>
        </div>
        <div style="margin-bottom: 16px;">
          <p><strong>Fecha:</strong> ${new Date(review.createdAt).toLocaleString()}</p>
          <p><strong>Estado:</strong> ${review.approved ? 'Aprobada' : 'Pendiente'}</p>
          ${review.productId ? `<p><strong>ID Producto:</strong> ${review.productId}</p>` : ''}
        </div>
        <blockquote style="font-style: italic; padding: 16px; background: #f9f9f9; border-left: 4px solid #ccc; margin: 0;">
          "${review.text}"
        </blockquote>
      `,
      nzFooter: [
        {
          label: review.approved ? 'Rechazar' : 'Aprobar',
          type: review.approved ? 'default' : 'primary',
          onClick: () => {
            review.approved ? 
              this.rejectReview(review.id!) : 
              this.approveReview(review.id!);
            this.modal.closeAll();
          }
        },
        {
          label: 'Eliminar',
          type: undefined,
          onClick: () => {
            this.modal.confirm({
              nzTitle: '¿Estás seguro?',
              nzContent: 'Esta acción no se puede deshacer.',
              nzOkText: 'Sí, eliminar',
              nzOkType: 'primary',
              nzOkDanger: true,
              nzOnOk: () => {
                this.deleteReview(review.id!);
              },
              nzCancelText: 'Cancelar'
            });
          }
        },
        {
          label: 'Cerrar',
          onClick: () => this.modal.closeAll()
        }
      ]
    });
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('es-ES');
  }

}
