// Run: node --experimental-strip-types --test scripts/product-insights.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./ts-resolve-hooks.mjs', import.meta.url);
const {
  stockLevel, buildStockMatrix, promotionInfo, healthChecks, seoLengthState, genderLabel, toDate
} = await import('../src/app/core/product-insights.ts');

const NOW = new Date('2026-10-22T15:00:00Z').getTime();
const day = (offset) => new Date(NOW + offset * 24 * 3600 * 1000);

test('stockLevel follows the shop thresholds', () => {
  assert.equal(stockLevel(0), 'out');
  assert.equal(stockLevel(undefined), 'out');
  assert.equal(stockLevel(-3), 'out');
  assert.equal(stockLevel(1), 'low');
  assert.equal(stockLevel(5), 'low');
  assert.equal(stockLevel(6), 'ok');
});

const variant = (colorName, sizeName, stock, extra = {}) => ({ colorName, sizeName, stock, sku: `${colorName}-${sizeName}`, ...extra });

test('matrix: sizes in clothing order, colors in product order, missing combinations are null', () => {
  const matrix = buildStockMatrix({
    price: 40,
    colors: [{ name: 'Negro', code: '#000' }, { name: 'Verde', code: '#0a0', imageUrl: 'g.jpg' }],
    sizes: [{ name: 'XL' }, { name: 'S' }, { name: 'M' }],
    variants: [variant('Negro', 'S', 3), variant('Negro', 'M', 8), variant('Negro', 'XL', 0), variant('Verde', 'M', 1)]
  }, NOW);
  assert.deepEqual(matrix.sizes, ['S', 'M', 'XL']);
  assert.deepEqual(matrix.rows.map(r => r.colorName), ['Negro', 'Verde']);
  assert.equal(matrix.rows[1].cells[0], null, 'Verde / S does not exist');
  assert.equal(matrix.rows[1].cells[1].stock, 1);
  assert.equal(matrix.rows[1].imageUrl, 'g.jpg');
  assert.equal(matrix.rows[0].total, 11);
  assert.equal(matrix.totalUnits, 12);
  assert.equal(matrix.variantCount, 4);
  assert.equal(matrix.outOfStock, 1);
  assert.equal(matrix.lowStock, 2); // Negro/S (3) and Verde/M (1)
  assert.equal(matrix.rows[0].cells[2].level, 'out');
});

test('matrix: the declared `order` wins, numeric sizes ascend, unknown sizes go last', () => {
  const byOrder = buildStockMatrix({
    sizes: [{ name: 'M', order: 2 }, { name: 'S', order: 1 }, { name: 'L', order: 3 }],
    variants: [variant('A', 'L', 1), variant('A', 'M', 1), variant('A', 'S', 1)]
  }, NOW);
  assert.deepEqual(byOrder.sizes, ['S', 'M', 'L']);

  const numeric = buildStockMatrix({
    variants: [variant('A', '42', 1), variant('A', '38', 1), variant('A', 'Única', 1), variant('A', 'M', 1)]
  }, NOW);
  assert.deepEqual(numeric.sizes, ['M', '38', '42', 'Única']);
});

test('matrix: colors and sizes that only exist as variants still appear', () => {
  const matrix = buildStockMatrix({
    colors: [{ name: 'Negro' }],
    sizes: [{ name: 'S' }],
    variants: [variant('Negro', 'S', 2), variant('Rojo', 'M', 4)]
  }, NOW);
  assert.deepEqual(matrix.rows.map(r => r.colorName), ['Negro', 'Rojo']);
  assert.deepEqual(matrix.sizes, ['S', 'M']);
  assert.equal(matrix.rows[1].colorCode, '#cccccc');
});

test('matrix: empty or missing product gives an empty matrix', () => {
  for (const input of [null, undefined, {}, { variants: [] }]) {
    const matrix = buildStockMatrix(input, NOW);
    assert.deepEqual(matrix.sizes, []);
    assert.deepEqual(matrix.rows, []);
    assert.equal(matrix.totalUnits, 0);
  }
});

test('matrix: marks only variants that are on offer while the whole product is not', () => {
  const offer = { originalPrice: 40, discountedPrice: 34, promotionId: 'p1' };
  const matrix = buildStockMatrix({
    price: 40,
    variants: [variant('A', 'S', 2, offer), variant('A', 'M', 2)]
  }, NOW);
  assert.equal(matrix.rows[0].cells[0].onOffer, true);
  assert.equal(matrix.rows[0].cells[1].onOffer, false);

  const wholeProduct = buildStockMatrix({
    price: 40, originalPrice: 40, currentPrice: 34, promotionId: 'p1',
    variants: [variant('A', 'S', 2, offer)]
  }, NOW);
  assert.equal(wholeProduct.rows[0].cells[0].onOffer, false, 'the product-level discount already shows');
});

test('matrix: an expired variant offer is not on offer', () => {
  const expired = { originalPrice: 40, discountedPrice: 34, promotionEndDate: day(-1) };
  const matrix = buildStockMatrix({ price: 40, variants: [variant('A', 'S', 2, expired)] }, NOW);
  assert.equal(matrix.rows[0].cells[0].onOffer, false);
});

test('promotion state: none, active, paused, expired and scheduled', () => {
  const base = { price: 40, originalPrice: 40, currentPrice: 34, promotionId: 'p1' };
  assert.equal(promotionInfo({ price: 40 }, NOW).state, 'none');
  assert.equal(promotionInfo(base, NOW).state, 'active');
  assert.equal(promotionInfo({ ...base, promotionStartDate: day(-5), promotionEndDate: day(5) }, NOW).state, 'active');
  assert.equal(promotionInfo({ ...base, promotionPaused: true }, NOW).state, 'paused');
  assert.equal(promotionInfo({ ...base, promotionEndDate: day(-1) }, NOW).state, 'expired');
  assert.equal(promotionInfo({ ...base, promotionStartDate: day(3) }, NOW).state, 'scheduled');
});

test('promotion window dates come back as Dates, also from Firestore timestamps', () => {
  const info = promotionInfo({
    price: 40, originalPrice: 40, currentPrice: 34, promotionId: 'p1',
    promotionStartDate: { toMillis: () => day(-2).getTime() },
    promotionEndDate: { toDate: () => day(2) }
  }, NOW);
  assert.equal(info.start.getTime(), day(-2).getTime());
  assert.equal(info.end.getTime(), day(2).getTime());
});

test('promotion state: offers only on some variants count as active and list them', () => {
  const info = promotionInfo({
    price: 40,
    variants: [
      variant('Negro', 'S', 2, { originalPrice: 40, discountedPrice: 30 }),
      variant('Negro', 'M', 2)
    ]
  }, NOW);
  assert.equal(info.state, 'active');
  assert.equal(info.variantOffers.length, 1);
  assert.equal(info.variantOffers[0].label, 'Negro / S');
  assert.equal(info.variantOffers[0].price.discountPercentage, 25);
});

const complete = {
  name: 'BOXER', model: 'BX-1', price: 20, categories: ['c1'], imageUrl: 'a.jpg',
  sizes: [{ name: 'S' }], colors: [{ name: 'Negro', imageUrl: 'n.jpg' }],
  metaTitle: 'Boxer', metaDescription: 'Desc', technologies: ['t1'], tags: ['boxer']
};

test('health: a complete product passes every check', () => {
  const health = healthChecks(complete);
  assert.equal(health.total, 12);
  assert.equal(health.passed, 12);
  assert.deepEqual(health.issues, []);
});

test('health: lists what is missing, including colors without an image', () => {
  const health = healthChecks({
    ...complete, imageUrl: '', metaTitle: '  ', tags: [], technologies: [],
    colors: [{ name: 'Negro', imageUrl: 'n.jpg' }, { name: 'Verde' }]
  });
  assert.equal(health.passed, 7);
  assert.ok(health.issues.includes('Falta la imagen principal'));
  assert.ok(health.issues.includes('Falta el título SEO'));
  assert.ok(health.issues.includes('Sin etiquetas'));
  assert.ok(health.issues.includes('Sin tecnologías'));
  assert.ok(health.issues.includes('Colores sin imagen: Verde'));
});

test('health: an empty product fails everything and never mentions costs', () => {
  const health = healthChecks({});
  assert.equal(health.passed, 1, 'only "colors without image" passes when there are no colors');
  assert.ok(health.issues.length >= 10);
  assert.ok(!health.issues.some(i => /costo|distribuidor/i.test(i)));
  assert.equal(healthChecks(null).total, 12);
});

test('health: a legacy product with a single category field counts as categorized', () => {
  assert.ok(!healthChecks({ ...complete, categories: [], category: 'c9' }).issues.includes('Sin categorías'));
});

test('seoLengthState', () => {
  assert.equal(seoLengthState('', 30, 60), 'empty');
  assert.equal(seoLengthState(undefined, 30, 60), 'empty');
  assert.equal(seoLengthState('x'.repeat(10), 30, 60), 'short');
  assert.equal(seoLengthState('x'.repeat(30), 30, 60), 'ok');
  assert.equal(seoLengthState('x'.repeat(60), 30, 60), 'ok');
  assert.equal(seoLengthState('x'.repeat(61), 30, 60), 'long');
});

test('genderLabel and toDate', () => {
  assert.equal(genderLabel('man'), 'Hombre');
  assert.equal(genderLabel('girl'), 'Niña');
  assert.equal(genderLabel(undefined), '—');
  assert.equal(toDate(undefined), null);
  assert.equal(toDate('not a date'), null);
  assert.equal(toDate({ toDate: () => day(1) }).getTime(), day(1).getTime());
});
