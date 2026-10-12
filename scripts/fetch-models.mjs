/**
 * Download Mozilla's Firefox Translations models (Bergamot, MPL-2.0) that the
 * app serves itself, and pin their hashes in src/ro/models.json.
 *
 * The files are kept gzipped: that is how Mozilla publishes them, and the app
 * unpacks them in the browser (mt.ts), so a visitor downloads ~15 MB per
 * direction instead of ~22 MB. Model versions are fixed here, not looked up at
 * run time, so a new upstream release can never change Acord's output unseen.
 *
 *   node scripts/fetch-models.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const BUCKET = 'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data';

/** Mozilla's registry entries, spring-2024 "tiny" release (see notes/R12). */
const MODELS = {
  'en-ro': { dir: 'models/en-ro/spring-2024_Ov3G4D_DRJa-4qTlILkPhg/exported', code: 'enro',
    modelHash: 'aa98c415e5beb1c5ee2f7d2508a3bbba949be223d7d9e5e1788ad0ae8598dda5' },
  'ro-en': { dir: 'models/ro-en/spring-2024_RwH0W_MDRK2BmZA6VzAmBg/exported', code: 'roen',
    modelHash: 'e7542557fc6dbafacddae7b48e67fcdb07bd67b3fb55a76139edf366eca5dbdb' },
};

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const registry = {};
for (const [pair, { dir, code, modelHash }] of Object.entries(MODELS)) {
  // The release id goes into the path, so a newer model gets a new URL and the
  // service worker can keep these cached forever (sw.js, isImmutable).
  const release = dir.split('/')[2];
  mkdirSync(`public/models/${pair}/${release}`, { recursive: true });
  const files = {
    model: `model.${code}.intgemm.alphas.bin`,
    lex: `lex.50.50.${code}.s2t.bin`,
    vocab: `vocab.${code}.spm`,
  };
  registry[pair] = {};
  for (const [part, name] of Object.entries(files)) {
    const response = await fetch(`${BUCKET}/${dir}/${name}.gz`);
    if (!response.ok) throw new Error(`${pair} ${name}: HTTP ${response.status}`);
    const gz = Buffer.from(await response.arrayBuffer());
    const raw = gunzipSync(gz);
    const hash = sha256(raw);
    // Mozilla publishes the model's hash; the other two are pinned on first download.
    if (part === 'model' && hash !== modelHash) throw new Error(`${pair} model hash ${hash} != registry ${modelHash}`);
    writeFileSync(`public/models/${pair}/${release}/${name}.gz`, gz);
    registry[pair][part] = { name: `${release}/${name}.gz`, size: raw.length, gzSize: gz.length, sha256: hash };
    console.log(`${pair} ${part.padEnd(5)} ${(gz.length / 1e6).toFixed(1)} MB gz, ${(raw.length / 1e6).toFixed(1)} MB`);
  }
}

writeFileSync('src/ro/models.json', JSON.stringify({
  _source: 'Mozilla Firefox Translations (Bergamot) models, MPL-2.0. Regenerate with: npm run models:fetch',
  ...registry,
}, null, 1) + '\n', 'utf8');
