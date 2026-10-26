// The sitemap built from the live catalog. Shared by the build step (scripts/prerender.ts) and by the Netlify
// function that serves /sitemap.xml, so both produce exactly the same file.
import { buildProductSeo } from '../../src/app/core/product-seo';
import { fetchCollection } from './firestore-rest';
import { buildSitemapXml, extractStaticBlocks } from './prerender-html';
import type { SitemapProduct } from './prerender-html';

export const toIsoDay = (value: unknown, fallback: Date): string => {
  const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : fallback;
  return date.toISOString().slice(0, 10);
};

export interface LiveSitemapOptions {
  project: string;
  apiKey: string;
  siteUrl: string;
  /** Contents of src/sitemap.xml: the fixed pages (home, shop, landings...). */
  staticXml: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}

export function productsToSitemap(products: Record<string, any>[], siteUrl: string, now: Date): SitemapProduct[] {
  return products
    .filter(raw => raw['id'] && raw['name'])
    .map(raw => {
      const seo = buildProductSeo(raw as any, { siteUrl, now: now.getTime() });
      return { id: raw['id'], lastmod: toIsoDay(raw['updatedAt'] ?? raw['_updateTime'], now), image: seo.image };
    });
}

/** Throws if Firestore is unreachable or returns no products: the caller decides what to serve instead. */
export async function buildLiveSitemap(options: LiveSitemapOptions): Promise<string> {
  const now = options.now ?? new Date();
  const products = await fetchCollection({
    project: options.project, apiKey: options.apiKey, collection: 'products', fetchImpl: options.fetchImpl
  });
  if (products.length === 0) throw new Error('Firestore returned 0 products');
  return buildSitemapXml(options.siteUrl, extractStaticBlocks(options.staticXml), productsToSitemap(products, options.siteUrl, now));
}
