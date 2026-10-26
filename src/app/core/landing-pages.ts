/**
 * Landing pages that answer one search ("chompa impermeable"): the text, the products it features and the
 * structured data. Pure functions (no Angular) shared by the page component and the static HTML generated after
 * the build, so a visitor and a crawler read the same thing. Every price, size and color comes from the catalog.
 */
import type { ProductSeoSource } from './product-seo';
import { cleanText, truncateAtWord } from './product-seo';
import { resolveEffectivePrice } from './pricing';
import { FLAT_SHIPPING_USD, RETURN_DAYS, SUPPORT_EMAIL } from './legal';

export interface LandingCandidate {
  product: ProductSeoSource;
  technologyNames: string[];
}

export interface LandingProduct {
  id: string;
  name: string;
  url: string;
  image?: string;
  price: number;
  sizes: string[];
  colors: string[];
  highlights: string[];
}

export interface LandingContent {
  path: string;
  url: string;
  title: string;
  description: string;
  h1: string;
  intro: string[];
  featured: LandingProduct[];
  guide: { heading: string; text: string }[];
  faqs: { question: string; answer: string }[];
  links: { label: string; path: string }[];
  collectionJsonLd: Record<string, unknown>;
  faqJsonLd: Record<string, unknown>;
}

export interface LandingDefinition {
  path: string;
  /** Technology a product must have to be featured. */
  technology: string;
  title: string;
  description: string;
  h1: string;
}

export const WATERPROOF_LANDING: LandingDefinition = {
  path: '/chompas-impermeables',
  technology: 'Impermeable',
  title: 'Chompa Impermeable 15.000 mm para Montaña y Ciclismo | NUMER',
  description: 'Chompa impermeable AGUACERO II de NUMER: 15.000 mm de columna de agua, capucha compatible con casco y ventilación posterior. Envíos a todo Ecuador.',
  h1: 'Chompas impermeables para montaña, ciclismo y ciudad en Ecuador'
};

export const LANDING_PAGES: LandingDefinition[] = [WATERPROOF_LANDING];

export function landingByPath(path: string): LandingDefinition | undefined {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return LANDING_PAGES.find(page => page.path === clean);
}

const plain = (text: string): string =>
  (text ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();

const SIZE_ORDER = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', '2xl', '3xl'];

/** Sizes from smallest to largest; names that are not letter sizes (28, 30...) keep their order after them. */
const sortSizes = (sizes: string[]): string[] => {
  const rank = (size: string): number => {
    const index = SIZE_ORDER.indexOf(size.trim().toLowerCase());
    return index === -1 ? SIZE_ORDER.length : index;
  };
  return sizes.map((size, position) => ({ size, position }))
    .sort((a, b) => rank(a.size) - rank(b.size) || a.position - b.position)
    .map(item => item.size);
};

const money = (value: number): string => `$${value.toFixed(2)}`;

function stockOf(product: ProductSeoSource): number {
  if (typeof product.totalStock === 'number') return product.totalStock;
  return (product.variants ?? []).reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
}

/** Lines of the description that start with a bullet or an icon ("⚡ Capucha ajustable") become the short list. */
export function highlightsOf(description: string | undefined, max = 6): string[] {
  const lines = (description ?? '').split(/\r?\n/);
  const found: string[] = [];
  for (const line of lines) {
    const match = /^\s*(?:⚡|•|-|\*|✔|✅)\s*(.+)$/u.exec(line);
    if (!match) continue;
    const text = cleanText(match[1]);
    if (text && text.length <= 140 && !found.includes(text)) found.push(text);
    if (found.length >= max) break;
  }
  return found;
}

const joinList = (items: string[]): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;

export function buildLanding(def: LandingDefinition, candidates: LandingCandidate[], options: { siteUrl: string; now?: number }): LandingContent {
  const siteUrl = options.siteUrl.replace(/\/$/, '');
  const url = `${siteUrl}${def.path}`;
  const wanted = plain(def.technology);

  const featured: LandingProduct[] = candidates
    .filter(c => stockOf(c.product) > 0 && c.technologyNames.some(t => plain(t) === wanted))
    .map(({ product }) => ({
      id: product.id,
      name: cleanText(product.name),
      url: `${siteUrl}/products/${product.id}`,
      image: product.imageUrl,
      price: resolveEffectivePrice(product, undefined, options.now ?? Date.now()).unitPrice,
      sizes: sortSizes((product.sizes ?? []).map(s => cleanText(s.name)).filter(Boolean)),
      colors: (product.colors ?? []).map(c => cleanText(c.name)).filter(Boolean),
      highlights: highlightsOf(product.description)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const main = featured[0];
  const intro = [
    'NUMER es una marca ecuatoriana de ropa técnica con tienda en Quito. Diseñamos nuestras chompas impermeables para la lluvia fría del páramo, el viento de la cordillera y los días de ciclismo y trekking que empiezan despejados y terminan mojados.',
    main
      ? `Hoy tenemos disponible ${featured.length > 1 ? 'estas chompas' : `la chompa ${main.name}`}${main.sizes.length ? `, en tallas ${main.sizes[0]} a ${main.sizes[main.sizes.length - 1]}` : ''}${main.colors.length ? ` y ${main.colors.length} colores` : ''}, desde ${money(Math.min(...featured.map(f => f.price)))}.`
      : 'Por ahora no tenemos chompas impermeables en stock; las fabricamos por encargo, escríbenos por WhatsApp y coordinamos talla y color.'
  ];

  const guide = [
    { heading: 'Columna de agua', text: 'Se mide en milímetros e indica cuánta presión de agua soporta la tela antes de filtrarse. Para lluvia constante en montaña o ciclismo conviene 10.000 mm o más; una chompa de 15.000 mm resiste aguaceros largos sin empaparse.' },
    { heading: 'Capucha', text: 'Debe ajustarse y cubrir sin tapar la visión. Si usas casco de bicicleta o de escalada, busca una capucha pensada para entrar sobre él.' },
    { heading: 'Cierres y costuras', text: 'Los cierres y las costuras son por donde primero entra el agua. Revisa que estén cubiertos o sellados y que el cierre principal llegue hasta el cuello.' },
    { heading: 'Ventilación', text: 'Una chompa que no deja salir el sudor moja por dentro. La ventilación posterior y una tela transpirable evitan esa condensación cuando subes o pedaleas.' },
    { heading: 'Visibilidad', text: 'Con lluvia y poca luz, los colores vivos y los detalles reflectivos te hacen visible en la carretera o el sendero.' },
    { heading: 'Cuidado', text: 'Lava con agua fría y detergente para tela técnica, sin suavizante, y seca al aire sin sol directo. Cuando el agua deje de formar gotas sobre la tela, se renueva el tratamiento repelente (DWR). Más detalles en la guía de cuidado.' }
  ];

  const faqs: { question: string; answer: string }[] = [];
  if (main) {
    const prices = featured.map(f => f.price);
    const from = Math.min(...prices);
    faqs.push({
      question: '¿Cuánto cuesta una chompa impermeable NUMER?',
      answer: `${featured.length > 1 ? `Nuestras chompas impermeables parten desde ${money(from)}` : `La chompa ${main.name} cuesta ${money(main.price)}`}, con envío a todo Ecuador. El precio final se confirma en la página del producto.`
    });
    faqs.push({
      question: '¿Qué tallas y colores hay disponibles?',
      answer: `${main.name} está disponible${main.sizes.length ? ` en tallas ${joinList(main.sizes)}` : ''}${main.colors.length ? ` y en los colores ${joinList(main.colors)}` : ''}. La disponibilidad por talla y color se ve al elegir el producto.`
    });
  }
  faqs.push(
    {
      question: '¿Cuánto tarda el envío?',
      answer: `Enviamos a todo Ecuador. En Quito y ciudades principales llega en 2 a 3 días hábiles y al resto del país en 3 a 5 días hábiles. El envío cuesta ${money(FLAT_SHIPPING_USD)}.`
    },
    {
      question: '¿Puedo devolver o cambiar mi chompa?',
      answer: `Tienes ${RETURN_DAYS} días para solicitar una devolución, siempre que la prenda esté sin usar, sin lavar y con sus etiquetas y empaque. El envío de retorno corre por tu cuenta, salvo que el producto tenga un defecto o el error sea nuestro. El reembolso se hace por el mismo medio de pago. Para iniciarla escríbenos por WhatsApp o a ${SUPPORT_EMAIL} con tu número de pedido.`
    },
    {
      question: '¿Tiene garantía?',
      answer: 'Sí, 1 año contra defectos de fabricación: materiales, costuras, cierres y componentes estructurales con uso normal. No cubre accidentes, mal uso, desgaste normal ni productos modificados. Para reclamarla escríbenos con tu número de pedido y fotos; evaluamos el caso en 5 a 7 días hábiles y, si procede, reparamos o reemplazamos la prenda. Si la garantía aplica, NUMER cubre el envío de ida y vuelta.'
    },
    {
      question: '¿Cómo cuido una chompa impermeable?',
      answer: 'Lávala a mano o en ciclo suave con agua fría y detergente para tela técnica, sin suavizante, y sécala al aire sin sol directo. Si el agua ya no forma gotas sobre la tela, es momento de renovar el repelente DWR.'
    }
  );

  const links = [
    { label: 'Ver toda la tienda', path: '/shop' },
    { label: 'Cuidado del producto y garantía', path: '/cuidado-producto' },
    { label: 'Envíos y devoluciones', path: '/servicio-cliente' }
  ];

  const description = truncateAtWord(def.description, 155);

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#page`,
    url,
    name: def.h1,
    description,
    inLanguage: 'es-EC',
    isPartOf: { '@type': 'WebSite', name: 'NUMER', url: siteUrl },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: featured.map((f, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: f.url,
        name: f.name
      }))
    }
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer }
    }))
  };

  return { path: def.path, url, title: def.title, description, h1: def.h1, intro, featured, guide, faqs, links, collectionJsonLd, faqJsonLd };
}
