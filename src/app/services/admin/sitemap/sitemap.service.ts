// src/app/services/sitemap/sitemap.service.ts
import { Injectable } from '@angular/core';
import { ProductService } from '../../admin/product/product.service';
import { CategoryService } from '../../admin/category/category.service';
import { environment } from '../../../../environments/environment';
import { firstValueFrom } from 'rxjs';

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

@Injectable({
  providedIn: 'root'
})
export class SitemapService {
  private siteUrl = environment.siteUrl || 'https://numer.store';

  constructor(
    private productService: ProductService,
    private categoryService: CategoryService
  ) { }

  /**
   * Generar sitemap completo
   */
  async generateSitemap(): Promise<string> {
    const urls: SitemapUrl[] = [];

    // 1. URLs estáticas principales
    urls.push(...this.getStaticUrls());

    // 2. URLs de productos
    const productUrls = await this.getProductUrls();
    urls.push(...productUrls);

    // 3. URLs de categorías
    const categoryUrls = await this.getCategoryUrls();
    urls.push(...categoryUrls);

    // 4. Generar XML
    return this.generateSitemapXML(urls);
  }

  /**
   * URLs estáticas del sitio
   */
  private getStaticUrls(): SitemapUrl[] {
    const today = new Date().toISOString();

    return [
      {
        loc: this.siteUrl,
        lastmod: today,
        changefreq: 'daily',
        priority: 1.0
      },
      {
        loc: `${this.siteUrl}/shop`,
        lastmod: today,
        changefreq: 'daily',
        priority: 0.9
      },
      {
        loc: `${this.siteUrl}/nosotros`,
        lastmod: today,
        changefreq: 'monthly',
        priority: 0.8
      },
      {
        loc: `${this.siteUrl}/ubicaciones`,
        lastmod: today,
        changefreq: 'weekly',
        priority: 0.7
      },
      {
        loc: `${this.siteUrl}/servicio-cliente`,
        lastmod: today,
        changefreq: 'weekly',
        priority: 0.7
      },
      {
        loc: `${this.siteUrl}/cuidado-producto`,
        lastmod: today,
        changefreq: 'monthly',
        priority: 0.6
      },
      {
        loc: `${this.siteUrl}/review-form`,
        lastmod: today,
        changefreq: 'weekly',
        priority: 0.5
      },
      {
        loc: `${this.siteUrl}/embajadores`,
        lastmod: today,
        changefreq: 'monthly',
        priority: 0.6
      }
    ];
  }

  /**
   * URLs de productos dinámicas
   */
  private async getProductUrls(): Promise<SitemapUrl[]> {
    try {
      const products = await firstValueFrom(this.productService.getProducts());

      return products.map(product => ({
        loc: `${this.siteUrl}/products/${product.id}`,
        lastmod: this.formatDate(product.updatedAt || product.createdAt || new Date()),
        changefreq: 'weekly' as const,
        priority: 0.8
      }));
    } catch (error) {
      console.error('Error obteniendo productos para sitemap:', error);
      return [];
    }
  }

  /**
   * URLs de categorías dinámicas
   */
  private async getCategoryUrls(): Promise<SitemapUrl[]> {
    try {
      const categories = await firstValueFrom(this.categoryService.getCategories());

      return categories.map(category => ({
        loc: `${this.siteUrl}/shop?category=${category.id}`,
        lastmod: new Date().toISOString(),
        changefreq: 'weekly' as const,
        priority: 0.7
      }));
    } catch (error) {
      console.error('Error obteniendo categorías para sitemap:', error);
      return [];
    }
  }

  /**
   * Generar XML del sitemap
   */
  private generateSitemapXML(urls: SitemapUrl[]): string {
    const urlEntries = urls.map(url => `
  <url>
    <loc>${this.escapeXml(url.loc)}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}
    ${url.changefreq ? `<changefreq>${url.changefreq}</changefreq>` : ''}
    ${url.priority !== undefined ? `<priority>${url.priority}</priority>` : ''}
  </url>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
  }

  /**
   * Generar robots.txt
   */
  generateRobotsTxt(): string {
    return `User-agent: *
Allow: /

# Principales bots de búsqueda
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# Bloquear rutas administrativas
Disallow: /admin/
Disallow: /api/
Disallow: /private/

# Permitir recursos estáticos
Allow: /*.css$
Allow: /*.js$
Allow: /*.png$
Allow: /*.jpg$
Allow: /*.jpeg$
Allow: /*.gif$
Allow: /*.webp$
Allow: /*.svg$

# Sitemap
Sitemap: ${this.siteUrl}/sitemap.xml

# Crawl delay para ser amigables
Crawl-delay: 1`;
  }

  /**
   * Utility: Escapar XML
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Utility: Formatear fecha para XML
   */
  private formatDate(date: Date | any): string {
    try {
      if (!date) return new Date().toISOString();

      // Manejar timestamps de Firebase
      if (date.toDate && typeof date.toDate === 'function') {
        return date.toDate().toISOString();
      }

      // Manejar strings de fecha
      if (typeof date === 'string') {
        return new Date(date).toISOString();
      }

      // Manejar objetos Date
      if (date instanceof Date) {
        return date.toISOString();
      }

      return new Date().toISOString();
    } catch (error) {
      console.warn('Error formateando fecha:', error);
      return new Date().toISOString();
    }
  }

  /**
   * Descargar sitemap como archivo
   */
  downloadSitemap(): void {
    this.generateSitemap().then(xml => {
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sitemap.xml';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    });
  }

  /**
   * Descargar robots.txt como archivo
   */
  downloadRobotsTxt(): void {
    const robotsTxt = this.generateRobotsTxt();
    const blob = new Blob([robotsTxt], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'robots.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Verificar estado del sitemap
   */
  async validateSitemap(): Promise<{ isValid: boolean; urlCount: number; errors: string[] }> {
    try {
      const xml = await this.generateSitemap();
      const urlCount = (xml.match(/<url>/g) || []).length;
      const errors: string[] = [];

      // Validaciones básicas
      if (urlCount === 0) {
        errors.push('El sitemap no contiene URLs');
      }

      if (urlCount > 50000) {
        errors.push('El sitemap excede 50,000 URLs (límite de Google)');
      }

      if (xml.length > 50 * 1024 * 1024) {
        errors.push('El sitemap excede 50MB (límite de Google)');
      }

      return {
        isValid: errors.length === 0,
        urlCount,
        errors
      };
    } catch (error) {
      return {
        isValid: false,
        urlCount: 0,
        errors: [`Error generando sitemap: ${error}`]
      };
    }
  }
}