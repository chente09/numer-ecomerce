import { 
  Component, 
  OnInit, 
  ChangeDetectionStrategy, 
  signal, 
  computed, 
  effect,
  inject,
  DestroyRef,
  ElementRef,
  ViewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { HeroService, HeroItem } from '../../services/admin/hero/hero.service';
import { 
  startWith, 
  catchError,
  tap,
  retry,
  take
} from 'rxjs/operators';
import { of } from 'rxjs';
import { ActionButtonComponent } from "../action-button/action-button.component";

@Component({
  selector: 'app-hero-section',
  imports: [CommonModule, ActionButtonComponent],
  templateUrl: './hero-section.component.html',
  styleUrl: './hero-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeroSectionComponent implements OnInit {
  @ViewChild('heroSection', { static: true }) heroSectionRef!: ElementRef<HTMLElement>;

  // 🚀 Inyección moderna de dependencias
  private readonly heroService = inject(HeroService);
  private readonly destroyRef = inject(DestroyRef);

  // 🎯 Signals reactivos SIMPLIFICADOS
  private readonly _heroData = signal<HeroItem | null>(null);
  private readonly _isLoading = signal<boolean>(true);
  private readonly _hasError = signal<boolean>(false);
  private readonly _contentVisible = signal<boolean>(false);

  // 📊 Computed values optimizados
  readonly activeHero = computed(() => this._heroData());
  readonly isLoading = computed(() => this._isLoading());
  readonly hasError = computed(() => this._hasError());
  readonly contentVisible = computed(() => this._contentVisible());
  
  readonly heroClasses = computed(() => {
    const hero = this.activeHero();
    const classes = [];
    
    classes.push('hero-section');
    
    if (hero?.isGif === true) {
      classes.push('is-gif');
    }
    
    if (!this.isLoading()) {
      classes.push('images-loaded');
    }
    
    if (this.isLoading()) {
      classes.push('loading');
    }
    
    if (this.hasError()) {
      classes.push('error');
    }
    
    if (hero?.isActive === true) {
      classes.push('active-hero');
    }

    return classes.join(' ');
  });

  // 🎨 Estilos inline dinámicos (reemplaza CSS variables)
  readonly heroStyles = computed(() => {
    const hero = this.activeHero();
    if (!hero) {
      return {
        'background-color': '#333333',
        'color': '#ffffff',
        'background-image': 'none'
      };
    }
    
    const isMobile = window.innerWidth <= 768;
    const imageUrl = (isMobile && hero.mobileImageUrl) ? hero.mobileImageUrl : hero.imageUrl;
    
    return {
      'background-color': hero.backgroundColor || '#333333',
      'color': hero.textColor || '#ffffff',
      'background-image': imageUrl ? `url('${imageUrl}')` : 'none'
    };
  });

  constructor() {
    // 🔥 Effect para actualizar estilos automáticamente
    effect(() => {
      const styles = this.heroStyles();
      this.applyStylesToElement(styles);
    });

    // 🎯 Effect para mostrar contenido cuando esté listo
    effect(() => {
      const hero = this.activeHero();
      const loading = this.isLoading();
      
      if (hero && !loading) {
        // Mostrar contenido inmediatamente
        setTimeout(() => {
          this._contentVisible.set(true);
        }, 100);
      } else {
        this._contentVisible.set(false);
      }
    });

    // 🎯 Effect para debug y tracking
    effect(() => {
      const hero = this.activeHero();
    });
  }

  ngOnInit(): void {
    
    // 🎯 SUSCRIPCIÓN PRINCIPAL SIMPLIFICADA
    this.heroService.getActiveHero().pipe(
      startWith(null),
      retry(2), // Reintentar 2 veces en caso de error
      catchError(error => {
        console.error('❌ Error en getActiveHero:', error);
        this._hasError.set(true);
        this._isLoading.set(false);
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(hero => {
      this.processHeroUpdate(hero);
    });

    // 🔄 También escuchar el estado de carga del servicio
    this.heroService.getLoadingState().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(loading => {
      this._isLoading.set(loading);
    });

    // ⚠️ Escuchar errores del servicio
    this.heroService.getErrorState().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(error => {
      this._hasError.set(!!error);
      if (error) {
        console.error('💥 Error del servicio:', error);
      }
    });
  }

  // 🔄 Procesar actualización de hero
  private processHeroUpdate(hero: HeroItem | null): void {    
    this._heroData.set(hero);
    this._hasError.set(false);
    
    if (hero) {
      this._isLoading.set(false);
    } else {
      this._isLoading.set(false);
    }
  }

  // 🎨 Aplicar estilos al elemento (reemplaza CSS variables)
  private applyStylesToElement(styles: Record<string, string>): void {
    if (!this.heroSectionRef?.nativeElement) return;
    
    requestAnimationFrame(() => {
      const element = this.heroSectionRef.nativeElement;
      
      Object.entries(styles).forEach(([property, value]) => {
        if (value && value !== 'none' && value !== 'undefined') {
          element.style.setProperty(property, value);
        }
      });
    });
  }

  // 🔄 Método público para forzar refresh
  refreshHero(): void {
    this._isLoading.set(true);
    this._hasError.set(false);
    
    // Forzar refresh en el servicio
    this.heroService.getHeroes(true).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      
      error: (error) => {
        console.error('❌ Error al refrescar heroes:', error);
        this._hasError.set(true);
        this._isLoading.set(false);
      }
    });
  }

  // 🎯 Track function para rendimiento
  trackByHeroId = (index: number, hero: HeroItem): string => hero?.id || index.toString();

  // 🛠️ Métodos de utilidad para el template
  
  getHeroTitle(): string {
    return this.activeHero()?.title || 'Cargando...';
  }

  getHeroSubtitle(): string {
    return this.activeHero()?.subtitle || '';
  }

  getHeroCtaText(): string {
    return this.activeHero()?.ctaText || 'Ver más';
  }

  getHeroCtaLink(): string {
    return this.activeHero()?.ctaLink || '#';
  }

  isHeroGif(): boolean {
    return this.activeHero()?.isGif === true;
  }

  // 📱 Detectar si es dispositivo móvil
  isMobileDevice(): boolean {
    return window.innerWidth <= 768;
  }

  // 🖼️ Verificar si debe mostrar hero
  shouldShowHero(): boolean {
    const hero = this.activeHero();
    const loading = this.isLoading();
    
    // Mostrar hero si tenemos datos y no estamos cargando
    return !!hero && !loading;
  }

  // 🖼️ Verificar si debe mostrar skeleton
  shouldShowSkeleton(): boolean {
    return this.isLoading() || (!this.activeHero() && !this.hasError());
  }

  // 🔍 Debug info (solo para desarrollo)
  getDebugInfo(): any {
    return {
      hero: this.activeHero(),
      isLoading: this.isLoading(),
      hasError: this.hasError(),
      contentVisible: this.contentVisible(),
      heroStyles: this.heroStyles()
    };
  }

  // 🎨 Obtener color del texto dinámicamente
  getTextColor(): string {
    return this.activeHero()?.textColor || '#ffffff';
  }

  // 🎨 Obtener color de fondo dinámicamente
  getBackgroundColor(): string {
    return this.activeHero()?.backgroundColor || '#333333';
  }

  // 🖼️ Obtener URL de imagen según dispositivo
  getCurrentImageUrl(): string | null {
    const hero = this.activeHero();
    if (!hero) return null;
    
    const isMobile = this.isMobileDevice();
    return (isMobile && hero.mobileImageUrl) ? hero.mobileImageUrl : hero.imageUrl;
  }

  // 📊 Verificar si la imagen actual es un GIF
  isCurrentImageGif(): boolean {
    const currentUrl = this.getCurrentImageUrl();
    return this.isHeroGif() && !!currentUrl;
  }

  // 📊 Obtener estadísticas del componente
  getComponentStats(): any {
    return {
      isLoading: this.isLoading(),
      hasContent: !!this.activeHero(),
      isVisible: this.contentVisible(),
      currentImageUrl: this.getCurrentImageUrl(),
      isGif: this.isHeroGif()
    };
  }
}