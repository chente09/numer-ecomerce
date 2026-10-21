// Run: node --experimental-strip-types --test scripts/search-engine.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIndex, searchProducts, countMatches, searchCategories, highlight, normalize, stem
} from '../src/app/core/search-engine.ts';

const categories = [
  { id: 'c1', name: 'Camisetas' },
  { id: 'c2', name: 'Ropa interior' },
  { id: 'c3', name: 'Accesorios' }
];

const products = [
  { id: 'p1', name: 'Camiseta Térmica Hombre', category: 'c1', gender: 'man', totalStock: 5, colors: [{ name: 'Negro' }], description: 'Ideal para montaña y frío' },
  { id: 'p2', name: 'Camiseta Dry Mujer', category: 'c1', gender: 'woman', totalStock: 3, colors: [{ name: 'Fuxia' }] },
  { id: 'p3', name: 'BOXER MUJER', category: 'c2', gender: 'woman', totalStock: 8, colors: [{ name: 'Fuxia' }, { name: 'Azul' }] },
  { id: 'p4', name: 'Pantalón Trekking', category: 'c3', gender: 'unisex', totalStock: 0, tags: ['senderismo'] },
  { id: 'p5', name: 'Lentes Polarizados', category: 'c3', totalStock: 2, sku: 'LP-100', description: 'Camiseta no incluida' },
  { id: 'p6', name: 'Chompa Impermeable', category: 'c3', gender: 'unisex', totalStock: 4, searchKeywords: ['chaqueta', 'lluvia'] }
];
const index = buildIndex(products, categories);
const ids = (q, limit) => searchProducts(index, q, limit).map(h => h.product.id);

test('normalize strips accents, case and punctuation', () => {
  assert.equal(normalize('  Pantalón-Trekking!  '), 'pantalon trekking');
  assert.equal(normalize('NIÑO'), 'nino');
});

test('stem handles Spanish plurals', () => {
  assert.equal(stem('camisetas'), 'camiseta');
  assert.equal(stem('pantalones'), 'pantalon');
  assert.equal(stem('mujeres'), 'mujer');
  assert.equal(stem('lentes'), 'lente');
  assert.equal(stem('sol'), 'sol');
});

test('ignores accents and case', () => {
  assert.deepEqual(ids('pantalon'), ['p4']);
  assert.deepEqual(ids('PANTALÓN'), ['p4']);
});

test('plural and singular find the same products', () => {
  assert.deepEqual(ids('camisetas').slice(0, 2).sort(), ['p1', 'p2']);
  assert.deepEqual(ids('lente'), ['p5']);
});

test('finds a word that is still being typed', () => {
  assert.ok(ids('cam').includes('p1'));
  assert.deepEqual(ids('boxe'), ['p3']);
});

test('tolerates typos and swapped letters', () => {
  assert.deepEqual(ids('camizeta termica'), ['p1']);
  assert.deepEqual(ids('boxre'), ['p3']);
  assert.deepEqual(ids('chmpa'), ['p6']);
});

test('every word must match (AND)', () => {
  assert.deepEqual(ids('camiseta mujer'), ['p2']);
  assert.deepEqual(ids('camiseta hombre'), ['p1']);
  assert.deepEqual(ids('boxer hombre'), []);
});

test('searches colors, categories, tags, keywords, sku and gender', () => {
  assert.deepEqual(ids('azul'), ['p3']);
  assert.ok(ids('ropa interior').includes('p3'));
  assert.deepEqual(ids('senderismo'), ['p4']);
  assert.deepEqual(ids('lluvia'), ['p6']);
  assert.deepEqual(ids('lp-100'), ['p5']);
  assert.ok(ids('mujer').includes('p2') && ids('mujer').includes('p3') && !ids('mujer').includes('p1'));
});

test('a hit in the name outranks a hit in the description', () => {
  // p1/p2 have "camiseta" in the name; p5 only in the description
  const order = ids('camiseta');
  assert.ok(order.indexOf('p5') > order.indexOf('p1'));
  assert.ok(order.indexOf('p5') > order.indexOf('p2'));
});

test('name starting with the query ranks first', () => {
  assert.equal(ids('camiseta termica')[0], 'p1');
});

test('in stock goes before out of stock on equal score', () => {
  const idx = buildIndex([
    { id: 'a', name: 'Gorra Sol', totalStock: 0 },
    { id: 'b', name: 'Gorra Sol', totalStock: 3 }
  ]);
  assert.deepEqual(searchProducts(idx, 'gorra').map(h => h.product.id), ['b', 'a']);
});

test('short or empty queries return nothing', () => {
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('a'), []);
  assert.deepEqual(ids('   '), []);
});

test('no match returns an empty list', () => {
  assert.deepEqual(ids('zzzxqw'), []);
});

test('countMatches counts beyond the visible limit', () => {
  assert.equal(searchProducts(index, 'camiseta', 1).length, 1);
  assert.equal(countMatches(index, 'camiseta'), searchProducts(index, 'camiseta', 99).length);
});

test('limit is respected', () => {
  assert.equal(searchProducts(index, 'mujer', 1).length, 1);
});

test('searchCategories matches by name with plural, prefix and typo', () => {
  assert.deepEqual(searchCategories(categories, 'camiseta').map(h => h.category.id), ['c1']);
  assert.deepEqual(searchCategories(categories, 'acces').map(h => h.category.id), ['c3']);
  assert.deepEqual(searchCategories(categories, 'acesorios').map(h => h.category.id), ['c3']);
  assert.deepEqual(searchCategories(categories, 'xyz'), []);
});

test('highlight marks the typed text keeping the original accents and case', () => {
  assert.deepEqual(highlight('Pantalón Trekking', 'pantalon'), [
    { text: 'Pantalón', match: true },
    { text: ' Trekking', match: false }
  ]);
  assert.deepEqual(highlight('Camiseta Dry', 'camisetas dry'), [
    { text: 'Camiseta', match: true },
    { text: ' ', match: false },
    { text: 'Dry', match: true }
  ]);
  assert.deepEqual(highlight('Boxer', 'zzz'), [{ text: 'Boxer', match: false }]);
});

test('highlight marks the word a typo was matched to', () => {
  assert.deepEqual(highlight('BOXER MUJER', 'boxre'), [
    { text: 'BOXER', match: true },
    { text: ' MUJER', match: false }
  ]);
});
