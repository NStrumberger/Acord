/**
 * Does a deploy actually reach somebody who already has the app installed?
 *
 * The first service worker was cache-first with no revalidation, so it did not:
 * a returning visitor kept an index.html pointing at hashed assets from an
 * older build, forever. This serves `dist/` itself, changes the page underneath
 * an installed worker, and checks the change arrives.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/** Swapped mid-test to stand in for a deploy. */
let marker = 'BEFORE';

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = path === '/' || path === '\\' ? 'index.html' : path.replace(/^[\\/]+/, '');
  try {
    let body = await readFile(join('dist', file));
    if (file === 'index.html') body = Buffer.from(String(body).replace('<h1>Acord</h1>', `<h1>${marker}</h1>`));
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage();
const heading = () => page.textContent('h1');

await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForFunction(() => navigator.serviceWorker?.controller !== null,
  null, { timeout: 15_000 });
console.log('  worker in control, page says:', await heading());

// The deploy.
marker = 'AFTER';

// First reload is answered from cache while the worker refetches underneath:
// instant, one version behind. The reload after that must be current.
await page.reload({ waitUntil: 'networkidle' });
console.log('  reload 1 (served from cache, refetching):', await heading());
await page.waitForTimeout(600);
await page.reload({ waitUntil: 'networkidle' });
const after = await heading();
console.log('  reload 2 (should be the new build):', after);
if (after !== 'AFTER') {
  throw new Error(`a deploy never reached the installed app: still "${after}"`);
}

// And the old cache must be gone, so a stale policy cannot outlive its fix.
const caches_ = await page.evaluate(() => caches.keys());
console.log('  caches:', JSON.stringify(caches_));
if (caches_.includes('gendered-translator-v1')) throw new Error('v1 cache was not cleared');

// Offline still works, which is the whole reason the worker exists.
await page.context().setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
console.log('  offline reload ->', await heading());
if (await heading() !== 'AFTER') throw new Error('offline shell is missing or stale');

console.log('OK');
await browser.close();
server.close();
