// Run: node --experimental-strip-types --test scripts/product-seo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./ts-resolve-hooks.mjs', import.meta.url);
const {
  buildProductSeo, buildTitle, buildDescription, buildKeywords, cleanText, truncateAtWord,
  gtinProperty, omitEmpty, buildBreadcrumbJsonLd, TITLE_MAX, DESCRIPTION_MAX
} = await import('../src/app/core/product-seo.ts');
const { buildTechnologyResolver, slugOf, readableSlug } = await import('../src/app/core/technology-labels.ts');

const NOW = new Date('2026-10-22T15:00:00Z').getTime();
const SITE = 'https://numer.store';

const product = {
  id: 'abc-123',
  name: 'AGUACERO II',
  model: 'AG-2',
  sku: 'MTB-AGU-1',
  barcode: '5601245466467',
  gender: 'man',
  price: 41.73,
  totalStock: 12,
  description: '🌧️ AGUACERO II de NUMER.\n\nCuando el clima cambia, la aventura continúa. Chompa impermeable 15000mm.',
  imageUrl: 'https://img.test/main.webp',
  additionalImages: ['https://img.test/b.webp', 'https://img.test/main.webp'],
  colors: [{ name: 'Negro', imageUrl: 'https://img.test/negro.webp' }, { name: 'Azul Marino' }],
  sizes: [{ name: 'S' }, { name: 'M' }],
  tags: ['chaqueta impermeable', 'lluvia'],
  searchKeywords: ['chompa impermeable hombre', 'Lluvia']
};

test('cleanText removes emojis, markdown marks and line breaks', () => {
  assert.equal(cleanText('🌧️ Hola *mundo*\n\n  chao'), 'Hola mundo chao');
  assert.equal(cleanText(undefined), '');
});

test('truncateAtWord never cuts a word and marks the cut', () => {
  const text = 'La comodidad que no se ve pero que marca toda la diferencia en cada salida';
  const cut = truncateAtWord(text, 40);
  assert.ok(cut.length <= 40);
  assert.ok(cut.endsWith('…'));
  assert.ok(text.startsWith(cut.slice(0, -1)), 'it is a prefix of the original');
  assert.ok(!/\s…$/.test(cut));
  assert.equal(truncateAtWord('corto', 40), 'corto');
});

test('title: the admin metaTitle wins', () => {
  assert.equal(buildTitle({ ...product, metaTitle: '  Chompa impermeable AGUACERO II | NUMER  ' }, 'MTB'),
    'Chompa impermeable AGUACERO II | NUMER');
});

test('title: name, category name (never an id) and brand, within the limit', () => {
  const title = buildTitle(product, 'MTB');
  assert.equal(title, 'AGUACERO II - MTB | NUMER Ecuador');
  assert.ok(title.length <= TITLE_MAX);
  assert.equal(buildTitle(product), 'AGUACERO II | NUMER Ecuador');
});

test('title: long names drop the category, and very long names are cut at a word', () => {
  const long = { ...product, name: 'JERSEY MTB ENDURO DH MANGA LARGA' };
  assert.ok(buildTitle(long, 'Trail Running y Training').length <= TITLE_MAX);
  const huge = { ...product, name: 'Chompa técnica impermeable y transpirable ultraligera para montaña y ciclismo de ruta' };
  const title = buildTitle(huge, 'MTB');
  assert.ok(title.length <= TITLE_MAX);
  assert.ok(title.endsWith('| NUMER Ecuador'));
  assert.ok(title.includes('…'));
});

test('description: the admin metaDescription wins as written', () => {
  assert.equal(buildDescription({ ...product, metaDescription: ' Chompa de 15000 mm. ' }), 'Chompa de 15000 mm.');
});

test('description: built from the real text, clean, within the limit and with the shipping note', () => {
  const description = buildDescription(product);
  assert.ok(description.length <= DESCRIPTION_MAX);
  assert.ok(!/🌧|\n/.test(description));
  assert.ok(description.startsWith('AGUACERO II de NUMER.'));
  assert.ok(description.endsWith('Envíos a todo Ecuador.'));
});

test('description: without text it falls back to name and technologies', () => {
  const description = buildDescription({ ...product, description: '' }, ['Impermeable', 'Secado Rápido']);
  assert.match(description, /^AGUACERO II: ropa técnica outdoor con impermeable, secado rápido\./);
  assert.match(buildDescription({ ...product, description: undefined }), /ropa técnica NUMER para deportes outdoor/);
});

test('keywords: unique ignoring case, with categories, technologies, tags and search words', () => {
  const keywords = buildKeywords(product, ['MTB'], ['Impermeable']).split(', ');
  assert.equal(keywords[0], 'AGUACERO II');
  assert.ok(keywords.includes('MTB') && keywords.includes('Impermeable'));
  assert.ok(keywords.includes('chompa impermeable hombre'));
  assert.equal(keywords.filter(k => k.toLowerCase() === 'lluvia').length, 1);
  assert.ok(keywords.length <= 18);
});

test('gtinProperty keeps only valid GTIN lengths', () => {
  assert.deepEqual(gtinProperty('5601245466467'), { key: 'gtin13', value: '5601245466467' });
  assert.deepEqual(gtinProperty('12345678'), { key: 'gtin8', value: '12345678' });
  assert.deepEqual(gtinProperty('0123 4567 8905'), { key: 'gtin12', value: '012345678905' });
  assert.equal(gtinProperty('123'), null);
  assert.equal(gtinProperty('ABC-123'), null);
  assert.equal(gtinProperty(undefined), null);
});

test('omitEmpty drops empty values but keeps zeros', () => {
  assert.deepEqual(omitEmpty({ a: '', b: null, c: undefined, d: [], e: {}, f: 0, g: { h: '' }, i: [{ j: '' }, { k: 1 }] }),
    { f: 0, i: [{ k: 1 }] });
});

const seo = () => buildProductSeo(product, { siteUrl: SITE, categoryNames: ['MTB'], categoryId: 'cat1', technologyNames: ['Impermeable'], now: NOW });

test('structured data: a real Product, with url, ids and no invented rating', () => {
  const { jsonLd } = seo();
  assert.equal(jsonLd['@type'], 'Product');
  assert.equal(jsonLd.url, 'https://numer.store/products/abc-123');
  assert.equal(jsonLd.name, 'AGUACERO II', 'the product name, not the page title');
  assert.equal(jsonLd.sku, 'MTB-AGU-1');
  assert.equal(jsonLd.mpn, 'AG-2');
  assert.equal(jsonLd.gtin13, '5601245466467');
  assert.equal(jsonLd.brand.name, 'NUMER');
  assert.equal(jsonLd.color, 'Negro, Azul Marino');
  assert.equal(jsonLd.size, 'S, M');
  assert.equal(jsonLd.audience.suggestedGender, 'male');
  assert.deepEqual(jsonLd.additionalProperty, [{ '@type': 'PropertyValue', name: 'Tecnología', value: 'Impermeable' }]);
  assert.equal('aggregateRating' in jsonLd, false);
  assert.equal('review' in jsonLd, false);
  assert.ok(!JSON.stringify(jsonLd).includes('4.8'));
});

test('structured data: images are unique, absolute and capped', () => {
  assert.deepEqual(seo().jsonLd.image, ['https://img.test/main.webp', 'https://img.test/b.webp', 'https://img.test/negro.webp']);
  const many = buildProductSeo({ ...product, additionalImages: Array.from({ length: 20 }, (_, i) => `https://img.test/${i}.webp`) },
    { siteUrl: SITE, now: NOW });
  assert.equal(many.jsonLd.image.length, 8);
  const relative = buildProductSeo({ ...product, imageUrl: '/local.png', additionalImages: [], colors: [] }, { siteUrl: SITE, now: NOW });
  assert.equal(relative.jsonLd.image, undefined, 'relative paths are not valid image urls');
});

test('offer: regular price, in stock, with the flat shipping and delivery time', () => {
  const { offers } = seo().jsonLd;
  assert.equal(offers.price, '41.73');
  assert.equal(offers.priceCurrency, 'USD');
  assert.equal(offers.availability, 'https://schema.org/InStock');
  assert.equal(offers.itemCondition, 'https://schema.org/NewCondition');
  assert.equal(offers.priceValidUntil, undefined);
  assert.equal(offers.shippingDetails.shippingRate.value, '5.00');
  assert.equal(offers.shippingDetails.shippingDestination.addressCountry, 'EC');
  assert.equal(offers.shippingDetails.deliveryTime.transitTime.minValue, 2);
  assert.equal(offers.shippingDetails.deliveryTime.transitTime.maxValue, 5);
});

test('offer: uses the effective promotional price and its end date only while it applies', () => {
  const promo = { ...product, originalPrice: 41.73, currentPrice: 34.37, promotionId: 'p1', promotionEndDate: new Date('2026-11-18T05:00:00Z') };
  const active = buildProductSeo(promo, { siteUrl: SITE, now: NOW });
  assert.equal(active.jsonLd.offers.price, '34.37');
  assert.equal(active.price, 34.37);
  assert.equal(active.jsonLd.offers.priceValidUntil, '2026-11-18');

  const expired = buildProductSeo({ ...promo, promotionEndDate: new Date('2026-10-01T05:00:00Z') }, { siteUrl: SITE, now: NOW });
  assert.equal(expired.jsonLd.offers.price, '41.73', 'an expired promotion is not advertised');
  assert.equal(expired.jsonLd.offers.priceValidUntil, undefined);

  const paused = buildProductSeo({ ...promo, promotionPaused: true }, { siteUrl: SITE, now: NOW });
  assert.equal(paused.jsonLd.offers.price, '41.73');
});

test('offer: out of stock when there are no units, counting variants when the total is missing', () => {
  assert.equal(buildProductSeo({ ...product, totalStock: 0 }, { siteUrl: SITE, now: NOW }).jsonLd.offers.availability, 'https://schema.org/BackOrder');
  assert.equal(buildProductSeo({ ...product, totalStock: undefined, variants: [{ stock: 0 }, { stock: 3 }] }, { siteUrl: SITE, now: NOW }).availability, 'InStock');
  assert.equal(buildProductSeo({ ...product, totalStock: undefined, variants: [] }, { siteUrl: SITE, now: NOW }).availability, 'BackOrder');
});

test('breadcrumb names the category and the product, never an id', () => {
  const { breadcrumb } = seo();
  assert.deepEqual(breadcrumb.map(c => c.name), ['Inicio', 'Tienda', 'MTB', 'AGUACERO II']);
  assert.equal(breadcrumb[2].url, 'https://numer.store/shop?category=cat1');
  const noCategory = buildProductSeo(product, { siteUrl: SITE, now: NOW });
  assert.deepEqual(noCategory.breadcrumb.map(c => c.name), ['Inicio', 'Tienda', 'AGUACERO II']);

  const ld = buildBreadcrumbJsonLd(breadcrumb);
  assert.equal(ld['@type'], 'BreadcrumbList');
  assert.equal(ld.itemListElement[3].position, 4);
  assert.equal(ld.itemListElement[3].item, 'https://numer.store/products/abc-123');
});

test('structured data trims color and size names', () => {
  const messy = buildProductSeo({ ...product, colors: [{ name: ' Naranja Neón AV ' }, { name: '' }], sizes: [{ name: ' S ' }] }, { siteUrl: SITE, now: NOW });
  assert.equal(messy.jsonLd.color, 'Naranja Neón AV');
  assert.equal(messy.jsonLd.size, 'S');
});

test('structured data never contains undefined or the page title as the name', () => {
  const json = JSON.stringify(seo().jsonLd);
  assert.ok(!json.includes('undefined'));
  assert.equal(JSON.parse(json).name, 'AGUACERO II');
});

test('a minimal product still produces valid output', () => {
  const minimal = buildProductSeo({ id: 'x', name: 'Gorra', price: 10 }, { siteUrl: SITE + '/', now: NOW });
  assert.equal(minimal.url, 'https://numer.store/products/x');
  assert.equal(minimal.title, 'Gorra | NUMER Ecuador');
  assert.equal(minimal.jsonLd.offers.price, '10.00');
  assert.equal(minimal.availability, 'BackOrder');
});

// ───────────────────────── Technology names ─────────────────────────

const records = [
  { id: 'Ssz9RsDL', name: 'Secado Rápido' },
  { id: 'uiWKdzDo', name: 'Filtro UV' }
];

test('technology resolver understands ids, slugs, legacy dictionary and unknown values', () => {
  const resolver = buildTechnologyResolver(records);
  assert.equal(resolver.label('Ssz9RsDL'), 'Secado Rápido', 'by id');
  assert.equal(resolver.label('secado_rapido'), 'Secado Rápido', 'by slug of a known technology');
  assert.equal(resolver.label('elastico'), 'Elástico', 'legacy dictionary keeps the accent');
  assert.equal(resolver.label('proteccion_uv'), 'Protección UV');
  assert.equal(resolver.label('custom_rompe_vientos'), 'Custom rompe vientos', 'readable fallback');
  assert.equal(resolver.label('  '), '');
});

test('technology resolver removes duplicates that come from id + slug', () => {
  const resolver = buildTechnologyResolver(records);
  assert.deepEqual(resolver.labels(['secado_rapido', 'Ssz9RsDL', 'elastico']), ['Secado Rápido', 'Elástico']);
  assert.deepEqual(resolver.labels(undefined), []);
});

test('technology slug is stable for ids and slugs (descriptions are written per slug)', () => {
  const resolver = buildTechnologyResolver(records);
  assert.equal(resolver.slug('Ssz9RsDL'), 'secado_rapido');
  assert.equal(resolver.slug('secado_rapido'), 'secado_rapido');
  assert.equal(slugOf('Protección  UV'), 'proteccion_uv');
  assert.equal(readableSlug('anti-olor'), 'Anti olor');
});
