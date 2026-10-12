/**
 * Copy Mozilla's Bergamot runtime (MPL-2.0) into public/bergamot/, so it is
 * served as plain files at a stable path.
 *
 * It cannot go through the bundler: the worker loads its emscripten glue with
 * importScripts() and fetches its .wasm relative to its own URL, and both break
 * once Vite renames and inlines them. Runs before `dev` and `build`.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const from = 'node_modules/@browsermt/bergamot-translator';
const { version } = JSON.parse(readFileSync(`${from}/package.json`, 'utf8'));
// Versioned path, so the service worker can cache it as immutable.
const to = `public/bergamot/${version}`;
mkdirSync(`${to}/worker`, { recursive: true });
cpSync(`${from}/translator.js`, `${to}/translator.js`);
for (const f of ['translator-worker.js', 'bergamot-translator-worker.js', 'bergamot-translator-worker.wasm']) {
  cpSync(`${from}/worker/${f}`, `${to}/worker/${f}`);
}
// MPL 2.0 travels with the code; the npm package ships no licence file of its own.
cpSync('licenses/MPL-2.0.txt', `${to}/LICENSE.txt`);
writeFileSync(`${to}/SOURCE.txt`,
  `Bergamot translator ${version}, MPL 2.0 (see LICENSE.txt).\n` +
  `Source: https://github.com/browsermt/bergamot-translator/tree/v${version}\n` +
  'npm: https://www.npmjs.com/package/@browsermt/bergamot-translator\n');
console.log(`bergamot ${version} -> ${to}`);
