/**
 * Single source of truth for the price a customer sees and pays.
 *
 * The rules mirror `resolvePricing` in the payments backend (PayphoneBackenNetlify/netlify/functions/payphone.js),
 * so what the shop displays is always what the server charges:
 *   1. variant with discountedPrice < originalPrice  -> variant discount
 *   2. product with currentPrice < originalPrice     -> product discount
 *   3. otherwise                                     -> variant.price ?? product.price
 * Without a variant only rules 2 and 3 apply (product-level display).
 */
export interface PriceSource {
  price?: number;
  originalPrice?: number;
  currentPrice?: number;
  discountedPrice?: number;
  promotionId?: string;
  /** Validity window of the stored discount (Firestore Timestamp, Date or ISO string). Missing = no bound. */
  promotionStartDate?: unknown;
  promotionEndDate?: unknown;
  /** Promotion switched off in the admin: the discount stays stored but does not apply. */
  promotionPaused?: boolean;
}

export interface EffectivePrice {
  unitPrice: number;
  /** Price before the discount (equals unitPrice when there is no discount). */
  originalUnitPrice: number;
  hasDiscount: boolean;
  discountPercentage: number;
  savings: number;
  promotionId: string | null;
}

const isPositive = (n: unknown): n is number => typeof n === 'number' && n > 0;

function toMillis(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const v = value as { toMillis?: () => number; toDate?: () => Date };
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  const ms = new Date(value as string | number | Date).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** A stored discount only applies inside its validity window (no window = always, legacy data). */
function isInsideWindow(source: PriceSource, now: number): boolean {
  if (source.promotionPaused === true) return false;
  const start = toMillis(source.promotionStartDate);
  const end = toMillis(source.promotionEndDate);
  if (start !== null && now < start) return false;
  if (end !== null && now > end) return false;
  return true;
}

export function resolveEffectivePrice(
  product: PriceSource | null | undefined,
  variant?: PriceSource | null,
  now: number = Date.now()
): EffectivePrice {
  const p = product ?? {};

  if (variant && isPositive(variant.discountedPrice) && isPositive(variant.originalPrice)
    && variant.discountedPrice < variant.originalPrice && isInsideWindow(variant, now)) {
    return build(variant.discountedPrice, variant.originalPrice, variant.promotionId);
  }

  if (isPositive(p.currentPrice) && isPositive(p.originalPrice) && p.currentPrice < p.originalPrice
    && isInsideWindow(p, now)) {
    return build(p.currentPrice, p.originalPrice, p.promotionId);
  }

  const base = variant && variant.price !== undefined && variant.price !== null ? variant.price : (p.price ?? 0);
  return build(base, base, undefined);
}

function build(unitPrice: number, originalUnitPrice: number, promotionId?: string): EffectivePrice {
  const savings = Math.max(0, originalUnitPrice - unitPrice);
  const hasDiscount = savings > 0;
  return {
    unitPrice,
    originalUnitPrice,
    hasDiscount,
    discountPercentage: hasDiscount ? Math.round((savings / originalUnitPrice) * 100) : 0,
    savings,
    promotionId: hasDiscount ? (promotionId || null) : null
  };
}

/** True when the product, or any of its variants, is currently sold below its regular price. */
export function hasEffectiveDiscount(
  product: (PriceSource & { variants?: PriceSource[] }) | null | undefined
): boolean {
  if (!product) return false;
  if (resolveEffectivePrice(product).hasDiscount) return true;
  return (product.variants ?? []).some(v => resolveEffectivePrice(product, v).hasDiscount);
}

/** Largest discount percentage across the product and its variants (0 when none). */
export function maxEffectiveDiscountPercentage(
  product: (PriceSource & { variants?: PriceSource[] }) | null | undefined
): number {
  if (!product) return 0;
  const own = resolveEffectivePrice(product).discountPercentage;
  const variants = (product.variants ?? []).map(v => resolveEffectivePrice(product, v).discountPercentage);
  return Math.max(own, ...variants, 0);
}
