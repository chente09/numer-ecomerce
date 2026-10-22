/**
 * What the admin product detail shows, computed from a saved product. Pure functions (no Angular) so they can be
 * unit tested. Prices come from `resolveEffectivePrice`, the same rule the shop and the server use, so the admin
 * never shows a discount the customer does not get.
 */
import type { EffectivePrice, PriceSource } from './pricing';
import { resolveEffectivePrice } from './pricing';

/** Same thresholds as the shop: 0 is "Sin stock", up to 5 is "Últimas unidades". */
export const LOW_STOCK_LIMIT = 5;

export type StockLevel = 'out' | 'low' | 'ok';

export function stockLevel(stock: number | null | undefined): StockLevel {
  const n = Number(stock) || 0;
  if (n <= 0) return 'out';
  return n <= LOW_STOCK_LIMIT ? 'low' : 'ok';
}

export interface InsightVariant extends PriceSource {
  colorName?: string;
  colorCode?: string;
  sizeName?: string;
  stock?: number;
  sku?: string;
  imageUrl?: string;
}

export interface InsightProduct extends PriceSource {
  id?: string;
  name?: string;
  model?: string;
  imageUrl?: string;
  additionalImages?: string[];
  category?: string;
  categories?: string[];
  colors?: { name: string; code?: string; imageUrl?: string }[];
  sizes?: { name: string; order?: number }[];
  variants?: InsightVariant[];
  technologies?: string[];
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  totalStock?: number;
}

// ───────────────────────── Stock matrix (color x size) ─────────────────────────

export interface MatrixCell {
  stock: number;
  level: StockLevel;
  sku: string;
  /** The variant is sold below its regular price right now. */
  onOffer: boolean;
}

export interface MatrixRow {
  colorName: string;
  colorCode: string;
  imageUrl: string | null;
  cells: (MatrixCell | null)[];
  total: number;
}

export interface StockMatrix {
  sizes: string[];
  rows: MatrixRow[];
  totalUnits: number;
  variantCount: number;
  outOfStock: number;
  lowStock: number;
}

const SIZE_SEQUENCE = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', 'XXXXL', '4XL'];

/** Letter sizes in clothing order, numeric sizes ascending, anything else alphabetically at the end. */
function sizeRank(name: string): [number, number, string] {
  const upper = name.trim().toUpperCase();
  const letter = SIZE_SEQUENCE.indexOf(upper);
  if (letter >= 0) return [0, letter, upper];
  const numeric = parseFloat(upper.replace(',', '.'));
  if (!Number.isNaN(numeric)) return [1, numeric, upper];
  return [2, 0, upper];
}

function compareSizes(a: string, b: string): number {
  const ra = sizeRank(a);
  const rb = sizeRank(b);
  return ra[0] - rb[0] || ra[1] - rb[1] || ra[2].localeCompare(rb[2]);
}

export function buildStockMatrix(product: InsightProduct | null | undefined, now: number = Date.now()): StockMatrix {
  const variants = (product?.variants ?? []).filter(v => v && v.colorName && v.sizeName);

  // Sizes: those the product declares (honoring `order` when set), then any a variant uses that it does not list
  const declared = [...(product?.sizes ?? [])]
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || compareSizes(a.name, b.name))
    .map(s => s.name);
  const extra = [...new Set(variants.map(v => v.sizeName as string))]
    .filter(name => !declared.includes(name))
    .sort(compareSizes);
  const sizes = [...declared, ...extra].filter(name => variants.some(v => v.sizeName === name));

  // Colors in the order of the product, then any that only exist as a variant
  const declaredColors = (product?.colors ?? []).map(c => c.name);
  const colorNames = [...new Set([...declaredColors, ...variants.map(v => v.colorName as string)])]
    .filter(name => variants.some(v => v.colorName === name));

  const rows: MatrixRow[] = colorNames.map(colorName => {
    const own = variants.filter(v => v.colorName === colorName);
    const color = (product?.colors ?? []).find(c => c.name === colorName);
    const cells = sizes.map(size => {
      const variant = own.find(v => v.sizeName === size);
      if (!variant) return null;
      const stock = Math.max(0, Number(variant.stock) || 0);
      return {
        stock,
        level: stockLevel(stock),
        sku: variant.sku || '',
        onOffer: resolveEffectivePrice(product, variant, now).hasDiscount
          && !resolveEffectivePrice(product, undefined, now).hasDiscount
      } as MatrixCell;
    });
    return {
      colorName,
      colorCode: color?.code || own[0]?.colorCode || '#cccccc',
      imageUrl: color?.imageUrl || own.find(v => v.imageUrl)?.imageUrl || null,
      cells,
      total: cells.reduce((sum, cell) => sum + (cell ? cell.stock : 0), 0)
    };
  });

  const all = rows.flatMap(r => r.cells).filter((c): c is MatrixCell => c !== null);
  return {
    sizes,
    rows,
    totalUnits: all.reduce((sum, c) => sum + c.stock, 0),
    variantCount: all.length,
    outOfStock: all.filter(c => c.level === 'out').length,
    lowStock: all.filter(c => c.level === 'low').length
  };
}

// ───────────────────────── Price and promotion ─────────────────────────

export type PromotionState = 'none' | 'active' | 'scheduled' | 'expired' | 'paused';

export interface PromotionInfo {
  state: PromotionState;
  start: Date | null;
  end: Date | null;
  /** Variants sold below the regular price while the product as a whole is not. */
  variantOffers: { label: string; price: EffectivePrice }[];
}

function toMillis(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const v = value as { toMillis?: () => number; toDate?: () => Date };
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  const ms = new Date(value as string | number | Date).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function toDate(value: unknown): Date | null {
  const ms = toMillis(value);
  return ms === null ? null : new Date(ms);
}

export function promotionInfo(product: InsightProduct | null | undefined, now: number = Date.now()): PromotionInfo {
  const p = product ?? {};
  const start = toMillis(p.promotionStartDate);
  const end = toMillis(p.promotionEndDate);
  const stored = (typeof p.currentPrice === 'number' && typeof p.originalPrice === 'number' && p.currentPrice < p.originalPrice)
    || !!p.promotionId;

  const wholeProduct = resolveEffectivePrice(p, undefined, now).hasDiscount;
  const variantOffers = wholeProduct ? [] : (p.variants ?? [])
    .map(v => ({ v, price: resolveEffectivePrice(p, v, now) }))
    .filter(x => x.price.hasDiscount)
    .map(x => ({ label: [x.v.colorName, x.v.sizeName].filter(Boolean).join(' / '), price: x.price }));

  let state: PromotionState = 'none';
  if (stored) {
    if (p.promotionPaused === true) state = 'paused';
    else if (end !== null && now > end) state = 'expired';
    else if (start !== null && now < start) state = 'scheduled';
    else state = wholeProduct ? 'active' : 'none';
  }
  if (state === 'none' && variantOffers.length > 0) state = 'active';

  return { state, start: start === null ? null : new Date(start), end: end === null ? null : new Date(end), variantOffers };
}

// ───────────────────────── Health and SEO ─────────────────────────

export interface HealthResult {
  passed: number;
  total: number;
  issues: string[];
}

/** Checks the data the shop needs to present and find a product. Cost data is deliberately not part of it. */
export function healthChecks(product: InsightProduct | null | undefined): HealthResult {
  const p = product ?? {};
  const colorsWithoutImage = (p.colors ?? []).filter(c => !c.imageUrl).map(c => c.name);
  const hasSizes = (p.sizes ?? []).length > 0 || (p.variants ?? []).some(v => v.sizeName);
  const hasColors = (p.colors ?? []).length > 0 || (p.variants ?? []).some(v => v.colorName);
  const checks: [boolean, string][] = [
    [!!p.name?.trim(), 'Falta el nombre'],
    [!!p.model?.trim(), 'Falta el modelo'],
    [Number(p.price) > 0, 'Falta el precio'],
    [(p.categories ?? []).length > 0 || !!p.category, 'Sin categorías'],
    [!!p.imageUrl, 'Falta la imagen principal'],
    [hasSizes, 'Sin tallas'],
    [hasColors, 'Sin colores'],
    [colorsWithoutImage.length === 0, `Colores sin imagen: ${colorsWithoutImage.join(', ')}`],
    [!!p.metaTitle?.trim(), 'Falta el título SEO'],
    [!!p.metaDescription?.trim(), 'Falta la descripción SEO'],
    [(p.technologies ?? []).length > 0, 'Sin tecnologías'],
    [(p.tags ?? []).filter(t => t && t.trim()).length > 0, 'Sin etiquetas']
  ];
  return {
    passed: checks.filter(([ok]) => ok).length,
    total: checks.length,
    issues: checks.filter(([ok]) => !ok).map(([, message]) => message)
  };
}

export type SeoState = 'empty' | 'short' | 'ok' | 'long';

/** Search engines cut titles around 60 characters and descriptions around 160. */
export function seoLengthState(text: string | null | undefined, min: number, max: number): SeoState {
  const length = (text ?? '').trim().length;
  if (length === 0) return 'empty';
  if (length < min) return 'short';
  return length > max ? 'long' : 'ok';
}

export const SEO_TITLE_RANGE: [number, number] = [30, 60];
export const SEO_DESCRIPTION_RANGE: [number, number] = [70, 160];

const GENDER_LABELS: Record<string, string> = {
  man: 'Hombre',
  woman: 'Mujer',
  boy: 'Niño',
  girl: 'Niña',
  unisex: 'Unisex'
};

export function genderLabel(gender: string | null | undefined): string {
  return GENDER_LABELS[gender ?? ''] ?? '—';
}
