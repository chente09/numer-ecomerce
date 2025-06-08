import { ElementRef, Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ScrollService {
  private navbarHeight = 80;
  
  constructor(private router: Router) {
    // 🔧 QUITAR take(1) para que se aplique a TODAS las navegaciones
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      // 🔧 AGREGAR setTimeout para asegurar que el componente esté renderizado
      setTimeout(() => {
        this.scrollToTop();
      }, 100); // Pequeño delay para asegurar renderizado
    });
  }
  
  // 🆕 MÉTODO ESPECÍFICO PARA SCROLL AL TOP
  scrollToTop(): void {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth'
    });
  }
  
  setNavbarHeight(height: number): void {
    this.navbarHeight = height;
  }
  
  scrollToElement(element: ElementRef | HTMLElement): void {
    const targetElement = element instanceof ElementRef ? element.nativeElement : element;
    
    if (targetElement) {
      const elementPosition = targetElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - this.navbarHeight;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  }
  
  scrollToElementById(id: string): void {
    const element = document.getElementById(id);
    if (element) {
      this.scrollToElement(element);
    }
  }
}