// Turns the built index.html into a product page that already carries its own title, description, structured data
// and readable content, so crawlers that do not run JavaScript (most AI assistants) can read it. The Angular app
// still boots on top of it and takes over, exactly as before.
import type { ProductSeo, ProductSeoSource } from '../../src/app/core/product-seo';
import { cleanText, truncateAtWord } from '../../src/app/core/product-seo';
import { resolveEffectivePrice } from '../../src/app/core/pricing';

export function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** JSON for a <script> block: "<" is escaped so a value can never close the tag. */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// ───────────────────────── Head ─────────────────────────

/** Replaces every <meta attr="key"> with a single one (or adds it): never leaves duplicates behind. */
export function upsertMeta(html: string, attr: 'name' | 'property', key: string, content: string): string {
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}">`;
  const re = new RegExp(`<meta\\s[^>]*?${attr}\\s*=\\s*["']${escapeRegex(key)}["'][^>]*>`, 'gi');
  let replaced = false;
  const out = html.replace(re, () => {
    if (replaced) return '';
    replaced = true;
    return tag;
  });
  return replaced ? out : out.replace(/<\/head>/i, () => `  ${tag}\n</head>`);
}

export function setCanonical(html: string, href: string): string {
  const tag = `<link rel="canonical" href="${escapeHtml(href)}">`;
  const re = /<link\s[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi;
  let replaced = false;
  const out = html.replace(re, () => {
    if (replaced) return '';
    replaced = true;
    return tag;
  });
  return replaced ? out : out.replace(/<\/head>/i, () => `  ${tag}\n</head>`);
}

export function setTitle(html: string, title: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(title)}</title>`);
}

/** Adds (or replaces, when it has the same id) a JSON-LD block at the end of the head. */
export function setJsonLd(html: string, id: string, data: unknown): string {
  const re = new RegExp(`<script[^>]*\\bid=["']${escapeRegex(id)}["'][^>]*>[\\s\\S]*?<\\/script>\\s*`, 'i');
  const clean = html.replace(re, '');
  return clean.replace(/<\/head>/i, () => `  <script type="application/ld+json" id="${id}">${jsonForScript(data)}</script>\n</head>`);
}

/** The home-only BreadcrumbList that index.html carries in its body would contradict the page's own breadcrumb. */
export function removeStaticBreadcrumb(html: string): string {
  return html.replace(
    /<script type="application\/ld\+json">\s*\{\s*"@context":\s*"https:\/\/schema\.org",\s*"@type":\s*"BreadcrumbList"[\s\S]*?<\/script>\s*/i,
    ''
  );
}

// ───────────────────────── Visible content for crawlers ─────────────────────────

export interface SnapshotContext {
  product: ProductSeoSource & { features?: string[] };
  seo: ProductSeo;
  siteUrl: string;
  categoryNames: string[];
  categoryId?: string | null;
  technologyNames: string[];
  now: number;
}

const money = (n: number): string => `$${n.toFixed(2)}`;

function listOf(items: string[]): string {
  return `<ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
}

/** Plain, truthful HTML of the product page: what a visitor reads once the app has loaded. */
export function renderSnapshot(ctx: SnapshotContext): string {
  const { product, seo, siteUrl, categoryNames, technologyNames, now } = ctx;
  const price = resolveEffectivePrice(product, undefined, now);
  const inStock = seo.availability === 'InStock';
  const description = truncateAtWord(cleanText(product.description), 1200);
  const colors = (product.colors ?? []).map(c => cleanText(c.name)).filter(Boolean);
  const sizes = (product.sizes ?? []).map(s => cleanText(s.name)).filter(Boolean);
  const features = (product.features ?? []).map(cleanText).filter(Boolean);

  const crumbs = seo.breadcrumb.map((crumb, i, all) =>
    i === all.length - 1
      ? escapeHtml(crumb.name)
      : `<a href="${escapeHtml(crumb.url.replace(siteUrl, '') || '/')}">${escapeHtml(crumb.name)}</a>`
  ).join(' › ');

  const parts: string[] = [
    `<nav aria-label="Ruta de navegación">${crumbs}</nav>`,
    `<h1>${escapeHtml(cleanText(product.name))}</h1>`,
    `<p><strong>${money(price.unitPrice)}</strong>${price.hasDiscount
      ? ` (precio regular ${money(price.originalUnitPrice)}, ${price.discountPercentage}% de descuento)` : ''} · ${inStock ? 'Disponible' : 'Agotado por ahora'}</p>`
  ];
  if (categoryNames.length) parts.push(`<p>Categoría: ${escapeHtml(categoryNames.join(', '))}</p>`);
  if (description) parts.push(`<p>${escapeHtml(description)}</p>`);
  if (features.length) parts.push(`<h2>Características</h2>${listOf(features)}`);
  if (technologyNames.length) parts.push(`<h2>Tecnologías</h2>${listOf(technologyNames)}`);
  if (colors.length) parts.push(`<p>Colores: ${escapeHtml(colors.join(', '))}</p>`);
  if (sizes.length) parts.push(`<p>Tallas: ${escapeHtml(sizes.join(', '))}</p>`);
  parts.push('<p>Envíos a todo Ecuador: $5,00, entrega en 2 a 5 días hábiles.</p>');
  if (seo.image) parts.push(`<img src="${escapeHtml(seo.image)}" alt="${escapeHtml(cleanText(product.name))}" width="480">`);
  parts.push('<p><a href="/shop">Ver toda la tienda NUMER</a></p>');

  return `<div class="loading-content">${parts.join('')}</div>`;
}

/** Full page for one product, built from the template (the production index.html). */
export function renderProductPage(template: string, ctx: SnapshotContext): string {
  const { seo } = ctx;
  let html = template;
  html = removeStaticBreadcrumb(html);
  html = setTitle(html, seo.title);
  html = setCanonical(html, seo.url);
  html = upsertMeta(html, 'name', 'description', seo.description);
  html = upsertMeta(html, 'name', 'keywords', seo.keywords);
  html = upsertMeta(html, 'property', 'og:title', seo.title);
  html = upsertMeta(html, 'property', 'og:description', seo.description);
  html = upsertMeta(html, 'property', 'og:url', seo.url);
  html = upsertMeta(html, 'property', 'og:type', 'product');
  if (seo.image) {
    html = upsertMeta(html, 'property', 'og:image', seo.image);
    html = upsertMeta(html, 'name', 'twitter:image', seo.image);
  }
  html = upsertMeta(html, 'name', 'twitter:title', seo.title);
  html = upsertMeta(html, 'name', 'twitter:description', seo.description);
  html = upsertMeta(html, 'property', 'product:price:amount', String(seo.price));
  html = upsertMeta(html, 'property', 'product:price:currency', seo.currency);
  html = upsertMeta(html, 'property', 'product:availability', seo.availability);
  html = upsertMeta(html, 'property', 'product:brand', 'NUMER');
  if (seo.category) html = upsertMeta(html, 'property', 'product:category', seo.category);

  html = setJsonLd(html, 'product-schema', seo.jsonLd);
  html = setJsonLd(html, 'breadcrumb-schema', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: seo.breadcrumb.map((crumb, index) => ({
      '@type': 'ListItem', position: index + 1, name: crumb.name, item: crumb.url
    }))
  });

  const body = renderSnapshot(ctx);
  return html.replace(/<app-root[^>]*>[\s\S]*?<\/app-root>/i, () => `<app-root>${body}</app-root>`);
}

// ───────────────────────── Sitemap ─────────────────────────

export interface SitemapProduct {
  id: string;
  lastmod: string;
  image?: string;
}

/** The <url> blocks that are not products (home, shop, about...), kept exactly as they are in the source sitemap. */
export function extractStaticBlocks(xml: string): string[] {
  return (xml.match(/<url>[\s\S]*?<\/url>/g) ?? []).filter(block => !/<loc>[^<]*\/products\//.test(block));
}

export function buildSitemapXml(siteUrl: string, staticBlocks: string[], products: SitemapProduct[]): string {
  const base = siteUrl.replace(/\/$/, '');
  const productBlocks = products.map(p => `  <url>
    <loc>${base}/products/${escapeHtml(p.id)}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${p.image ? `
    <image:image><image:loc>${escapeHtml(p.image)}</image:loc></image:image>` : ''}
  </url>`);
  const statics = staticBlocks.map(block => `  ${block.trim()}`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${[...statics, ...productBlocks].join('\n')}
</urlset>
`;
}
