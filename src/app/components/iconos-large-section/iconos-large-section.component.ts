import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, signal, computed, inject, PLATFORM_ID, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NavigationItem } from '../../models/models';

@Component({
  selector: 'app-iconos-large-section',
  standalone: true,
  imports: [
    CommonModule,
    NzIconModule
  ],
  templateUrl: './iconos-large-section.component.html',
  styleUrl: './iconos-large-section.component.css'
})
export class IconosLargeSectionComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private resizeListener?: () => void;

  // 🎯 CONFIGURACIÓN
  @Input() customItems?: NavigationItem[];

  // 🚀 SEÑALES REACTIVAS
  private isMobile = signal(false);

  // 📊 DATOS PREDETERMINADOS CORREGIDOS
  private readonly defaultNavItems: NavigationItem[] = [
    {
      id: 'embajadores',
      icon: 'team',
      title: 'Embajadores',
      description: 'Conoce a nuestros embajadores',
      link: '/embajadores',
      order: 1,
      isActive: true
    },
    {
      id: 'eventos',
      icon: 'calendar',
      title: 'EVENTOS',
      description: 'Conoce nuestros eventos',
      link: '/eventos',
      order: 2,
      isActive: true
    },
    {
      id: 'tiendas',
      icon: 'shop',
      title: 'Encuéntranos',
      description: 'Visítanos en nuestras tiendas',
      link: '/ubicaciones',
      order: 3,
      isActive: true
    },
    {
      id: 'objetivo',
      icon: 'bulb',
      title: 'OBJETIVO',
      description: 'Acompañarte en cada aventura',
      link: '/nosotros',
      order: 4,
      isActive: true
    }
  ];

  // ✨ COMPUTED PROPERTIES
  navItems = computed(() => {
    const items = this.customItems || this.defaultNavItems;
    return items
      .filter(item => item.isActive !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  });

  isMobileView = computed(() => this.isMobile());

  ngOnInit(): void {
    this.detectMobileView();
    this.setupResponsiveListener();
  }

  ngOnDestroy(): void {
    if (this.resizeListener && isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.resizeListener);
    }
  }

  // 🔍 DETECCIÓN DE DISPOSITIVO MÓVIL
  private detectMobileView(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.isMobile.set(window.innerWidth <= 768);
    }
  }

  // 👂 LISTENER RESPONSIVO
  private setupResponsiveListener(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.resizeListener = () => {
        this.isMobile.set(window.innerWidth <= 768);
      };
      window.addEventListener('resize', this.resizeListener);
    }
  }

  // 🧭 NAVEGACIÓN SIMPLE
  navigateToItem(item: NavigationItem): void {
    if (!this.isValidLink(item.link)) return;

    try {
      if (item.isExternal) {
        if (isPlatformBrowser(this.platformId)) {
          window.open(item.link, '_blank', 'noopener,noreferrer');
        }
      } else {
        this.router.navigate([item.link]);
      }
    } catch (error) {
      console.error('❌ Error navegando:', error);
    }
  }

  // 🔧 MÉTODOS DE UTILIDAD
  trackByItem(index: number, item: NavigationItem): string {
    return item.id;
  }

  // ✅ FUNCIÓN CORREGIDA
  private isValidLink(link: string): boolean {
    return typeof link === 'string' && link.trim().length > 0;
  }
}