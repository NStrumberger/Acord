/**
 * The translation engine only runs in a browser (its worker is WebAssembly
 * loaded with importScripts, and Node trips over its Windows paths). So
 * scripts that need machine translation start Vite and a headless browser and
 * call the app's own src/ro/mt.ts inside the page: the exact code a visitor
 * runs, prepareEnglish and normalizeRomanian included.
 *
 *   const mt = await openTranslator();
 *   const [ro] = await mt.translate(['I am tired.']);
 *   await mt.close();
 */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import type { Pair } from '../src/ro/mt.ts';

export type BrowserTranslator = {
  translate(lines: string[], pair?: Pair): Promise<string[]>;
  close(): Promise<void>;
};

export async function openTranslator(): Promise<BrowserTranslator> {
  // Same step `npm run dev` runs first: the runtime must be in public/.
  execFileSync(process.execPath, ['scripts/vendor-bergamot.mjs'], { stdio: 'ignore' });
  const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('vite did not report a local URL');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  return {
    translate: (lines, pair = 'en-ro') => page.evaluate(async ([lines, pair]) => {
      // A URL the page resolves through Vite, not a path the type checker can follow.
      const path = '/src/ro/mt.ts';
      const mt = await import(/* @vite-ignore */ path) as typeof import('../src/ro/mt.ts');
      return mt.translate(lines, undefined, pair);
    }, [lines, pair] as const),
    async close() {
      await browser.close();
      await server.close();
    },
  };
}
