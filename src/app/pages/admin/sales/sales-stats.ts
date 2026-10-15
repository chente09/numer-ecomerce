import type { Order } from '../../../models/models';

/** Ecuador has no DST: UTC-5 all year. Days are grouped in that zone so a late sale lands on the right date. */
const ECUADOR_OFFSET_MS = -5 * 60 * 60 * 1000;

export interface DateRange {
  /** Inclusive start (ms) */
  from: number;
  /** Exclusive end (ms) */
  to: number;
}

export interface DayBucket { key: string; label: string; revenue: number; orders: number; }
export interface ProductRow { name: string; units: number; revenue: number; promoUnits: number; }
export interface CouponRow { code: string; uses: number; discount: number; revenue: number; }
export interface PromotionRow { name: string; units: number; savings: number; }
export interface StatusRow { status: string; label: string; count: number; }

export interface SalesSummary {
  revenue: number;
  orders: number;
  averageTicket: number;
  tax: number;
  shipping: number;
  /** Product promotions + coupons given away */
  savings: number;
  couponDiscount: number;
  productSavings: number;
  cancelledOrders: number;
  cancelledAmount: number;
  byDay: DayBucket[];
  topProducts: ProductRow[];
  coupons: CouponRow[];
  promotions: PromotionRow[];
  byStatus: StatusRow[];
}

const STATUS_LABELS: Record<string, string> = {
  processing: 'En proceso (por despachar)',
  shipped: 'Enviado',
  delivered: 'Entregado',
  completed: 'Completado',
  cancelled: 'Cancelado',
  pending_payment: 'Pendiente de pago'
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v) || 0;

export function orderTimeMs(order: Order): number {
  const created: any = order.createdAt;
  if (!created) return 0;
  if (typeof created.toMillis === 'function') return created.toMillis();
  if (typeof created.seconds === 'number') return created.seconds * 1000;
  const parsed = new Date(created).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** yyyy-mm-dd of the Ecuador calendar day that contains the instant */
export function dayKey(ms: number): string {
  return new Date(ms + ECUADOR_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start (ms) of the Ecuador calendar day that contains the instant */
export function startOfDay(ms: number): number {
  const local = new Date(ms + ECUADOR_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return local.getTime() - ECUADOR_OFFSET_MS;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildRange(preset: 'today' | '7d' | '30d' | 'month' | 'custom', now: number,
  customFrom?: string, customTo?: string): DateRange {
  const today = startOfDay(now);
  switch (preset) {
    case 'today': return { from: today, to: today + DAY_MS };
    case '7d': return { from: today - 6 * DAY_MS, to: today + DAY_MS };
    case '30d': return { from: today - 29 * DAY_MS, to: today + DAY_MS };
    case 'month': {
      const local = new Date(now + ECUADOR_OFFSET_MS);
      const first = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - ECUADOR_OFFSET_MS;
      return { from: first, to: today + DAY_MS };
    }
    default: {
      const from = customFrom ? Date.parse(customFrom + 'T00:00:00Z') - ECUADOR_OFFSET_MS : today - 6 * DAY_MS;
      const to = customTo ? Date.parse(customTo + 'T00:00:00Z') - ECUADOR_OFFSET_MS + DAY_MS : today + DAY_MS;
      return to > from ? { from, to } : { from: today - 6 * DAY_MS, to: today + DAY_MS };
    }
  }
}

/** Same length, immediately before */
export function previousRange(range: DateRange): DateRange {
  const length = range.to - range.from;
  return { from: range.from - length, to: range.from };
}

/**
 * Sales summary for the orders created inside the range. Only customer orders paid through Payphone are
 * expected here (the service already drops distributor orders); old orders without promotion/coupon
 * fields simply count as zero savings. Cancelled orders are reported apart and excluded from revenue.
 */
export function summarize(orders: Order[], range: DateRange): SalesSummary {
  const inRange = orders.filter(o => {
    const t = orderTimeMs(o);
    return t >= range.from && t < range.to;
  });
  const valid = inRange.filter(o => o.status !== 'cancelled' && o.status !== 'pending_payment');
  const cancelled = inRange.filter(o => o.status === 'cancelled');

  // Every day of the range, even with no sales, so the chart does not skip dates
  const days = new Map<string, DayBucket>();
  for (let t = range.from; t < range.to; t += DAY_MS) {
    const key = dayKey(t + 1);
    days.set(key, { key, label: key.slice(5).replace('-', '/'), revenue: 0, orders: 0 });
  }

  const products = new Map<string, ProductRow>();
  const coupons = new Map<string, CouponRow>();
  const promotions = new Map<string, PromotionRow>();
  const statuses = new Map<string, StatusRow>();

  let revenue = 0, tax = 0, shipping = 0, couponDiscount = 0, productSavings = 0;

  for (const order of valid) {
    const total = num(order.total);
    revenue += total;
    tax += num(order.tax);
    shipping += num(order.shipping);
    couponDiscount += num(order.discountAmount);
    productSavings += num(order.productSavings);

    const bucket = days.get(dayKey(orderTimeMs(order)));
    if (bucket) { bucket.revenue += total; bucket.orders += 1; }

    const status = String(order.status);
    const row = statuses.get(status) || { status, label: STATUS_LABELS[status] || status, count: 0 };
    row.count += 1;
    statuses.set(status, row);

    const code = order.coupon?.code;
    if (code) {
      const c = coupons.get(code) || { code, uses: 0, discount: 0, revenue: 0 };
      c.uses += 1;
      c.discount += num(order.discountAmount);
      c.revenue += total;
      coupons.set(code, c);
    }

    for (const item of order.items || []) {
      const name = item.productName || 'Producto';
      const units = num(item.quantity);
      const lineTotal = num(item.totalPrice) || num(item.unitPrice) * units;
      const hasPromo = item.regularUnitPrice != null && num(item.regularUnitPrice) > num(item.unitPrice);

      const p = products.get(name) || { name, units: 0, revenue: 0, promoUnits: 0 };
      p.units += units;
      p.revenue += lineTotal;
      if (hasPromo) p.promoUnits += units;
      products.set(name, p);

      if (hasPromo) {
        const promoName = item.promotionName || 'Promoción sin nombre';
        const pr = promotions.get(promoName) || { name: promoName, units: 0, savings: 0 };
        pr.units += units;
        pr.savings += (num(item.regularUnitPrice) - num(item.unitPrice)) * units;
        promotions.set(promoName, pr);
      }
    }
  }

  const byRevenue = <T extends { revenue: number }>(a: T, b: T) => b.revenue - a.revenue;

  return {
    revenue: round2(revenue),
    orders: valid.length,
    averageTicket: valid.length ? round2(revenue / valid.length) : 0,
    tax: round2(tax),
    shipping: round2(shipping),
    savings: round2(couponDiscount + productSavings),
    couponDiscount: round2(couponDiscount),
    productSavings: round2(productSavings),
    cancelledOrders: cancelled.length,
    cancelledAmount: round2(cancelled.reduce((s, o) => s + num(o.total), 0)),
    byDay: Array.from(days.values()).map(d => ({ ...d, revenue: round2(d.revenue) })),
    topProducts: Array.from(products.values()).map(p => ({ ...p, revenue: round2(p.revenue) })).sort(byRevenue).slice(0, 10),
    coupons: Array.from(coupons.values()).map(c => ({ ...c, discount: round2(c.discount), revenue: round2(c.revenue) })).sort((a, b) => b.uses - a.uses),
    promotions: Array.from(promotions.values()).map(p => ({ ...p, savings: round2(p.savings) })).sort((a, b) => b.savings - a.savings),
    byStatus: Array.from(statuses.values()).sort((a, b) => (a.status === 'processing' ? -1 : b.status === 'processing' ? 1 : b.count - a.count))
  };
}

/** Percentage change vs the previous period; null when there is nothing to compare against */
export function changePercent(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
