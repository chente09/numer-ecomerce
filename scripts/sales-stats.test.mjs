import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, buildRange, previousRange, dayKey, changePercent } from '../src/app/pages/admin/sales/sales-stats.ts';

// 2026-10-15 16:11 Ecuador = 21:11 UTC
const T = Date.UTC(2026, 9, 15, 21, 11);
const ts = (ms) => ({ toMillis: () => ms });
const order = (over) => ({ status: 'processing', total: 0, createdAt: ts(T), items: [], ...over });

test('ranges use the Ecuador day and the previous range has the same length', () => {
  const today = buildRange('today', T);
  assert.equal(today.to - today.from, 86400000);
  assert.equal(dayKey(today.from + 1), '2026-10-15');
  const week = buildRange('7d', T);
  const prev = previousRange(week);
  assert.equal(prev.to, week.from);
  assert.equal(prev.to - prev.from, week.to - week.from);
});

test('a sale at 23:30 Ecuador stays on that day even though UTC is already the next day', () => {
  const late = Date.UTC(2026, 9, 16, 4, 30); // 23:30 del 15 en Ecuador
  assert.equal(dayKey(late), '2026-10-15');
});

test('summary matches real purchases: promo + coupon, free shipping, cancelled excluded', () => {
  const orders = [
    order({ total: 24.42, subtotal: 18.77, productSavings: 2.09, discountAmount: 1.88, tax: 2.53, shipping: 5,
      coupon: { code: 'SOYEL1RO' },
      items: [{ productName: 'BOXER HOMBRE', quantity: 1, unitPrice: 18.77, totalPrice: 18.77, regularUnitPrice: 20.86, promotionName: 'PRUEBA PROMO' }] }),
    order({ total: 62.57, discountAmount: 12.52, tax: 7.51, shipping: 5, coupon: { code: 'NUEVP25' },
      items: [{ productName: 'BOXER HOMBRE', quantity: 3, unitPrice: 20.86, totalPrice: 62.58 }] }),
    order({ total: 99, status: 'cancelled' }),
  ];
  const s = summarize(orders, buildRange('today', T));
  assert.equal(s.orders, 2);
  assert.equal(s.revenue, 86.99);
  assert.equal(s.averageTicket, 43.5);
  assert.equal(s.tax, 10.04);
  assert.equal(s.shipping, 10);
  assert.equal(s.productSavings, 2.09);
  assert.equal(s.couponDiscount, 14.4);
  assert.equal(s.savings, 16.49);
  assert.equal(s.cancelledOrders, 1);
  assert.equal(s.cancelledAmount, 99);
  assert.deepEqual(s.topProducts[0], { name: 'BOXER HOMBRE', units: 4, revenue: 81.35, promoUnits: 1 });
  assert.equal(s.coupons.length, 2);
  assert.deepEqual(s.promotions, [{ name: 'PRUEBA PROMO', units: 1, savings: 2.09 }]);
  assert.equal(s.byStatus[0].status, 'processing');
});

test('orders outside the range and old orders without new fields do not break it', () => {
  const old = order({ total: 10, createdAt: ts(T - 90 * 86400000), items: [{ productName: 'X', quantity: 1 }] });
  const legacy = order({ total: 30, items: [{ productName: 'Y', quantity: 2, unitPrice: 15 }] });
  const s = summarize([old, legacy], buildRange('30d', T));
  assert.equal(s.orders, 1);
  assert.equal(s.revenue, 30);
  assert.equal(s.savings, 0);
  assert.equal(s.topProducts[0].revenue, 30);
  assert.equal(s.byDay.length, 30);
});

test('percentage change handles an empty previous period', () => {
  assert.equal(changePercent(50, 0), null);
  assert.equal(changePercent(150, 100), 50);
  assert.equal(changePercent(50, 100), -50);
});
