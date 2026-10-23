/**
 * The fixed pages of the shop and what a search engine should read for each one: title, description and the
 * short text that the page opens with. One source for the runtime SEO (SeoService) and for the static HTML
 * generated after the build, so both always say the same.
 */
export interface StaticPage {
  /** Key used by SeoService.updatePageSEO. */
  key: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  /** Sets the title when the visitor arrives from another page of the app and no component sets it. */
  autoSeo?: boolean;
}

export const STATIC_PAGES: StaticPage[] = [
  {
    key: 'shop',
    path: '/shop',
    title: 'Tienda Online - Ropa Técnica Outdoor | NUMER Ecuador',
    description: 'Compra ropa técnica de alta calidad para deportes outdoor. Pantalones trail, chompas impermeables, ropa de montaña y más. Envíos a todo Ecuador.',
    h1: 'Tienda NUMER: ropa técnica para deportes outdoor'
  },
  {
    key: 'nosotros',
    path: '/nosotros',
    title: 'Nosotros - Historia y Misión de NUMER | Ropa Outdoor Ecuador',
    description: 'Conoce la historia de NUMER, marca ecuatoriana de ropa técnica para deportes outdoor. Desde 2021 creando Pantalón Extraligero, Chompa AGUACERO y prendas de calidad para aventureros.',
    h1: 'Nosotros: historia y misión de NUMER'
  },
  {
    key: 'ubicaciones',
    path: '/ubicaciones',
    title: 'Ubicaciones y Distribuidores - NUMER Ecuador | Tiendas Físicas',
    description: 'Encuentra nuestra tienda física en Quito y distribuidores autorizados de NUMER en todo Ecuador. Ubicaciones, horarios, contacto y mapa. Pantalón Extraligero, Chompa AGUACERO.',
    h1: 'Ubicaciones y distribuidores de NUMER en Ecuador'
  },
  {
    key: 'servicio-cliente',
    path: '/servicio-cliente',
    title: 'Servicio al Cliente - Soporte y Ayuda | NUMER Ecuador',
    description: 'Centro de ayuda NUMER. Preguntas frecuentes, garantías, devoluciones, seguimiento de pedidos y contacto directo.',
    h1: 'Servicio al cliente'
  },
  {
    key: 'cuidado-producto',
    path: '/cuidado-producto',
    title: 'Cuidado del Producto y Garantía | NUMER Ecuador',
    description: 'Recomendaciones para cuidar y lavar tu ropa técnica NUMER y cómo funciona la garantía de nuestros productos.',
    h1: 'Cuidado de producto y garantía',
    autoSeo: true
  },
  {
    key: 'review-form',
    path: '/review-form',
    title: 'Opiniones de Clientes | NUMER Ecuador',
    description: 'Lee las opiniones de quienes usan ropa técnica NUMER y comparte tu propia experiencia con la marca.',
    h1: 'Opiniones de nuestros clientes',
    autoSeo: true
  }
];

export function staticPageByKey(key: string): StaticPage | undefined {
  return STATIC_PAGES.find(page => page.key === key);
}

export function staticPageByPath(path: string): StaticPage | undefined {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return STATIC_PAGES.find(page => page.path === clean);
}

/** Entries of the main navigation, used for the links a crawler follows from every static page. */
export const MAIN_LINKS: { path: string; label: string }[] = [
  { path: '/shop', label: 'Tienda' },
  { path: '/nosotros', label: 'Nosotros' },
  { path: '/ubicaciones', label: 'Ubicaciones' },
  { path: '/servicio-cliente', label: 'Servicio al cliente' },
  { path: '/cuidado-producto', label: 'Cuidado del producto' }
];
