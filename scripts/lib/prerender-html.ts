// Turns the built index.html into a product page that already carries its own title, description, structured data
// and readable content, so crawlers that do not run JavaScript (most AI assistants) can read it. The Angular app
// still boots on top of it and takes over, exactly as before.
import type { ProductSeo, ProductSeoSource } from '../../src/app/core/product-seo';
import { cleanText, truncateAtWord } from '../../src/app/core/product-seo';
import { resolveEffectivePrice } from '../../src/app/core/pricing';
import type { LandingContent } from '../../src/app/core/landing-pages';
import type { StaticPage } from '../../src/app/core/static-pages';
import { MAIN_LINKS } from '../../src/app/core/static-pages';

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

export function removeMeta(html: string, attr: 'name' | 'property', key: string): string {
  const re = new RegExp(`\\s*<meta\\s[^>]*?${attr}\\s*=\\s*["']${escapeRegex(key)}["'][^>]*>`, 'gi');
  return html.replace(re, '');
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
  // Keep the author's paragraphs: one long run-on block is hard to read for people and for AI assistants
  let budget = 1200;
  const paragraphs: string[] = [];
  for (const line of String(product.description ?? '').split(/\n+/)) {
    const text = cleanText(line);
    if (!text || budget <= 0) continue;
    const kept = truncateAtWord(text, budget);
    paragraphs.push(kept);
    budget -= text.length;
  }
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
      ? ` (precio regular ${money(price.originalUnitPrice)}, ${price.discountPercentage}% de descuento)` : ''} · ${inStock ? 'Disponible' : 'Disponible por encargo'}</p>`
  ];
  if (categoryNames.length) parts.push(`<p>Categoría: ${escapeHtml(categoryNames.join(', '))}</p>`);
  for (const paragraph of paragraphs) parts.push(`<p>${escapeHtml(paragraph)}</p>`);
  if (features.length) parts.push(`<h2>Características</h2>${listOf(features)}`);
  if (technologyNames.length) parts.push(`<h2>Tecnologías</h2>${listOf(technologyNames)}`);
  if (colors.length) parts.push(`<p>Colores: ${escapeHtml(colors.join(', '))}</p>`);
  if (sizes.length) parts.push(`<p>Tallas: ${escapeHtml(sizes.join(', '))}</p>`);
  if (!inStock) parts.push('<p>Sin stock por ahora: se fabrica por encargo. Escríbenos por WhatsApp para coordinar talla y color.</p>');
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
    const alt = cleanText(ctx.product.name);
    html = upsertMeta(html, 'property', 'og:image:alt', alt);
    html = upsertMeta(html, 'name', 'twitter:image:alt', alt);
    html = removeMeta(html, 'property', 'og:image:width');
    html = removeMeta(html, 'property', 'og:image:height');
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

/**
 * The <url> blocks that are not products (home, shop, about...), kept as they are in the source sitemap.
 * URLs with a query string (/shop?category=...) are filtered views whose canonical is /shop: they do not belong here.
 */
export function extractStaticBlocks(xml: string): string[] {
  return (xml.match(/<url>[\s\S]*?<\/url>/g) ?? [])
    .filter(block => !/<loc>[^<]*\/products\//.test(block))
    .filter(block => !/<loc>[^<]*\?/.test(block));
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

// ───────────────────────── Fixed pages and home ─────────────────────────

export interface ProductLink {
  id: string;
  name: string;
  price: number;
  inStock: boolean;
}

/** Links to every section: a crawler that does not run JavaScript follows these to discover the pages. */
export function renderMainNav(): string {
  const links = MAIN_LINKS.map(link => `<a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a>`).join(' · ');
  return `<nav aria-label="Secciones de la tienda">${links}</nav>`;
}

/** Every product as a plain link with its price: the way into the catalog for crawlers. */
export function renderProductList(products: ProductLink[]): string {
  if (products.length === 0) return '';
  const items = products.map(p =>
    `<li><a href="/products/${escapeHtml(p.id)}">${escapeHtml(cleanText(p.name))}</a> — ${money(p.price)}${p.inStock ? '' : ' (por encargo)'}</li>`
  ).join('');
  return `<h2>Productos</h2><ul>${items}</ul>`;
}

export interface StaticPageContext {
  siteUrl: string;
  products?: ProductLink[];
  /** The shop lists the catalog; the other pages only carry their own text and the navigation. */
  listProducts?: boolean;
}

/** A fixed page (nosotros, ubicaciones, tienda...) with its own title, description, canonical and content. */
export function renderStaticPage(template: string, page: StaticPage, ctx: StaticPageContext): string {
  const url = `${ctx.siteUrl.replace(/\/$/, '')}${page.path}`;
  let html = removeStaticBreadcrumb(template);
  html = setTitle(html, page.title);
  html = setCanonical(html, url);
  html = upsertMeta(html, 'name', 'description', page.description);
  html = upsertMeta(html, 'property', 'og:title', page.title);
  html = upsertMeta(html, 'property', 'og:description', page.description);
  html = upsertMeta(html, 'property', 'og:url', url);
  html = upsertMeta(html, 'name', 'twitter:title', page.title);
  html = upsertMeta(html, 'name', 'twitter:description', page.description);
  html = setJsonLd(html, 'breadcrumb-schema', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: ctx.siteUrl.replace(/\/$/, '') },
      { '@type': 'ListItem', position: 2, name: page.h1.split(':')[0], item: url }
    ]
  });
  const body = `<div class="loading-content"><h1>${escapeHtml(page.h1)}</h1><p>${escapeHtml(page.description)}</p>`
    + `${renderMainNav()}${ctx.listProducts ? renderProductList(ctx.products ?? []) : ''}</div>`;
  return html.replace(/<app-root[^>]*>[\s\S]*?<\/app-root>/i, () => `<app-root>${body}</app-root>`);
}

/**
 * The home page keeps its title, description and canonical (they are already the home's); it only gains the
 * links a crawler needs: the sections and every product.
 */
export function renderHomePage(template: string, ctx: StaticPageContext): string {
  // Running it again on an already generated page must not add the links twice
  const html = removeStaticBreadcrumb(template)
    .replace(/<div class="loading-content"><nav aria-label="Secciones de la tienda">[\s\S]*?<\/ul><\/div>/i, '');
  const links = `<div class="loading-content">${renderMainNav()}${renderProductList(ctx.products ?? [])}</div>`;
  return html.replace(/(<app-root[^>]*>)([\s\S]*?)(<\/app-root>)/i, (_m, open, inner, close) => `${open}${inner.trim()}${links}${close}`);
}

/** A landing page: its own tags, readable text, featured products, FAQ and structured data. */
export function renderLandingPage(template: string, content: LandingContent, ctx: { siteUrl: string }): string {
  const siteUrl = ctx.siteUrl.replace(/\/$/, '');
  let html = removeStaticBreadcrumb(template);
  html = setTitle(html, content.title);
  html = setCanonical(html, content.url);
  html = upsertMeta(html, 'name', 'description', content.description);
  html = upsertMeta(html, 'property', 'og:title', content.title);
  html = upsertMeta(html, 'property', 'og:description', content.description);
  html = upsertMeta(html, 'property', 'og:url', content.url);
  html = upsertMeta(html, 'name', 'twitter:title', content.title);
  html = upsertMeta(html, 'name', 'twitter:description', content.description);
  html = setJsonLd(html, 'breadcrumb-schema', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Tienda', item: `${siteUrl}/shop` },
      { '@type': 'ListItem', position: 3, name: 'Chompas impermeables', item: content.url }
    ]
  });
  html = setJsonLd(html, 'landing-schema', content.collectionJsonLd);
  html = setJsonLd(html, 'faq-schema', content.faqJsonLd);

  const featured = content.featured.map(f =>
    `<li><a href="/products/${escapeHtml(f.id)}">${escapeHtml(f.name)}</a> — ${money(f.price)}`
    + `${f.sizes.length ? `. Tallas: ${escapeHtml(f.sizes.join(', '))}` : ''}`
    + `${f.colors.length ? `. Colores: ${escapeHtml(f.colors.join(', '))}` : ''}`
    + `${f.highlights.length ? `<ul>${f.highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul>` : ''}</li>`
  ).join('');
  const body = `<div class="loading-content"><h1>${escapeHtml(content.h1)}</h1>`
    + content.intro.map(p => `<p>${escapeHtml(p)}</p>`).join('')
    + (featured ? `<h2>Chompas disponibles</h2><ul>${featured}</ul>` : '')
    + `<h2>Cómo elegir una chompa impermeable</h2>`
    + content.guide.map(g => `<h3>${escapeHtml(g.heading)}</h3><p>${escapeHtml(g.text)}</p>`).join('')
    + `<h2>Preguntas frecuentes</h2>`
    + content.faqs.map(f => `<h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p>`).join('')
    + `<nav aria-label="Más información">${content.links.map(l => `<a href="${escapeHtml(l.path)}">${escapeHtml(l.label)}</a>`).join(' · ')}</nav>`
    + `${renderMainNav()}</div>`;
  return html.replace(/<app-root[^>]*>[\s\S]*?<\/app-root>/i, () => `<app-root>${body}</app-root>`);
}
