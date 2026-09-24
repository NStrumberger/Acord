/**
 * Render the app icon to PNG at the sizes iOS and Android ask for.
 * The mark is "ă" -- the Romanian letter that carries the gender this whole
 * app exists to get right -- over the accent blue.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SIZES = [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],   // iOS home screen
];

const page = (size, radius) => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${size}px;height:${size}px}
  .i{width:${size}px;height:${size}px;border-radius:${radius}px;
     background:linear-gradient(160deg,#3a9bff,#0063d1);
     display:grid;place-items:center;
     font:600 ${size * 0.62}px/1 -apple-system,'Segoe UI',system-ui,sans-serif;
     color:#fff;letter-spacing:-.04em}
  span{transform:translateY(-${size * 0.03}px)}
</style><div class="i"><span>ă</span></div>`;

mkdirSync('public', { recursive: true });
const browser = await chromium.launch();
for (const [path, size] of SIZES) {
  const p = await browser.newPage({ viewport: { width: size, height: size },
                                    deviceScaleFactor: 1 });
  // iOS masks the touch icon itself, so that one is drawn square.
  await p.setContent(page(size, path.includes('apple') ? 0 : Math.round(size * 0.22)));
  await p.screenshot({ path, omitBackground: true });
  console.log(`  ${path} (${size}px)`);
  await p.close();
}
await browser.close();
