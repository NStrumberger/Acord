/**
 * Feasibility check for iOS: WebKit is the engine Safari uses on iPhone and
 * iPad, and it has tighter WASM memory limits than Chromium. If a ~113 MB
 * model cannot be loaded and run here, the in-browser plan does not work on
 * the devices this app is for.
 */
import { webkit } from 'playwright';

const URL = process.env.APP_URL ?? 'http://localhost:4173/';
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.fill('#source', 'I am tired and you are my best friend');
await page.click('label:has(input[name="speaker"][value="F"])');
await page.click('label:has(input[name="addressee"][value="F"])');

const started = Date.now();
await page.click('#go');
try {
  await page.waitForFunction(
    () => document.getElementById('output')?.textContent?.trim(),
    null, { timeout: 15 * 60_000 },
  );
  console.log(`translated in WebKit after ${((Date.now() - started) / 1000).toFixed(0)}s (cold, includes model download)`);
  console.log('output:', await page.textContent('#output'));
  await page.screenshot({ path: 'shots/webkit-phone-result.png' });
} catch {
  console.log('FAILED in WebKit after', ((Date.now() - started) / 1000).toFixed(0), 's');
  console.log('status line:', await page.textContent('#meta'));
}
if (errors.length) console.log('errors:', [...new Set(errors)].slice(0, 5));
await browser.close();
