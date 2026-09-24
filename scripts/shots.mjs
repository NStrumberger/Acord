// Visual check in the engine the user actually runs. Screenshots the app at
// the breakpoints web/testing.md asks for, in both themes.
import { firefox } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.APP_URL ?? 'http://localhost:5173/';
const SIZES = [[390, 900, 'phone'], [768, 1000, 'tablet'], [1440, 1000, 'desktop']];
const SENTENCE = 'I am tired and you are my best friend';

mkdirSync('shots', { recursive: true });
const browser = await firefox.launch();

for (const scheme of ['light', 'dark']) {
  for (const [width, height, name] of SIZES) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: scheme });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `shots/${scheme}-${name}-empty.png` });

    await page.fill('#source', SENTENCE);
    // Click the visible segment, as a person would, then assert the radio
    // actually changed -- that is the behaviour worth verifying.
    for (const group of ['speaker', 'addressee']) {
      await page.click(`label:has(input[name="${group}"][value="F"])`);
      const on = await page.isChecked(`input[name="${group}"][value="F"]`);
      if (!on) throw new Error(`clicking the ${group} segment did not select it`);
    }
    await page.click('#go');
    // Wait for the UI to settle: request finished, button re-enabled, and the
    // enter animation played out. Screenshotting earlier catches a blank pane.
    await page.waitForFunction(() => {
      const go = document.getElementById('go');
      const out = document.getElementById('output');
      return go instanceof HTMLButtonElement && !go.disabled &&
             out?.textContent?.trim() && getComputedStyle(out).opacity === '1';
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `shots/${scheme}-${name}-result.png` });

    if (name === 'desktop') {
      console.log(`${scheme}: ${await page.textContent('#output')}`);
      console.log(`${scheme}: ${await page.textContent('#meta')}`);
    }
    if (errors.length) console.log(`  console errors [${scheme}/${name}]:`, errors.slice(0, 3));
    await page.close();
  }
}

// Feature support in THIS engine, not in general.
const probe = await browser.newPage();
const support = await probe.evaluate(() => ({
  'text-wrap: pretty': CSS.supports('text-wrap', 'pretty'),
  'text-wrap: balance': CSS.supports('text-wrap', 'balance'),
  'backdrop-filter': CSS.supports('backdrop-filter', 'blur(4px)'),
  'underline wavy': CSS.supports('text-decoration', 'underline wavy red'),
  '100dvh': CSS.supports('height', '100dvh'),
}));
console.log('\nFirefox support:', support);
await browser.close();
