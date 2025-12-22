import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  HostListener,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

// NG-ZORRO Modules
import { NzCarouselModule, NzCarouselComponent } from 'ng-zorro-antd/carousel';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzRateModule } from 'ng-zorro-antd/rate';

// Servicios y modelos
import { Review } from '../../models/models';
import { ReviewService } from '../../services/review/review.service';

// RxJS
import { Subscription, interval } from 'rxjs';
import { animate, style, transition, trigger } from '@angular/animations';
import { FormsModule } from '@angular/forms';
import { ActionButtonComponent } from "../action-button/action-button.component";

// ✅ Interfaz simplificada
export interface TestimonialData extends Review {
  avatarError?: boolean;
}

@Component({
  selector: 'app-testimonios',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NzCarouselModule,
    NzSpinModule,
    NzAvatarModule,
    NzRateModule,
    FormsModule,
    ActionButtonComponent
],
  templateUrl: './testimonios.component.html',
  styleUrls: ['./testimonios.component.css'],
  animations: [
    // ✅ Animación simple de entrada
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class TestimoniosComponent implements OnInit, OnDestroy {
  // ===== REFERENCIAS DEL TEMPLATE =====
  @ViewChild('carousel') carousel!: NzCarouselComponent;

  // ===== ESTADO DEL COMPONENTE =====
  testimonials: TestimonialData[] = [];
  isLoading = true;
  isMobile = false;
  currentSlide = 0;

  // ===== CONFIGURACIÓN DEL CAROUSEL =====
  autoplaySpeed = 4000;

  // ===== SUSCRIPCIONES =====
  private subscription = new Subscription();

  constructor(
    private reviewService: ReviewService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.checkMobileView();
    this.loadTestimonials();
    this.startPeriodicUpdate();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  // ===== RESPONSIVE =====
  @HostListener('window:resize')
  onResize(): void {
    this.checkMobileView();
  }

  private checkMobileView(): void {
    this.isMobile = window.innerWidth < 768;
  }

  // ===== CARGA DE DATOS =====
  loadTestimonials(): void {
    this.isLoading = true;

    const testimonialsSub = this.reviewService.getApprovedReviews(6)
      .subscribe({
        next: (reviews: Review[]) => {
          this.testimonials = (reviews || []).map(review => ({
            ...review,
            avatarError: false
          }));
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error al cargar testimonios:', error);
          this.testimonials = [];
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });

    this.subscription.add(testimonialsSub);
  }

  // ===== ACTUALIZACIÓN PERIÓDICA =====
  private startPeriodicUpdate(): void {
    const updateInterval = 5 * 60 * 1000; // 5 minutos

    const intervalSub = interval(updateInterval).subscribe(() => {
      this.reviewService.getApprovedReviews(6).subscribe({
        next: (reviews: Review[]) => {
          if (reviews && reviews.length > 0) {
            this.testimonials = reviews.map(review => {
              const existing = this.testimonials.find(t => t.id === review.id);
              return {
                ...review,
                avatarError: existing?.avatarError || false
              };
            });
            this.cdr.detectChanges();
          }
        },
        error: (error) => {
          console.error('Error al actualizar testimonios:', error);
        }
      });
    });

    this.subscription.add(intervalSub);
  }

  // ===== MANEJO DE ERRORES =====
  handleAvatarError(testimonial: TestimonialData): void {
    testimonial.avatarError = true;
    this.cdr.detectChanges();
  }

  // ===== CONTROLES DE NAVEGACIÓN =====
  nextSlide(): void {
    if (this.carousel) {
      this.carousel.next();
    }
  }

  previousSlide(): void {
    if (this.carousel) {
      this.carousel.pre();
    }
  }

  onSlideChange(index: number): void {
    this.currentSlide = index;
    this.cdr.detectChanges();
  }

  // ===== UTILIDADES =====
  hasTestimonials(): boolean {
    return this.testimonials && this.testimonials.length > 0;
  }

  trackByTestimonialId(index: number, testimonial: TestimonialData): string {
    return testimonial.id || index.toString();
  }

  // ===== GENERADOR DE ESTRELLAS =====
  getStarsArray(rating: number): { filled: boolean }[] {
    return Array.from({ length: 5 }, (_, index) => ({
      filled: index < rating
    }));
  }
}