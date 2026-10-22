// Run: node --experimental-strip-types --test scripts/prerender.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./ts-resolve-hooks.mjs', import.meta.url);
const { decodeValue, decodeDocument, fetchCollection } = await import('./lib/firestore-rest.ts');
const {
  escapeHtml, jsonForScript, upsertMeta, setCanonical, setTitle, setJsonLd, removeStaticBreadcrumb,
  renderSnapshot, renderProductPage, extractStaticBlocks, buildSitemapXml
} = await import('./lib/prerender-html.ts');
const { buildProductSeo } = await import('../src/app/core/product-seo.ts');

// ───────────────────────── Firestore REST ─────────────────────────

test('decodeValue handles every Firestore type the catalog uses', () => {
  assert.equal(decodeValue({ stringValue: 'hola' }), 'hola');
  assert.equal(decodeValue({ integerValue: '42' }), 42);
  assert.equal(decodeValue({ doubleValue: 3.5 }), 3.5);
  assert.equal(decodeValue({ booleanValue: false }), false);
  assert.equal(decodeValue({ nullValue: null }), null);
  assert.equal(decodeValue({ timestampValue: '2026-10-22T15:00:00Z' }).getTime(), Date.parse('2026-10-22T15:00:00Z'));
  assert.deepEqual(decodeValue({ arrayValue: { values: [{ stringValue: 'a' }, { integerValue: '2' }] } }), ['a', 2]);
  assert.deepEqual(decodeValue({ arrayValue: {} }), []);
  assert.deepEqual(decodeValue({ mapValue: { fields: { n: { stringValue: 'x' }, deep: { mapValue: { fields: { k: { integerValue: '1' } } } } } } }), { n: 'x', deep: { k: 1 } });
  assert.equal(decodeValue(undefined), null);
});

test('decodeDocument gives the id from the path and the update time', () => {
  const doc = decodeDocument({
    name: 'projects/p/databases/(default)/documents/products/abc-123',
    fields: { name: { stringValue: 'BOXER' }, price: { doubleValue: 20.86 }, id: { stringValue: 'stored-id-is-ignored' } },
    updateTime: '2026-10-20T10:00:00Z'
  });
  assert.equal(doc.id, 'abc-123');
  assert.equal(doc.name, 'BOXER');
  assert.equal(doc.price, 20.86);
  assert.equal(doc._updateTime.toISOString(), '2026-10-20T10:00:00.000Z');
  assert.equal(decodeDocument({ name: 'x/y/z' }).id, 'z');
});

test('fetchCollection follows the pagination and sends the key', async () => {
  const urls = [];
  const pages = [
    { documents: [{ name: 'a/b/products/1', fields: { name: { stringValue: 'one' } } }], nextPageToken: 'T2' },
    { documents: [{ name: 'a/b/products/2', fields: { name: { stringValue: 'two' } } }] }
  ];
  const fetchImpl = async (url) => { urls.push(url); return { ok: true, json: async () => pages.shift() }; };
  const docs = await fetchCollection({ project: 'proj', apiKey: 'K EY', collection: 'products', fetchImpl });
  assert.deepEqual(docs.map(d => d.id), ['1', '2']);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /projects\/proj\/databases\/\(default\)\/documents\/products\?pageSize=300&key=K%20EY$/);
  assert.match(urls[1], /pageToken=T2$/);
});

test('fetchCollection handles an empty collection and fails loudly on HTTP errors', async () => {
  assert.deepEqual(await fetchCollection({ project: 'p', apiKey: 'k', collection: 'c', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), []);
  await assert.rejects(
    fetchCollection({ project: 'p', apiKey: 'k', collection: 'products', fetchImpl: async () => ({ ok: false, status: 403 }) }),
    /products: HTTP 403/
  );
});

// ───────────────────────── Head editing ─────────────────────────

const template = `<!doctype html>
<html lang="es-EC"><head>
<meta charset="utf-8">
<title>NUMER - Ropa Técnica</title>
<meta name="description" content="Descripción general">
<meta content="a, b" name="keywords">
<link rel="canonical" href="https://numer.store/">
<meta property="og:title" content="General">
<meta property="og:description" content="General desc">
<meta property="og:url" content="https://numer.store/">
<meta property="og:type" content="website">
<meta property="og:image" content="https://img/general.webp">
<meta name="twitter:title" content="General">
<meta name="twitter:description" content="General desc">
<meta name="twitter:image" content="https://img/general.webp">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"NUMER"}]}</script>
</head>
<body>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [ { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://numer.store/" } ]
  }
  </script>
  <app-root>
    <div class="loading-content"><h1>NUMER general</h1><p>Texto general.</p></div>
  </app-root>
  <script src="main.js"></script>
</body></html>`;

const count = (html, re) => (html.match(re) || []).length;

test('upsertMeta replaces in any attribute order, never duplicates, and inserts when missing', () => {
  let html = upsertMeta(template, 'name', 'keywords', 'nuevo, otro');
  assert.equal(count(html, /name="keywords"/g), 1);
  assert.match(html, /<meta name="keywords" content="nuevo, otro">/);
  assert.ok(!html.includes('content="a, b"'));

  html = upsertMeta(template, 'property', 'product:brand', 'NUMER');
  assert.match(html, /<meta property="product:brand" content="NUMER">\n<\/head>/);

  const twice = upsertMeta(upsertMeta(template, 'name', 'description', 'uno'), 'name', 'description', 'dos');
  assert.equal(count(twice, /name="description"/g), 1);
  assert.match(twice, /content="dos"/);
});

test('upsertMeta escapes quotes and keeps special replacement patterns literal', () => {
  const html = upsertMeta(template, 'name', 'description', 'Chompa "15.000mm" & $& $1 <b>');
  assert.match(html, /content="Chompa &quot;15\.000mm&quot; &amp; \$&amp; \$1 &lt;b&gt;"/);
});

test('setCanonical and setTitle replace the existing tags', () => {
  const html = setTitle(setCanonical(template, 'https://numer.store/products/x'), 'Producto & Co');
  assert.equal(count(html, /<title>/g), 1);
  assert.match(html, /<title>Producto &amp; Co<\/title>/);
  assert.equal(count(html, /rel="canonical"/g), 1);
  assert.match(html, /<link rel="canonical" href="https:\/\/numer\.store\/products\/x">/);
});

test('setJsonLd adds one block per id and escapes "<" so a value cannot close the script', () => {
  let html = setJsonLd(template, 'product-schema', { name: 'a </script><script>alert(1)</script>' });
  html = setJsonLd(html, 'product-schema', { name: 'segundo' });
  assert.equal(count(html, /id="product-schema"/g), 1);
  assert.ok(html.includes('"name":"segundo"'));
  assert.ok(!html.includes('alert(1)'));
  const escaped = jsonForScript({ x: '</script>' });
  assert.ok(!escaped.includes('<'));
  assert.deepEqual(JSON.parse(escaped), { x: '</script>' });
});

test('removeStaticBreadcrumb drops only the home breadcrumb, not the site graph', () => {
  const html = removeStaticBreadcrumb(template);
  assert.ok(!html.includes('"BreadcrumbList"'));
  assert.ok(html.includes('"@graph"'));
});

// ───────────────────────── Product page ─────────────────────────

const NOW = new Date('2026-10-22T15:00:00Z').getTime();
const product = {
  id: 'abc-123', name: 'AGUACERO II', model: 'AG-2', sku: 'MTB-AGU-1', barcode: '5601245466467', gender: 'man',
  price: 41.73, originalPrice: 41.73, currentPrice: 34.37, promotionId: 'p1',
  totalStock: 12, description: 'Chompa impermeable 15000mm.\n\nPara la lluvia de la sierra.',
  imageUrl: 'https://img.test/main.webp', features: ['Capucha compatible con casco'],
  colors: [{ name: 'Negro' }, { name: 'Azul Marino' }], sizes: [{ name: 'S' }, { name: 'M' }],
  tags: ['lluvia'], searchKeywords: ['chompa impermeable']
};
const ctx = (overrides = {}) => {
  const base = { product, siteUrl: 'https://numer.store', categoryNames: ['MTB'], categoryId: 'cat1', technologyNames: ['Impermeable'], now: NOW, ...overrides };
  return { ...base, seo: buildProductSeo(base.product, base) };
};

test('a product page has one title, description and canonical, all about the product', () => {
  const c = ctx();
  const html = renderProductPage(template, c);
  assert.equal(count(html, /<title>/g), 1);
  assert.equal(count(html, /name="description"/g), 1);
  assert.equal(count(html, /rel="canonical"/g), 1);
  assert.equal(count(html, /property="og:title"/g), 1);
  assert.equal(count(html, /property="og:type"/g), 1);
  assert.match(html, /<link rel="canonical" href="https:\/\/numer\.store\/products\/abc-123">/);
  assert.match(html, /<meta property="og:type" content="product">/);
  assert.match(html, /<meta property="product:price:amount" content="34\.37">/);
  assert.match(html, new RegExp(`<title>${escapeHtml(c.seo.title)}</title>`));
  assert.ok(!html.includes('Descripción general'), 'the generic description is gone');
  assert.ok(!html.includes('https://img/general.webp'));
});

test('a product page carries the structured data, parseable and without invented ratings', () => {
  const html = renderProductPage(template, ctx());
  const read = (id) => JSON.parse(new RegExp(`<script type="application/ld\\+json" id="${id}">([\\s\\S]*?)</script>`).exec(html)[1]);
  const productLd = read('product-schema');
  assert.equal(productLd['@type'], 'Product');
  assert.equal(productLd.offers.price, '34.37');
  assert.equal('aggregateRating' in productLd, false);
  const crumbs = read('breadcrumb-schema');
  assert.deepEqual(crumbs.itemListElement.map(i => i.name), ['Inicio', 'Tienda', 'MTB', 'AGUACERO II']);
  assert.equal(count(html, /"BreadcrumbList"/g), 1, 'the home-only breadcrumb is not left behind');
  assert.ok(html.includes('"@graph"'), 'the site-wide Organization data stays');
});

test('the visible content is the product, and the app still boots on it', () => {
  const html = renderProductPage(template, ctx());
  const body = html.slice(html.indexOf('<app-root>'), html.indexOf('</app-root>'));
  assert.match(body, /<h1>AGUACERO II<\/h1>/);
  assert.match(body, /<strong>\$34\.37<\/strong> \(precio regular \$41\.73, 18% de descuento\)/);
  assert.match(body, /Disponible/);
  assert.match(body, /Categoría: MTB/);
  assert.match(body, /Chompa impermeable 15000mm\. Para la lluvia de la sierra\./);
  assert.match(body, /<li>Capucha compatible con casco<\/li>/);
  assert.match(body, /<li>Impermeable<\/li>/);
  assert.match(body, /Colores: Negro, Azul Marino/);
  assert.match(body, /Tallas: S, M/);
  assert.match(body, /Envíos a todo Ecuador: \$5,00/);
  assert.match(body, /<a href="\/shop\?category=cat1">MTB<\/a>/);
  assert.ok(!body.includes('NUMER general'));
  assert.ok(html.includes('<script src="main.js"></script>'), 'the application scripts are untouched');
});

test('out of stock and no discount read honestly', () => {
  const plain = { ...product, totalStock: 0, originalPrice: undefined, currentPrice: undefined, promotionId: undefined };
  const html = renderSnapshot(ctx({ product: plain }));
  assert.match(html, /<strong>\$41\.73<\/strong> · Agotado por ahora/);
  assert.ok(!html.includes('descuento'));
});

test('names with HTML or quotes cannot break the page', () => {
  const evil = { ...product, name: 'Chompa <script>alert(1)</script> "X" & Co', description: '<img src=x onerror=alert(1)>' };
  const html = renderProductPage(template, ctx({ product: evil }));
  assert.ok(!html.includes('<script>alert(1)'), 'no raw script tag from the name');
  assert.ok(!html.includes('<img src=x'), 'no raw tag from the description');
  assert.ok(html.includes('&lt;script'), 'the text is kept, escaped');
  assert.equal(count(html, /<script/g), count(renderProductPage(template, ctx()), /<script/g), 'no extra script blocks appear');
});

// ───────────────────────── Sitemap ─────────────────────────

const sourceSitemap = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://numer.store</loc>
    <priority>1</priority>
  </url>
  <url>
    <loc>https://numer.store/shop</loc>
  </url>
  <url>
    <loc>https://numer.store/products/old-product-id</loc>
  </url>
</urlset>`;

test('extractStaticBlocks keeps the fixed pages and drops the old product urls', () => {
  const blocks = extractStaticBlocks(sourceSitemap);
  assert.equal(blocks.length, 2);
  assert.ok(blocks.every(b => !b.includes('/products/')));
});

test('the sitemap lists the fixed pages and every current product with its image', () => {
  const xml = buildSitemapXml('https://numer.store/', extractStaticBlocks(sourceSitemap), [
    { id: 'abc-123', lastmod: '2026-10-22', image: 'https://img.test/a&b.webp' },
    { id: 'def-456', lastmod: '2026-10-20' }
  ]);
  assert.equal(count(xml, /<url>/g), 4);
  assert.ok(xml.includes('<loc>https://numer.store/products/abc-123</loc>'));
  assert.ok(xml.includes('<lastmod>2026-10-22</lastmod>'));
  assert.ok(xml.includes('<image:loc>https://img.test/a&amp;b.webp</image:loc>'));
  assert.ok(xml.includes('xmlns:image='));
  assert.ok(!xml.includes('old-product-id'));
  assert.ok(xml.startsWith('<?xml'));
  assert.equal(count(xml, /<loc>https:\/\/numer\.store\/products\/def-456<\/loc>/g), 1);
});
