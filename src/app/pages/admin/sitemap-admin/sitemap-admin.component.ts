import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SitemapService } from '../../../services/admin/sitemap/sitemap.service';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzTypographyModule } from 'ng-zorro-antd/typography';

@Component({
  selector: 'app-sitemap-admin',
  imports: [
    CommonModule,
    NzCardModule,
    NzButtonModule,
    NzIconModule,
    NzSpinModule,
    NzAlertModule,
    NzListModule,
    NzTagModule,
    NzDividerModule,
    NzTypographyModule

  ],
  templateUrl: './sitemap-admin.component.html',
  styleUrl: './sitemap-admin.component.css'
})
export class SitemapAdminComponent implements OnInit {

  sitemapStatus: any = null;
  generatingSitemap = false;
  validating = false;

  staticUrls = [
    { path: '/', priority: '1.0' },
    { path: '/shop', priority: '0.9' },
    { path: '/nosotros', priority: '0.8' },
    { path: '/ubicaciones', priority: '0.7' },
    { path: '/servicio-cliente', priority: '0.7' },
    { path: '/cuidado-producto', priority: '0.6' },
    { path: '/embajadores', priority: '0.6' }
  ];

  constructor(
    private sitemapService: SitemapService,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {
    this.validateCurrentSitemap();
  }

  async generateAndDownloadSitemap(): Promise<void> {
    this.generatingSitemap = true;
    try {
      this.sitemapService.downloadSitemap();
      this.message.success('Sitemap generado y descargado correctamente');
    } catch (error) {
      console.error('Error generando sitemap:', error);
      this.message.error('Error al generar el sitemap');
    } finally {
      this.generatingSitemap = false;
    }
  }

  downloadRobotsTxt(): void {
    try {
      this.sitemapService.downloadRobotsTxt();
      this.message.success('robots.txt descargado correctamente');
    } catch (error) {
      console.error('Error descargando robots.txt:', error);
      this.message.error('Error al descargar robots.txt');
    }
  }

  async validateCurrentSitemap(): Promise<void> {
    this.validating = true;
    try {
      this.sitemapStatus = await this.sitemapService.validateSitemap();
      
      if (this.sitemapStatus.isValid) {
        this.message.success('Sitemap válido');
      } else {
        this.message.warning('Sitemap con errores - revisa los detalles');
      }
    } catch (error) {
      console.error('Error validando sitemap:', error);
      this.message.error('Error al validar el sitemap');
    } finally {
      this.validating = false;
    }
  }

  getStatusDescription(): string {
    if (!this.sitemapStatus) return '';
    
    if (this.sitemapStatus.isValid) {
      return `Sitemap con ${this.sitemapStatus.urlCount} URLs listo para enviar a Google Search Console.`;
    } else {
      return 'Se encontraron errores que deben corregirse antes de enviar a Google.';
    }
  }

  getGoogleVerificationTag(): string {
    return '<meta name="google-site-verification" content="TU_CÓDIGO_DE_VERIFICACIÓN_AQUÍ" />';
  }

  getSitemapUrl(): string {
    return 'https://numer.store/sitemap.xml';
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.message.success('Copiado al portapapeles');
    }).catch(() => {
      this.message.error('Error al copiar');
    });
  }

}
