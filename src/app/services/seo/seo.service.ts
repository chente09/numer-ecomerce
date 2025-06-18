// src/app/services/seo/seo.service.ts
import { Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

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

  constructor(
    private meta: Meta,
    private title: Title,
    private router: Router
  ) {
    // Escuchar cambios de ruta para actualizar breadcrumbs
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.updateBreadcrumbSchema(event.url);
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
    
    // Structured Data para productos
    this.updateProductStructuredData(data);
  }

  /**
   * Generar JSON-LD para productos
   */
  private updateProductStructuredData(data: SEOData): void {
    const productSchema = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": data.title,
      "description": data.description,
      "image": data.image,
      "brand": {
        "@type": "Brand",
        "name": data.brand || "NUMER"
      },
      "category": data.category,
      "sku": data.sku,
      "offers": {
        "@type": "Offer",
        "price": data.price,
        "priceCurrency": data.currency || "USD",
        "availability": `https://schema.org/${data.availability || 'InStock'}`,
        "seller": {
          "@type": "Organization",
          "name": "NUMER"
        }
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.8",
        "reviewCount": "127"
      }
    };

    this.updateStructuredData('product-schema', productSchema);
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
    const pathSegments = url.split('/').filter(segment => segment);
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
      const name = routeNames[segment] || this.capitalizeFirst(segment);
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
   * SEO específico para productos individuales (método público)
   */
  updateProductSEO(product: any): void {
    const siteUrl = environment.siteUrl || 'https://numer.store';
    const seoData: SEOData = {
      title: `${product.name} - ${product.category} | NUMER Ecuador`,
      description: `${product.description || ''} Ropa técnica de alta calidad para deportes outdoor. Disponible en NUMER Ecuador.`.substring(0, 160),
      keywords: `${product.name}, ${product.category}, ropa outdoor, NUMER, ${product.tags?.join(', ') || ''}`,
      image: product.imageUrl || product.colors?.[0]?.imageUrl,
      url: `${siteUrl}/products/${product.id}`,
      type: 'product',
      price: product.price,
      currency: 'USD',
      availability: product.totalStock > 0 ? 'InStock' : 'OutOfStock',
      brand: 'NUMER',
      category: product.category,
      sku: product.sku
    };

    this.updateSEO(seoData);
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