/**
 * Everything a search engine (or an AI assistant that reads the page) needs about a product: title, description,
 * keywords, canonical url, breadcrumb and schema.org Product data. Pure functions (no Angular) so they are tested.
 *
 * Rules that matter:
 *  - what the admin writes in "Para Google" (metaTitle / metaDescription) wins over the generated text;
 *  - the structured data only states facts that are true and visible: the real effective price, the real stock,
 *    real shipping terms. Ratings are NOT included, because the shop has no per-product reviews to back them.
 */
import type { PriceSource } from './pricing';
import { resolveEffectivePrice } from './pricing';

export interface ProductSeoSource extends PriceSource {
  id: string;
  name: string;
  model?: string;
  sku?: string;
  barcode?: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  imageUrl?: string;
  additionalImages?: string[];
  colors?: { name: string; imageUrl?: string }[];
  sizes?: { name: string }[];
  gender?: string;
  tags?: string[];
  searchKeywords?: string[];
  features?: string[];
  totalStock?: number;
  variants?: { stock?: number }[];
}

export interface ProductSeoOptions {
  siteUrl: string;
  /** Readable category names, main one first. */
  categoryNames?: string[];
  categoryId?: string | null;
  /** Readable technology names. */
  technologyNames?: string[];
  now?: number;
}

export interface ProductSeo {
  title: string;
  description: string;
  keywords: string;
  image?: string;
  url: string;
  price: number;
  currency: 'USD';
  availability: 'InStock' | 'OutOfStock';
  category?: string;
  sku?: string;
  breadcrumb: { name: string; url: string }[];
  jsonLd: Record<string, unknown>;
}

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
const TITLE_SUFFIX = ' | NUMER Ecuador';

// ───────────────────────── Text helpers ─────────────────────────

/** Plain text: no emojis, markdown marks or line breaks. */
export function cleanText(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/[*_#>`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cuts at a word boundary (never in the middle of a word) and marks the cut. */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s,;:.\-–]+$/, '') + '…';
}

function uniqueCaseInsensitive(values: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = (value ?? '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

// ───────────────────────── Title, description, keywords ─────────────────────────

export function buildTitle(product: ProductSeoSource, categoryName?: string): string {
  const custom = cleanText(product.metaTitle);
  if (custom) return custom;
  const name = cleanText(product.name);
  const withCategory = categoryName ? `${name} - ${categoryName}${TITLE_SUFFIX}` : '';
  if (withCategory && withCategory.length <= TITLE_MAX) return withCategory;
  const plain = `${name}${TITLE_SUFFIX}`;
  if (plain.length <= TITLE_MAX) return plain;
  return truncateAtWord(name, TITLE_MAX - TITLE_SUFFIX.length) + TITLE_SUFFIX;
}

export function buildDescription(product: ProductSeoSource, technologyNames: string[] = []): string {
  const custom = cleanText(product.metaDescription);
  if (custom) return custom;

  const body = cleanText(product.description);
  const tail = ' Envíos a todo Ecuador.';
  if (body) return truncateAtWord(body, DESCRIPTION_MAX - tail.length) + tail;

  const name = cleanText(product.name);
  const features = technologyNames.slice(0, 3).join(', ');
  const base = features
    ? `${name}: ropa técnica outdoor con ${features.toLowerCase()}.`
    : `${name}: ropa técnica NUMER para deportes outdoor.`;
  return truncateAtWord(base + tail, DESCRIPTION_MAX);
}

export function buildKeywords(product: ProductSeoSource, categoryNames: string[] = [], technologyNames: string[] = []): string {
  return uniqueCaseInsensitive([
    cleanText(product.name),
    ...categoryNames,
    ...technologyNames,
    ...(product.tags ?? []),
    ...(product.searchKeywords ?? []),
    'ropa técnica outdoor',
    'NUMER Ecuador'
  ]).slice(0, 18).join(', ');
}

// ───────────────────────── Structured data ─────────────────────────

/** Barcode as the schema.org property that matches its length, or null when it is not a valid GTIN length. */
export function gtinProperty(barcode: string | null | undefined): { key: string; value: string } | null {
  const digits = (barcode ?? '').replace(/\s|-/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const key = ({ 8: 'gtin8', 12: 'gtin12', 13: 'gtin13', 14: 'gtin14' } as Record<number, string>)[digits.length];
  return key ? { key, value: digits } : null;
}

const SUGGESTED_GENDER: Record<string, string> = { man: 'male', boy: 'male', woman: 'female', girl: 'female', unisex: 'unisex' };

function toIsoDate(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const v = value as { toDate?: () => Date; toMillis?: () => number };
  const date = typeof v.toDate === 'function' ? v.toDate()
    : typeof v.toMillis === 'function' ? new Date(v.toMillis())
      : new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Drops null, undefined, empty strings and empty arrays/objects so the JSON-LD only carries real values. */
export function omitEmpty<T>(value: T): T {
  const isEmpty = (v: unknown): boolean =>
    v === null || v === undefined || v === ''
    || (Array.isArray(v) && v.length === 0)
    || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);

  if (Array.isArray(value)) {
    return value.map(omitEmpty).filter(v => !isEmpty(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = omitEmpty(v);
      if (!isEmpty(cleaned)) out[key] = cleaned;
    }
    return out as T;
  }
  return value;
}

function stockOf(product: ProductSeoSource): number {
  if (typeof product.totalStock === 'number') return product.totalStock;
  return (product.variants ?? []).reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
}

export function buildProductSeo(product: ProductSeoSource, options: ProductSeoOptions): ProductSeo {
  const siteUrl = options.siteUrl.replace(/\/$/, '');
  const categoryNames = options.categoryNames ?? [];
  const technologyNames = options.technologyNames ?? [];
  const url = `${siteUrl}/products/${product.id}`;
  const price = resolveEffectivePrice(product, undefined, options.now ?? Date.now());
  const availability = stockOf(product) > 0 ? 'InStock' : 'OutOfStock';
  const name = cleanText(product.name);

  const title = buildTitle(product, categoryNames[0]);
  const description = buildDescription(product, technologyNames);
  const keywords = buildKeywords(product, categoryNames, technologyNames);

  const images = uniqueCaseInsensitive([
    product.imageUrl,
    ...(product.additionalImages ?? []),
    ...(product.colors ?? []).map(c => c.imageUrl)
  ]).filter(u => /^https?:\/\//i.test(u)).slice(0, 8);

  const gtin = gtinProperty(product.barcode);
  const validUntil = price.hasDiscount ? toIsoDate(product.promotionEndDate) : null;
  const fullDescription = truncateAtWord(cleanText(product.description), 900) || description;

  const breadcrumb = [
    { name: 'Inicio', url: siteUrl },
    { name: 'Tienda', url: `${siteUrl}/shop` },
    ...(categoryNames[0]
      ? [{ name: categoryNames[0], url: options.categoryId ? `${siteUrl}/shop?category=${options.categoryId}` : `${siteUrl}/shop` }]
      : []),
    { name, url }
  ];

  const jsonLd = omitEmpty({
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    url,
    name,
    description: fullDescription,
    image: images,
    sku: product.sku,
    mpn: product.model,
    ...(gtin ? { [gtin.key]: gtin.value } : {}),
    brand: { '@type': 'Brand', name: 'NUMER' },
    category: categoryNames[0],
    color: (product.colors ?? []).map(c => cleanText(c.name)).filter(Boolean).join(', '),
    size: (product.sizes ?? []).map(s => cleanText(s.name)).filter(Boolean).join(', '),
    audience: SUGGESTED_GENDER[product.gender ?? '']
      ? { '@type': 'PeopleAudience', suggestedGender: SUGGESTED_GENDER[product.gender ?? ''] }
      : undefined,
    additionalProperty: technologyNames.map(value => ({ '@type': 'PropertyValue', name: 'Tecnología', value })),
    offers: {
      '@type': 'Offer',
      url,
      price: price.unitPrice.toFixed(2),
      priceCurrency: 'USD',
      priceValidUntil: validUntil,
      availability: `https://schema.org/${availability}`,
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'NUMER', url: siteUrl },
      // The flat rate and delivery times the shop really applies (see the confirmation email and the checkout)
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: { '@type': 'MonetaryAmount', value: '5.00', currency: 'USD' },
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'EC' },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 5, unitCode: 'DAY' }
        }
      }
    }
  });

  return {
    title, description, keywords,
    image: images[0],
    url,
    price: price.unitPrice,
    currency: 'USD',
    availability,
    category: categoryNames[0],
    sku: product.sku,
    breadcrumb,
    jsonLd
  };
}

/** schema.org BreadcrumbList for a list of crumbs. */
export function buildBreadcrumbJsonLd(crumbs: { name: string; url: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url
    }))
  };
}
