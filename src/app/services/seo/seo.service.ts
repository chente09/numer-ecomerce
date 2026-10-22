// src/app/services/seo/seo.service.ts
import { Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { catchError, filter, take } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { buildBreadcrumbJsonLd, buildProductSeo } from '../../core/product-seo';
import { buildTechnologyResolver } from '../../core/technology-labels';
import { CategoryService } from '../admin/category/category.service';
import { TechnologyService } from '../admin/technology/technology.service';

export interface SEOData {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'product' | 'article';
  price?: number;
  currency?: string;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder';
  brand?: string;
  category?: string;
  sku?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private defaultSEO: SEOData = {
    title: 'NUMER - Ropa Técnica para Deportes Outdoor, Montaña y Aventura | Ecuador',
    description: 'Descubre la mejor ropa técnica para deportes outdoor en Ecuador. Pantalón Extraligero trail, chompas impermeables AGUACERO y más. Perfecta para montaña, escalada, ciclismo, MTB, DH y aventuras al aire libre.',
    keywords: 'pantalón trail, ropa trekking ligera, pantalón outdoor, ropa deportiva montaña, pantalón técnico, NUMER trail, impermeable, aventura, escalada, MTB, DH, running, ciclismo ruta, pantalón extraligero, chompa AGUACERO',
    image: 'https://firebasestorage.googleapis.com/v0/b/numer-16f35.firebasestorage.app/o/products%2F27d9425a-2698-452d-8b93-4962772f11b7%2Fcolors%2Fverde%20olivo.webp?alt=media&token=9aaea191-a3c5-47ef-ab6f-c59e0b8226c0',
    url: environment.siteUrl || 'https://numer.store', // ✅ FALLBACK agregado
    type: 'website'
  };

  /** Product whose SEO is being resolved (names of categories and technologies load asynchronously). */
  private currentProductId: string | null = null;

  constructor(
    private meta: Meta,
    private title: Title,
    private router: Router,
    private categoryService: CategoryService,
    private technologyService: TechnologyService
  ) {
    // Escuchar cambios de ruta para actualizar breadcrumbs
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.updateBreadcrumbSchema(event.urlAfterRedirects || event.url);
        // Product data must not outlive its page (a page that never calls updateSEO would keep it)
        if (!(event.urlAfterRedirects || event.url).startsWith('/products/')) {
          this.currentProductId = null;
          this.clearProductData();
        }
      });
  }

  /**
   * Actualizar todos los meta tags SEO
   */
  updateSEO(seoData: Partial<SEOData>): void {
    const data = { ...this.defaultSEO, ...seoData };
    
    // Actualizar título
    this.title.setTitle(data.title!);
    
    // Meta tags básicos
    this.updateTag('description', data.description!);
    this.updateTag('keywords', data.keywords!);
    this.updateTag('robots', 'index, follow, max-image-preview:large');
    
    // URLs canónicas
    this.updateLinkTag('canonical', data.url!);
    
    // Open Graph (Facebook)
    this.updateTag('property', 'og:title', data.title!);
    this.updateTag('property', 'og:description', data.description!);
    this.updateTag('property', 'og:image', data.image!);
    this.updateTag('property', 'og:url', data.url!);
    this.updateTag('property', 'og:type', data.type!);
    this.updateTag('property', 'og:site_name', 'NUMER');
    this.updateTag('property', 'og:locale', 'es_EC');
    
    // Twitter Cards
    this.updateTag('name', 'twitter:card', 'summary_large_image');
    this.updateTag('name', 'twitter:site', '@numer_ec');
    this.updateTag('name', 'twitter:creator', '@numer_ec');
    this.updateTag('name', 'twitter:title', data.title!);
    this.updateTag('name', 'twitter:description', data.description!);
    this.updateTag('name', 'twitter:image', data.image!);
    
    // Datos específicos de productos
    if (data.type === 'product') {
      this.updateProductMetaTags(data); // ✅ RENOMBRADO para evitar duplicación
    } else {
      this.clearProductData();
    }
  }

  /**
   * Meta tags específicos para productos
   */
  private updateProductMetaTags(data: SEOData): void {
    // Open Graph para productos
    this.updateTag('property', 'product:price:amount', data.price?.toString() || '');
    this.updateTag('property', 'product:price:currency', data.currency || 'USD');
    this.updateTag('property', 'product:availability', data.availability || 'InStock');
    this.updateTag('property', 'product:brand', data.brand || 'NUMER');
    this.updateTag('property', 'product:category', data.category || '');
    
  }

  /**
   * Actualizar structured data (JSON-LD)
   */
  private updateStructuredData(id: string, data: any): void {
    // Remover schema anterior si existe
    const existingScript = document.getElementById(id);
    if (existingScript) {
      existingScript.remove();
    }

    // Crear nuevo script de structured data
    const script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  /**
   * Actualizar breadcrumbs dinámicamente
   */
  private updateBreadcrumbSchema(url: string): void {
    const siteUrl = environment.siteUrl || 'https://numer.store';
    const pathSegments = url.split(/[?#]/)[0].split('/').filter(segment => segment);
    const breadcrumbItems: any[] = [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Inicio",
        "item": siteUrl
      }
    ];

    // Mapeo de rutas a nombres legibles
    const routeNames: { [key: string]: string } = {
      'shop': 'Tienda',
      'products': 'Productos',
      'nosotros': 'Nosotros',
      'servicio-cliente': 'Servicio al Cliente',
      'ubicaciones': 'Ubicaciones',
      'review-form': 'Reseñas',
      'cuidado-producto': 'Cuidado del Producto'
    };

    pathSegments.forEach((segment, index) => {
      const position = index + 2;
      // The segment after /products is an id: the product page replaces this crumb with the real names
      const name = routeNames[segment] || (pathSegments[index - 1] === 'products' ? 'Producto' : this.capitalizeFirst(segment));
      const item = `${siteUrl}/${pathSegments.slice(0, index + 1).join('/')}`;
      
      breadcrumbItems.push({
        "@type": "ListItem",
        "position": position,
        "name": name,
        "item": item
      });
    });

    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": breadcrumbItems
    };

    this.updateStructuredData('breadcrumb-schema', breadcrumbSchema);
  }

  /**
   * SEO para páginas específicas
   */
  updatePageSEO(page: string, customData?: Partial<SEOData>): void {
    const siteUrl = environment.siteUrl || 'https://numer.store';
    let seoData: Partial<SEOData> = {};

    switch (page) {
      case 'home':
        seoData = {
          title: 'NUMER - Ropa Técnica para Deportes Outdoor, Montaña y Aventura | Ecuador',
          description: 'Descubre la mejor ropa técnica para deportes outdoor en Ecuador. Pantalón Extraligero trail, chompas impermeables AGUACERO y más.',
          url: siteUrl
        };
        break;

      case 'shop':
        seoData = {
          title: 'Tienda Online - Ropa Técnica Outdoor | NUMER Ecuador',
          description: 'Compra ropa técnica de alta calidad para deportes outdoor. Pantalones trail, chompas impermeables, ropa de montaña y más. Envíos a todo Ecuador.',
          url: `${siteUrl}/shop`
        };
        break;

      case 'nosotros':
        seoData = {
          title: 'Nosotros - Historia y Misión de NUMER | Ropa Outdoor Ecuador',
          description: 'Conoce la historia de NUMER, marca ecuatoriana de ropa técnica para deportes outdoor. Desde 2021 creando prendas de calidad para aventureros.',
          url: `${siteUrl}/nosotros`
        };
        break;

      case 'ubicaciones':
        seoData = {
          title: 'Ubicaciones y Distribuidores - NUMER Ecuador | Tiendas Físicas',
          description: 'Encuentra nuestra tienda física en Quito y distribuidores autorizados de NUMER en todo Ecuador. Ubicaciones, horarios y contacto.',
          url: `${siteUrl}/ubicaciones`
        };
        break;

      case 'servicio-cliente':
        seoData = {
          title: 'Servicio al Cliente - Soporte y Ayuda | NUMER Ecuador',
          description: 'Centro de ayuda NUMER. Preguntas frecuentes, garantías, devoluciones, seguimiento de pedidos y contacto directo.',
          url: `${siteUrl}/servicio-cliente`
        };
        break;
    }

    // Combinar con datos personalizados
    const finalData = { ...seoData, ...customData };
    this.updateSEO(finalData);
  }

  /**
   * SEO específico para productos individuales (método público).
   * Se aplica de inmediato con lo que ya se sabe y se completa con los nombres de categorías y tecnologías
   * cuando cargan. Si el cliente ya salió de la página, no se aplica.
   */
  updateProductSEO(product: any): void {
    if (!product?.id) return;
    this.currentProductId = product.id;
    this.applyProductSEO(product, [], [], null);

    forkJoin([
      this.categoryService.getCategories().pipe(take(1)),
      this.technologyService.getTechnologies().pipe(take(1))
    ]).pipe(catchError(() => of(null))).subscribe(result => {
      if (!result || this.currentProductId !== product.id) return;
      const [categories, technologies] = result;
      // Names only: an id never reaches the title, the description or the structured data
      const ids: string[] = [...new Set<string>([product.category, ...(product.categories ?? [])].filter(Boolean))];
      const categoryNames = ids
        .map(id => categories.find(c => c.id === id)?.name)
        .filter((name): name is string => !!name);
      const technologyNames = buildTechnologyResolver(technologies).labels(product.technologies);
      this.applyProductSEO(product, categoryNames, technologyNames, ids.find(id => categories.some(c => c.id === id)) ?? null);
    });
  }

  private applyProductSEO(product: any, categoryNames: string[], technologyNames: string[], categoryId: string | null): void {
    const siteUrl = environment.siteUrl || 'https://numer.store';
    const seo = buildProductSeo(product, { siteUrl, categoryNames, categoryId, technologyNames });

    this.updateSEO({
      title: seo.title,
      description: seo.description,
      keywords: seo.keywords,
      image: seo.image,
      url: seo.url,
      type: 'product',
      price: seo.price,
      currency: seo.currency,
      availability: seo.availability,
      brand: 'NUMER',
      category: seo.category,
      sku: seo.sku
    });
    this.updateStructuredData('product-schema', seo.jsonLd);
    this.updateStructuredData('breadcrumb-schema', buildBreadcrumbJsonLd(seo.breadcrumb));
  }

  /** Removes what only makes sense on a product page. */
  private clearProductData(): void {
    document.getElementById('product-schema')?.remove();
    ['product:price:amount', 'product:price:currency', 'product:availability', 'product:brand', 'product:category']
      .forEach(property => this.meta.removeTag(`property='${property}'`));
  }

  /**
   * Métodos auxiliares
   */
  private updateTag(attribute: string, selector: string, content?: string): void {
    if (content === undefined) {
      content = selector;
      selector = attribute;
      attribute = 'name';
    }
    
    this.meta.updateTag({ [attribute]: selector, content });
  }

  private updateLinkTag(rel: string, href: string): void {
    // Remover link existente
    const existingLink = document.querySelector(`link[rel="${rel}"]`);
    if (existingLink) {
      existingLink.remove();
    }

    // Crear nuevo link
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Restablecer SEO por defecto
   */
  resetToDefault(): void {
    this.updateSEO(this.defaultSEO);
  }
}