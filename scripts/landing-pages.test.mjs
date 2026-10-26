// Run: node --experimental-strip-types --test scripts/landing-pages.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./ts-resolve-hooks.mjs', import.meta.url);
const { buildLanding, highlightsOf, WATERPROOF_LANDING, landingByPath } = await import('../src/app/core/landing-pages.ts');
const { renderLandingPage } = await import('./lib/prerender-html.ts');

const SITE = 'https://numer.store';
const jacket = {
  id: 'j1', name: 'AGUACERO II', price: 41.73, totalStock: 10, imageUrl: 'https://img.test/a.webp',
  description: 'Chompa.\n⚡ Capucha ajustable\n⚡ Cierres sellados\nTexto suelto',
  sizes: [{ name: 'XS' }, { name: 'M' }, { name: 'XL' }],
  colors: [{ name: 'Negro' }, { name: 'Azul' }]
};
const pants = { id: 'p1', name: 'Extraligero', price: 30, totalStock: 5 };
const candidates = [
  { product: jacket, technologyNames: ['Secado Rápido', 'Impermeable'] },
  { product: pants, technologyNames: ['Secado Rápido'] },
  { product: { ...jacket, id: 'j2', name: 'Agotada', totalStock: 0 }, technologyNames: ['Impermeable'] }
];

test('features only waterproof products with stock', () => {
  const content = buildLanding(WATERPROOF_LANDING, candidates, { siteUrl: SITE });
  assert.deepEqual(content.featured.map(f => f.id), ['j1']);
  assert.equal(content.featured[0].price, 41.73);
  assert.deepEqual(content.featured[0].highlights, ['Capucha ajustable', 'Cierres sellados']);
});

test('title and description respect the search limits', () => {
  const content = buildLanding(WATERPROOF_LANDING, candidates, { siteUrl: SITE });
  assert.ok(content.title.length <= 60);
  assert.ok(content.description.length <= 155);
});

test('faq states the real price, sizes, return and warranty policy', () => {
  const text = buildLanding(WATERPROOF_LANDING, candidates, { siteUrl: SITE }).faqs.map(f => f.answer).join(' ');
  assert.match(text, /\$41\.73/);
  assert.match(text, /XS, M y XL/);
  assert.match(text, /7 días/);
  assert.match(text, /1 año/);
});

test('without stock it does not invent products or prices', () => {
  const content = buildLanding(WATERPROOF_LANDING, [{ product: pants, technologyNames: [] }], { siteUrl: SITE });
  assert.equal(content.featured.length, 0);
  assert.equal(content.collectionJsonLd.mainEntity.itemListElement.length, 0);
  assert.doesNotMatch(content.faqs.map(f => f.answer).join(' '), /\$41/);
});

test('structured data and path lookup', () => {
  const content = buildLanding(WATERPROOF_LANDING, candidates, { siteUrl: SITE });
  assert.equal(content.faqJsonLd['@type'], 'FAQPage');
  assert.equal(content.collectionJsonLd.mainEntity.itemListElement[0].url, `${SITE}/products/j1`);
  assert.equal(landingByPath('/chompas-impermeables/')?.path, '/chompas-impermeables');
  assert.equal(landingByPath('/otra'), undefined);
});

test('highlightsOf ignores plain lines', () => {
  assert.deepEqual(highlightsOf('uno\ndos'), []);
});

test('rendered page carries its own tags, text and schemas', () => {
  const template = '<html><head><title>x</title><link rel="canonical" href="https://numer.store"></head><body><app-root>old</app-root></body></html>';
  const html = renderLandingPage(template, buildLanding(WATERPROOF_LANDING, candidates, { siteUrl: SITE }), { siteUrl: SITE });
  assert.match(html, /<title>Chompa Impermeable 15\.000 mm/);
  assert.match(html, /href="https:\/\/numer\.store\/chompas-impermeables"/);
  assert.match(html, /<h1>Chompas impermeables/);
  assert.match(html, /id="faq-schema"/);
  assert.match(html, /id="landing-schema"/);
  assert.match(html, /href="\/products\/j1"/);
  assert.doesNotMatch(html, /old/);
});
