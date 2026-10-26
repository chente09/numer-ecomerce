// Serves /sitemap.xml from the live catalog, so a new, edited or removed product shows up without a deploy.
// The CDN keeps the answer for an hour. If Firestore fails, it serves the file generated at the last build.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { environment } from '../../src/environments/environment';
import { buildLiveSitemap } from '../../scripts/lib/sitemap-live';

const SITE_URL = 'https://numer.store';

const xmlResponse = (body: string, cache: string): Response =>
  new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Netlify-CDN-Cache-Control': cache
    }
  });

export default async (): Promise<Response> => {
  try {
    const root = process.env['LAMBDA_TASK_ROOT'] ?? process.cwd();
    const staticXml = readFileSync(join(root, 'src/sitemap.xml'), 'utf8');
    const xml = await buildLiveSitemap({
      project: environment.firebaseConfig.projectId,
      apiKey: environment.firebaseConfig.apiKey,
      siteUrl: SITE_URL,
      staticXml
    });
    return xmlResponse(xml, 'public, max-age=3600, stale-while-revalidate=86400');
  } catch (error) {
    console.warn('[sitemap] serving the build copy:', error instanceof Error ? error.message : error);
    const fallback = await fetch(`${SITE_URL}/sitemap-build.xml`);
    if (!fallback.ok) return new Response('Sitemap unavailable', { status: 503 });
    return xmlResponse(await fallback.text(), 'public, max-age=60');
  }
};
