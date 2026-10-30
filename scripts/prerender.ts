// Runs after `ng build`: writes one static HTML page per product (dist/.../products/<id>.html) and a fresh
// sitemap.xml from the real catalog. A page that crawlers can read without running JavaScript; the Angular app
// still boots on it. This step NEVER fails the deploy: if anything is wrong it logs and leaves the build as it was.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildProductSeo } from '../src/app/core/product-seo';
import { buildTechnologyResolver } from '../src/app/core/technology-labels';
import { STATIC_PAGES } from '../src/app/core/static-pages';
import type { LandingCandidate } from '../src/app/core/landing-pages';
import { LANDING_PAGES, buildLanding } from '../src/app/core/landing-pages';
import { fetchCollection } from './lib/firestore-rest';
import type { ProductLink } from './lib/prerender-html';
import { toIsoDay } from './lib/sitemap-live';
import { buildSitemapXml, extractStaticBlocks, renderHomePage, renderLandingPage, renderProductPage, renderStaticPage } from './lib/prerender-html';

const SITE_URL = 'https://numer.store';
const DIST = resolve(process.env['PRERENDER_DIST'] || 'dist/numer-ecomerce/browser');
const SOURCE_SITEMAP = resolve('src/sitemap.xml');
const ENVIRONMENT_FILE = resolve('src/environments/environment.ts');

/** The Firebase web key is public (it ships inside the app bundle); it is read from the same environment file. */
function readFirebaseConfig(): { project: string; apiKey: string } {
  const source = readFileSync(ENVIRONMENT_FILE, 'utf8');
  const apiKey = process.env['FIREBASE_API_KEY'] || /apiKey:\s*["']([^"']+)["']/.exec(source)?.[1];
  const project = /projectId:\s*["']([^"']+)["']/.exec(source)?.[1];
  if (!apiKey || !project) throw new Error('No se encontró projectId/apiKey en environment.ts');
  return { project, apiKey };
}

async function main(): Promise<void> {
  const indexPath = join(DIST, 'index.html');
  if (!existsSync(indexPath)) {
    console.warn(`[prerender] No existe ${indexPath}: se omite (¿corrió ng build?).`);
    return;
  }
  const template = readFileSync(indexPath, 'utf8');
  const { project, apiKey } = readFirebaseConfig();
  const get = (collection: string) => fetchCollection({ project, apiKey, collection });

  const [products, variants, categories, technologies] = await Promise.all([
    get('products'), get('productVariants'), get('categories'), get('technologies')
  ]);
  if (products.length === 0) {
    console.warn('[prerender] Firestore devolvió 0 productos: no se genera nada para no dejar un sitemap vacío.');
    return;
  }

  const variantsByProduct = new Map<string, Record<string, any>[]>();
  for (const variant of variants) {
    const list = variantsByProduct.get(variant['productId']) ?? [];
    list.push(variant);
    variantsByProduct.set(variant['productId'], list);
  }
  const categoryName = new Map(categories.map(c => [c['id'], String(c['name'] ?? '')]));
  const resolver = buildTechnologyResolver(technologies.map(t => ({ id: t['id'], name: String(t['name'] ?? '') })));
  const now = new Date();

  mkdirSync(join(DIST, 'products'), { recursive: true });
  const sitemapProducts: { id: string; lastmod: string; image?: string }[] = [];
  const productLinks: ProductLink[] = [];
  const landingCandidates: LandingCandidate[] = [];
  let written = 0;

  for (const raw of products) {
    if (!raw['name'] || !raw['id']) continue;
    const own = variantsByProduct.get(raw['id']) ?? [];
    // Stock comes from the variants (the real source); the stored total is only a fallback
    const product = {
      ...raw,
      variants: own,
      totalStock: own.length ? own.reduce((sum, v) => sum + (Number(v['stock']) || 0), 0) : Number(raw['totalStock']) || 0
    } as any;

    const ids: string[] = [...new Set<string>([product.category, ...(product.categories ?? [])].filter(Boolean))];
    const categoryNames = ids.map(id => categoryName.get(id)).filter((n): n is string => !!n);
    const technologyNames = resolver.labels(product.technologies);
    const categoryId = ids.find(id => categoryName.has(id)) ?? null;

    const seo = buildProductSeo(product, { siteUrl: SITE_URL, categoryNames, categoryId, technologyNames, now: now.getTime() });
    const html = renderProductPage(template, {
      product, seo, siteUrl: SITE_URL, categoryNames, categoryId, technologyNames, now: now.getTime()
    });
    writeFileSync(join(DIST, 'products', `${raw['id']}.html`), html, 'utf8');
    written++;
    landingCandidates.push({ product, technologyNames });
    sitemapProducts.push({ id: raw['id'], lastmod: toIsoDay(product.updatedAt ?? raw['_updateTime'], now), image: seo.image });
    productLinks.push({ id: raw['id'], name: String(raw['name']), price: seo.price, inStock: seo.availability === 'InStock' });
  }
  productLinks.sort((a, b) => a.name.localeCompare(b.name, 'es'));

  // Fixed pages: their own title, description and canonical, plus the links a crawler follows
  for (const page of STATIC_PAGES) {
    const html = renderStaticPage(template, page, { siteUrl: SITE_URL, products: productLinks, listProducts: page.key === 'shop' });
    writeFileSync(join(DIST, `${page.path.replace(/^\//, '')}.html`), html, 'utf8');
  }
  // Landing pages: text written for one search, with the products of the catalog that answer it
  for (const def of LANDING_PAGES) {
    const content = buildLanding(def, landingCandidates, { siteUrl: SITE_URL, now: now.getTime() });
    writeFileSync(join(DIST, `${def.path.replace(/^\//, '')}.html`), renderLandingPage(template, content, { siteUrl: SITE_URL }), 'utf8');
  }
  // The home page is index.html itself: it keeps its own tags and gains the links to every product
  writeFileSync(indexPath, renderHomePage(template, { siteUrl: SITE_URL, products: productLinks }), 'utf8');

  const staticBlocks = existsSync(SOURCE_SITEMAP) ? extractStaticBlocks(readFileSync(SOURCE_SITEMAP, 'utf8')) : [];
  // /sitemap.xml is answered live by the Netlify function. A real sitemap.xml file here would be served instead
  // of the function, so the build copy has another name: it is only the function's fallback.
  rmSync(join(DIST, 'sitemap.xml'), { force: true });
  writeFileSync(join(DIST, 'sitemap-build.xml'), buildSitemapXml(SITE_URL, staticBlocks, sitemapProducts), 'utf8');

  console.log(`[prerender] ${written} páginas de producto, ${STATIC_PAGES.length} páginas fijas, ${LANDING_PAGES.length} landing, portada con enlaces y sitemap con ${staticBlocks.length + sitemapProducts.length} URLs (${staticBlocks.length} fijas).`);
}

main().catch(error => {
  // Never break the deploy over this step: the site works as before without the static pages
  console.warn('[prerender] Se omitió por un error:', error instanceof Error ? error.message : error);
});
