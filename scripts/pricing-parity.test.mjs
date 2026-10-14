// Parity test: the shop's resolveEffectivePrice must charge-match the backend's resolvePricing.
// Run: node --experimental-strip-types --test scripts/pricing-parity.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveEffectivePrice, hasEffectiveDiscount } from '../src/app/core/pricing.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendFile = path.resolve(here, '../../PayphoneBackenNetlify/netlify/functions/payphone.js');
const src = readFileSync(backendFile, 'utf8');
const match = src.match(/function resolvePricing\([^)]*\) \{[\s\S]*?\r?\n\}\r?\n/);
assert.ok(match, 'resolvePricing not found in backend payphone.js');
const backendResolve = new Function(`${match[0]}; return resolvePricing;`)();

const cases = {
  'no promotion': [{ price: 40 }, { price: 40 }],
  'variant own price differs': [{ price: 40 }, { price: 37.39 }],
  'stale product originalPrice (Camisa Sendero)': [
    { price: 37.39, currentPrice: 39.9, originalPrice: 39.9, discountPercentage: 0 }, { price: 37.39 }],
  'product discount': [
    { price: 40, currentPrice: 30, originalPrice: 40, promotionId: 'P' }, { price: 40 }],
  'variant discount': [
    { price: 40 }, { price: 40, originalPrice: 40, discountedPrice: 32, promotionId: 'V' }],
  'variant discount wins over product discount': [
    { price: 40, currentPrice: 30, originalPrice: 40, promotionId: 'P' },
    { price: 40, originalPrice: 40, discountedPrice: 32, promotionId: 'V' }],
  'discountedPrice not lower than original': [
    { price: 40 }, { price: 40, originalPrice: 40, discountedPrice: 45, promotionId: 'V' }],
  'zero currentPrice is ignored': [
    { price: 40, currentPrice: 0, originalPrice: 40 }, { price: 40 }],
  'variant without price falls back to product': [{ price: 40 }, {}]
};

for (const [name, [product, variant]] of Object.entries(cases)) {
  test(`parity: ${name}`, () => {
    const shop = resolveEffectivePrice(product, variant);
    const server = backendResolve(product, variant);
    assert.equal(shop.unitPrice, server.unitPrice);
    assert.equal(shop.promotionId, server.promotionId);
  });
}

test('product-level display (no variant) uses product discount, else product price', () => {
  assert.equal(resolveEffectivePrice({ price: 37.39, currentPrice: 39.9, originalPrice: 39.9 }).unitPrice, 37.39);
  const p = resolveEffectivePrice({ price: 40, currentPrice: 30, originalPrice: 40 });
  assert.equal(p.unitPrice, 30);
  assert.equal(p.discountPercentage, 25);
  assert.equal(p.savings, 10);
});

test('hasEffectiveDiscount looks into variants', () => {
  assert.equal(hasEffectiveDiscount({ price: 40, variants: [{ price: 40 }] }), false);
  assert.equal(hasEffectiveDiscount({ price: 40, variants: [{ price: 40, originalPrice: 40, discountedPrice: 30 }] }), true);
  // a promotionId alone (no real price drop) is not a discount
  assert.equal(hasEffectiveDiscount({ price: 40, variants: [{ price: 40, promotionId: 'X' }] }), false);
});
