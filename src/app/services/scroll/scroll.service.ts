import { ElementRef, Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ScrollService {

  private navbarHeight = 80; // Ajusta según la altura de tu navbar
  
  constructor() { }
  
  // Método para configurar la altura del navbar
  setNavbarHeight(height: number): void {
    this.navbarHeight = height;
  }
  
  // Método para hacer scroll a un elemento por ElementRef
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
  
  // Método para hacer scroll por ID
  scrollToElementById(id: string): void {
    const element = document.getElementById(id);
    if (element) {
      this.scrollToElement(element);
    }
  }
}
