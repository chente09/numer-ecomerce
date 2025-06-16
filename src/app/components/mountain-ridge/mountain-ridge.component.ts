import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild } from '@angular/core';

@Component({
  selector: 'app-mountain-ridge',
  imports: [],
  templateUrl: './mountain-ridge.component.html',
  styleUrl: './mountain-ridge.component.css'
})
export class MountainRidgeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('ridgelinePath') ridgelinePath!: ElementRef<SVGPathElement>;
  @ViewChild('mountainSvg') mountainSvg!: ElementRef<SVGSVGElement>;
  @ViewChild('restartBtn') restartBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('progressIndicator') progressIndicator!: ElementRef<HTMLDivElement>;

  isAnimating = false;
  pathLength = 0;
  private animationTimeout: any;
  private intersectionObserver: IntersectionObserver | null = null;
  private initAttempts = 0;
  private maxInitAttempts = 30; // Aumentado para móviles más lentos
  private resizeTimeout: any;
  private isMobile = false;

  ngAfterViewInit(): void {
    // Detectar si es móvil
    this.detectMobile();
    
    // Esperar más tiempo en móviles para que el DOM esté completamente listo
    const delay = this.isMobile ? 200 : 100;
    setTimeout(() => {
      this.tryInitialize();
    }, delay);
  }

  private detectMobile(): void {
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
                    || window.innerWidth <= 768;
  }

  private tryInitialize(): void {
    this.initAttempts++;
    
    // Verificar si tenemos los elementos necesarios
    if (!this.ridgelinePath?.nativeElement || !this.mountainSvg?.nativeElement) {
      if (this.initAttempts < this.maxInitAttempts) {
        const retryDelay = this.isMobile ? 100 : 50; // Más tiempo en móviles
        setTimeout(() => this.tryInitialize(), retryDelay);
      } else {
        console.error('Failed to initialize mountain ridge component after', this.maxInitAttempts, 'attempts');
        // Fallback: intentar con valores por defecto
        this.fallbackInitialization();
      }
      return;
    }

    // Verificar que el elemento sea visible
    const rect = this.mountainSvg.nativeElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      if (this.initAttempts < this.maxInitAttempts) {
        setTimeout(() => this.tryInitialize(), 100);
      }
      return;
    }

    // Intentar calcular la longitud del path
    const success = this.calculatePathLength();
    
    if (success) {
      // Configurar el observer
      this.setupIntersectionObserver();
      
      // Iniciar la animación después de un breve delay
      setTimeout(() => {
        this.restartAnimation();
      }, this.isMobile ? 200 : 100);
    } else if (this.initAttempts < this.maxInitAttempts) {
      // Reintentar si falló
      setTimeout(() => this.tryInitialize(), 100);
    } else {
      this.fallbackInitialization();
    }
  }

  private fallbackInitialization(): void {
    console.warn('Using fallback initialization for mountain ridge');
    this.pathLength = 4000; // Valor por defecto
    
    const path = this.ridgelinePath?.nativeElement;
    if (path) {
      path.style.strokeDasharray = `${this.pathLength}`;
      path.style.strokeDashoffset = `${this.pathLength}`;
    }
    
    this.setupIntersectionObserver();
  }

  calculatePathLength(): boolean {
    try {
      const path = this.ridgelinePath.nativeElement;
      
      // Verificar que el path esté renderizado
      if (!path.isConnected) {
        return false;
      }
      
      // Obtener la longitud del path con manejo de errores específico para móviles
      let length: number;
      try {
        length = path.getTotalLength();
      } catch (error) {
        // Algunas versiones de Android pueden fallar con getTotalLength
        console.warn('getTotalLength failed, using fallback');
        length = 0;
      }
      
      // Verificar si obtuvimos una longitud válida
      if (length > 0 && length < 100000) { // Sanity check
        this.pathLength = Math.ceil(length);
      } else {
        // Usar un valor por defecto basado en el viewBox del SVG
        this.pathLength = 4000;
        console.warn('Using default path length:', this.pathLength);
      }
      
      // Configurar los estilos iniciales con timeout para móviles
      setTimeout(() => {
        path.style.strokeDasharray = `${this.pathLength}`;
        path.style.strokeDashoffset = `${this.pathLength}`;
      }, this.isMobile ? 50 : 0);
      
      return true;
    } catch (error) {
      console.warn('Error calculating path length:', error);
      return false;
    }
  }

  restartAnimation(): void {
    if (this.isAnimating) return;
    
    const path = this.ridgelinePath?.nativeElement;
    const svg = this.mountainSvg?.nativeElement;
    const btn = this.restartBtn?.nativeElement;
    const progress = this.progressIndicator?.nativeElement;
    
    if (!path || !svg) return;
    
    this.isAnimating = true;
    
    // Actualizar UI
    if (btn) {
      btn.textContent = 'Dibujando...';
      btn.disabled = true;
    }
    
    if (progress) {
      progress.classList.add('visible');
    }
    
    // Resetear animación con timeout para móviles
    svg.classList.remove('in-view');
    path.classList.remove('glowing');
    
    // Resetear estilos
    path.style.strokeDasharray = `${this.pathLength}`;
    path.style.strokeDashoffset = `${this.pathLength}`;
    
    // Delay más largo para móviles para asegurar que los cambios se apliquen
    const activationDelay = this.isMobile ? 100 : 50;
    
    setTimeout(() => {
      // Activar animación
      svg.classList.add('in-view');
      
      // Agregar efecto de brillo
      setTimeout(() => {
        path.classList.add('glowing');
      }, 500);
      
      // Limpiar después de la animación - tiempo ajustado según el CSS
      const animationDuration = this.isMobile ? 4000 : 5000;
      this.animationTimeout = setTimeout(() => {
        if (btn) {
          btn.textContent = 'Dibujar Ridge';
          btn.disabled = false;
        }
        if (progress) {
          progress.classList.remove('visible');
        }
        this.isAnimating = false;
      }, animationDuration);
    }, activationDelay);
  }

  private setupIntersectionObserver(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    // Threshold más bajo para móviles
    const threshold = this.isMobile ? 0.05 : 0.1;

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.isAnimating) {
          // Solo animar si el componente está completamente inicializado
          if (this.pathLength > 0) {
            // Delay adicional en móviles para asegurar estabilidad
            setTimeout(() => {
              this.restartAnimation();
            }, this.isMobile ? 300 : 100);
          }
        }
      });
    }, { 
      threshold: threshold,
      rootMargin: '10px' // Margen adicional para activación temprana
    });

    const svg = this.mountainSvg?.nativeElement;
    if (svg) {
      this.intersectionObserver.observe(svg);
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Deshabilitar en móviles para evitar problemas
    if (this.isMobile) return;
    
    switch(event.key.toLowerCase()) {
      case 'r':
      case 'm':
        event.preventDefault();
        this.restartAnimation();
        break;
      case 'escape':
        if (this.isAnimating) {
          this.stopAnimation();
        }
        break;
    }
  }

  @HostListener('document:dblclick', ['$event'])
  handleDoubleClick(event: MouseEvent) {
    const target = event.target as Element;
    if (!target.classList.contains('restart-btn') && !this.isMobile) {
      this.restartAnimation();
    }
  }

  @HostListener('window:resize')
  onResize() {
    // Debounce resize para evitar múltiples llamadas
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    
    this.resizeTimeout = setTimeout(() => {
      // Actualizar detección de móvil
      this.detectMobile();
      
      if (!this.isAnimating) {
        // Recalcular la longitud del path después de redimensionar
        // Delay más largo en móviles
        setTimeout(() => {
          this.calculatePathLength();
        }, this.isMobile ? 500 : 300);
      }
    }, 250);
  }

  @HostListener('window:orientationchange')
  onOrientationChange() {
    // Manejar cambios de orientación específicamente en móviles
    if (this.isMobile) {
      setTimeout(() => {
        this.detectMobile();
        this.calculatePathLength();
        
        // Reiniciar animación si no está corriendo
        if (!this.isAnimating) {
          setTimeout(() => {
            this.restartAnimation();
          }, 500);
        }
      }, 600); // Tiempo extra para que el navegador móvil se ajuste
    }
  }

  private stopAnimation(): void {
    if (this.animationTimeout) {
      clearTimeout(this.animationTimeout);
    }
    
    const path = this.ridgelinePath?.nativeElement;
    const btn = this.restartBtn?.nativeElement;
    const progress = this.progressIndicator?.nativeElement;
    
    if (path) {
      path.style.animation = 'none';
      path.style.strokeDashoffset = '0';
    }
    
    if (btn) {
      btn.textContent = 'Dibujar Ridge';
      btn.disabled = false;
    }
    
    if (progress) {
      progress.classList.remove('visible');
    }
    
    this.isAnimating = false;
  }

  ngOnDestroy(): void {
    if (this.animationTimeout) {
      clearTimeout(this.animationTimeout);
    }
    
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }
}