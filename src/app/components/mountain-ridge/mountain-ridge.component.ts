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
  private maxInitAttempts = 20;

  ngAfterViewInit(): void {
    // Inicializar después de que la vista esté lista
    this.tryInitialize();
  }

  private tryInitialize(): void {
    this.initAttempts++;
    
    // Verificar si tenemos los elementos necesarios
    if (!this.ridgelinePath?.nativeElement || !this.mountainSvg?.nativeElement) {
      if (this.initAttempts < this.maxInitAttempts) {
        setTimeout(() => this.tryInitialize(), 50);
      } else {
        console.error('Failed to initialize mountain ridge component after', this.maxInitAttempts, 'attempts');
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
      }, 100);
    } else if (this.initAttempts < this.maxInitAttempts) {
      // Reintentar si falló
      setTimeout(() => this.tryInitialize(), 50);
    }
  }

  calculatePathLength(): boolean {
    try {
      const path = this.ridgelinePath.nativeElement;
      
      // Obtener la longitud del path
      const length = path.getTotalLength();
      
      // Verificar si obtuvimos una longitud válida
      if (length > 0) {
        this.pathLength = Math.ceil(length);
      } else {
        // Usar un valor por defecto basado en el viewBox del SVG
        this.pathLength = 4000;
      }
      
      // Configurar los estilos iniciales
      path.style.strokeDasharray = `${this.pathLength}`;
      path.style.strokeDashoffset = `${this.pathLength}`;
      
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
    
    // Resetear animación
    svg.classList.remove('in-view');
    path.classList.remove('glowing');
    
    // Resetear estilos
    path.style.strokeDasharray = `${this.pathLength}`;
    path.style.strokeDashoffset = `${this.pathLength}`;
    
    // Pequeño delay para asegurar que los cambios se apliquen
    setTimeout(() => {
      // Activar animación
      svg.classList.add('in-view');
      
      // Agregar efecto de brillo
      setTimeout(() => {
        path.classList.add('glowing');
      }, 500);
      
      // Limpiar después de la animación
      this.animationTimeout = setTimeout(() => {
        if (btn) {
          btn.textContent = 'Dibujar Ridge';
          btn.disabled = false;
        }
        if (progress) {
          progress.classList.remove('visible');
        }
        this.isAnimating = false;
      }, 5000);
    }, 50);
  }

  private setupIntersectionObserver(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.isAnimating) {
          // Solo animar si el componente está completamente inicializado
          if (this.pathLength > 0) {
            this.restartAnimation();
          }
        }
      });
    }, { 
      threshold: 0.1
    });

    const svg = this.mountainSvg?.nativeElement;
    if (svg) {
      this.intersectionObserver.observe(svg);
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
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
    if (!target.classList.contains('restart-btn')) {
      this.restartAnimation();
    }
  }

  @HostListener('window:resize')
  onResize() {
    if (!this.isAnimating) {
      // Recalcular la longitud del path después de redimensionar
      setTimeout(() => {
        this.calculatePathLength();
      }, 300);
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
    
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }
}