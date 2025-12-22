import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';

export type ButtonVariant = 'gradient' | 'gradient-dark' | 'solid' | 'outline';
export type ButtonSize = 'small' | 'medium' | 'large';


@Component({
  selector: 'app-action-button',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NzIconModule
  ],
  templateUrl: './action-button.component.html',
  styleUrl: './action-button.component.css'
})
export class ActionButtonComponent {

  // Contenido del botón
  @Input() text: string = '';
  
  // Navegación
  @Input() link: string = '';
  @Input() isExternal: boolean = false;
  
  // Estilos y variantes
  @Input() variant: ButtonVariant = 'gradient';
  @Input() size: ButtonSize = 'medium';
  
  // Iconos
  @Input() showIcon: boolean = true;
  @Input() iconPosition: 'left' | 'right' = 'right';
  @Input() customIcon: string = ''; // SVG path personalizado
  
  // Accesibilidad
  @Input() ariaLabel: string = '';
  
  // Clases adicionales
  @Input() customClass: string = '';

  @Input() nzIcon: string = ''; // Nuevo: soporte para iconos ng-zorro
  @Input() nzIconTheme: 'outline' | 'fill' | 'twotone' = 'outline';
  

  // Determina si el link es interno o externo
  get isInternalLink(): boolean {
    return this.link.startsWith('/');
  }

  // Target para links externos
  get linkTarget(): string | undefined {
    return this.isExternal || !this.isInternalLink ? '_blank' : undefined;
  }

  // Rel para links externos
  get linkRel(): string | null {
    return this.isExternal || !this.isInternalLink ? 'noopener noreferrer' : null;
  }

  // Aria label completo
  get computedAriaLabel(): string {
    return this.ariaLabel || this.text;
  }

  // Icono por defecto (flecha derecha)
  get defaultIcon(): string {
    return this.customIcon || 'M4 8a.5.5 0 0 1 .5-.5h5.793L8.146 5.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 8.5H4.5A.5.5 0 0 1 4 8z';
  }

  get useNzIcon(): boolean {
    return !!this.nzIcon;
  }
  
}
