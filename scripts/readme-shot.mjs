/** One tight screenshot of the real app for the README. */
import { firefox } from 'playwright';
const URL = process.env.APP_URL ?? 'https://nstrumberger.github.io/Acord/';
const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 980, height: 720 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.fill('#source', 'You are my best friend');
await page.click('label:has(input[name="speaker"][value="F"])');
await page.click('label:has(input[name="addressee"][value="F"])');
await page.click('#go');
await page.waitForFunction(() => {
  const go = document.getElementById('go');
  const out = document.getElementById('output');
  return go instanceof HTMLButtonElement && !go.disabled &&
         out?.textContent?.trim() && getComputedStyle(out).opacity === '1';
}, null, { timeout: 10 * 60_000 });
await page.waitForTimeout(200);
await page.locator('main').screenshot({ path: 'docs/screenshot.png' });
console.log('wrote docs/screenshot.png —', await page.textContent('#output'));
await browser.close();
