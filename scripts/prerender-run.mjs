// Bundles scripts/prerender.ts (TypeScript, imports the app's pure modules) with esbuild and runs it.
// esbuild ships with the Angular build tooling, so this needs no extra dependency and no Node flags.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const outfile = resolve('.prerender/prerender.mjs');
await build({
  entryPoints: [resolve('scripts/prerender.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile,
  logLevel: 'warning'
});
await import(pathToFileURL(outfile).href);
