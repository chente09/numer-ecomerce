// Run: node --experimental-strip-types --test scripts/sitemap-live.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./ts-resolve-hooks.mjs', import.meta.url);
const { buildLiveSitemap, productsToSitemap, toIsoDay } = await import('./lib/sitemap-live.ts');

const staticXml = `<urlset>
<url><loc>https://numer.store/shop</loc></url>
<url><loc>https://numer.store/shop?category=x</loc></url>
<url><loc>https://numer.store/products/old</loc></url>
</urlset>`;
const firestoreDoc = (id, fields) => ({ name: `projects/p/databases/(default)/documents/products/${id}`, fields });
const fakeFetch = documents => async () => ({ ok: true, json: async () => ({ documents }) });

test('builds fixed pages plus one entry per product with its image', async () => {
  const xml = await buildLiveSitemap({
    project: 'p', apiKey: 'k', siteUrl: 'https://numer.store', staticXml, now: new Date('2026-10-26T00:00:00Z'),
    fetchImpl: fakeFetch([firestoreDoc('a1', { name: { stringValue: 'Chompa' }, imageUrl: { stringValue: 'https://img.test/a.webp' } })])
  });
  assert.match(xml, /<loc>https:\/\/numer\.store\/shop<\/loc>/);
  assert.doesNotMatch(xml, /\?category/);
  assert.doesNotMatch(xml, /products\/old/);
  assert.match(xml, /<loc>https:\/\/numer\.store\/products\/a1<\/loc>/);
  assert.match(xml, /image:loc>https:\/\/img\.test\/a\.webp/);
});

test('an empty catalog or an HTTP error throws so the caller serves the build copy', async () => {
  await assert.rejects(buildLiveSitemap({ project: 'p', apiKey: 'k', siteUrl: 'https://numer.store', staticXml, fetchImpl: fakeFetch([]) }));
  await assert.rejects(buildLiveSitemap({ project: 'p', apiKey: 'k', siteUrl: 'https://numer.store', staticXml, fetchImpl: async () => ({ ok: false, status: 500 }) }));
});

test('products without id or name are skipped and the date falls back to today', () => {
  const now = new Date('2026-10-26T10:00:00Z');
  const list = productsToSitemap([{ id: 'x', name: 'N' }, { name: 'no id' }, { id: 'y' }], 'https://numer.store', now);
  assert.deepEqual(list.map(p => [p.id, p.lastmod]), [['x', '2026-10-26']]);
  assert.equal(toIsoDay(undefined, now), '2026-10-26');
});
