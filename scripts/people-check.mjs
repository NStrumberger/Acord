// The per-person rows are DOM wiring, so unit tests cannot reach them. This
// drives the real flow: translate a sentence naming two people, check a row
// appears for each, set one of them, and check only that person's words moved.
//
// A persistent profile keeps the ~113 MB model between runs.
import { firefox } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.APP_URL ?? 'http://localhost:5173/';
const EN = 'Josh is my friend and Maya is also my friend';

mkdirSync('shots', { recursive: true });
const ctx = await firefox.launchPersistentContext(join(tmpdir(), 'acord-playwright-ff'), {
  viewport: { width: 1440, height: 1000 },
});
const page = ctx.pages()[0] ?? await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const settled = () => page.waitForFunction(() => {
  const go = document.getElementById('go');
  const out = document.getElementById('output');
  return go instanceof HTMLButtonElement && !go.disabled &&
         out?.textContent?.trim() && getComputedStyle(out).opacity === '1';
}, null, { timeout: 180_000 }).catch(async (e) => {
  console.log('meta:', await page.textContent('#meta'));
  console.log('errors:', errors.slice(0, 5));
  throw e;
});

const rows = () => page.$$eval('.row-person', (els) =>
  els.map((el) => ({
    name: el.querySelector('.row-label')?.textContent,
    set: el.querySelector('input:checked')?.value ?? '',
  })));

// Start from nothing chosen, so a previous run cannot make the check pass.
// The service worker is cache-first and the profile is reused, so it would
// otherwise serve the PREVIOUS run's JavaScript. Its shell cache goes; the
// transformers model cache stays, which is the point of a persistent profile.
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  localStorage.clear();
  const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
  await Promise.all(regs.map((r) => r.unregister()));
  for (const key of await caches.keys()) {
    if (key.startsWith('gendered-translator')) await caches.delete(key);
  }
});
await page.reload({ waitUntil: 'networkidle' });
await page.fill('#source', EN);
await page.click('#go');
await settled();

console.log('output:', (await page.textContent('#output')).trim());
console.log('rows:  ', JSON.stringify(await rows()));
await page.screenshot({ path: 'shots/people-desktop.png' });

const start = await rows();
// Two named people replace the catch-all row entirely.
if (!await page.isHidden('#generalRow')) throw new Error('"Anyone else" should be gone');
if (start.map((r) => r.name).join(',') !== 'Josh,Maya') {
  throw new Error(`expected Josh,Maya rows; got ${JSON.stringify(start)}`);
}
if (start.some((r) => r.set)) throw new Error('rows should start with no override');
const before = (await page.textContent('#output')).trim();
if (!/Josh este prietenul meu/.test(before)) throw new Error(`unexpected start: ${before}`);

// Set Josh alone to feminine: his words must move, Maya's must not.
await page.click('.row-person:has(.row-label:text-is("Josh")) label:has(input[value="F"])');
await settled();
const after = (await page.textContent('#output')).trim();
console.log('Josh -> Feminine:', after);
if (!/prietena mea și Maya/.test(after)) throw new Error(`Josh was not rewritten: ${after}`);
if (!/prietena mea\.?$/.test(after)) throw new Error(`Maya should be untouched: ${after}`);

// A name is not a person: the Josh in the next sentence need not be this one,
// so the choice must NOT carry over -- not to new text, and not across a reload.
const previous = await page.textContent('#output');
await page.fill('#source', 'Josh is tired and Maya is happy.');
await page.click('#go');
// Wait for the NEW result: the old one is already settled, so settled() alone
// would return before the click had done anything.
await page.waitForFunction((was) => document.getElementById('output')?.textContent !== was,
  previous, { timeout: 180_000 });
await settled();
const next = await rows();
console.log('new sentence:', JSON.stringify(next));
if (next.some((r) => r.set)) throw new Error(`choice carried into new text: ${JSON.stringify(next)}`);

await page.setViewportSize({ width: 390, height: 900 });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.fill('#source', EN);
await page.click('#go');
await settled();
const reloaded = await rows();
console.log('after reload:', JSON.stringify(reloaded));
if (reloaded.some((r) => r.set)) {
  throw new Error(`choice survived a reload: ${JSON.stringify(reloaded)}`);
}
await page.screenshot({ path: 'shots/people-phone.png' });

// The reported case: four names, only the first of which the Romanian marks.
// Every one of them must still be listed.
await page.setViewportSize({ width: 900, height: 900 });
const before4 = await page.textContent('#output');
await page.fill('#source', 'Maya is my friend and so is Steve, so is Rose and Henry');
await page.click('#go');
await page.waitForFunction((was) => document.getElementById('output')?.textContent !== was,
  before4, { timeout: 180_000 });
await settled();
const many = await page.$$eval('.row-person', (els) => els.map((el) => ({
  name: el.querySelector('.row-label')?.textContent,
  inert: el.classList.contains('row-inert'),
})));
console.log('four names:', JSON.stringify(many));
await page.screenshot({ path: 'shots/people-many.png' });
if (many.map((r) => r.name).join(',') !== 'Maya,Steve,Rose,Henry') {
  throw new Error(`expected all four names; got ${JSON.stringify(many)}`);
}
if (many.filter((r) => r.inert).length !== 3) throw new Error('three should be inert');

if (errors.length) console.log('console errors:', errors.slice(0, 5));
console.log('OK');
await ctx.close();
