/** Does the installed app still open with no network? */
import { chromium } from 'playwright';

const URL = process.env.APP_URL ?? 'http://localhost:4173/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15000 })
  .then(() => console.log('  service worker took control'))
  .catch(() => console.log('  service worker did NOT take control'));
await page.waitForTimeout(1000);

// Revisit once while online so the hashed assets are cached by the worker,
// which is what happens the second time a real person opens the app.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);

await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
const heading = await page.textContent('h1').catch(() => null);
console.log('  offline reload ->', heading ? `shell loaded ("${heading}")` : 'FAILED');
const manifest = await page.getAttribute('link[rel=manifest]', 'href');
console.log('  manifest link ->', manifest);
await browser.close();
