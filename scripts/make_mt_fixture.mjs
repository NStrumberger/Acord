/**
 * Regenerate the committed MT fixture from the model the app actually uses,
 * so post-editor tests run against real output without needing the model.
 */
import { writeFileSync } from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';
import { normalizeRomanian } from '../src/ro/normalize.ts';

env.cacheDir = './data/raw/hf-cache';

const SENTENCES = [
  'I am tired.', 'I am happy.', 'I am a teacher.', 'I am a lawyer.',
  'I am a geologist.', 'I am an engineer.', 'I was tired yesterday.',
  'I saw her yesterday.', 'I saw him yesterday.',
  'I am happy and my friend is tired.',
  'My friend is a teacher.', 'I am ready.',
  'You are tired.', 'You are my best friend.',
];

const translate = await pipeline('translation', 'Xenova/opus-mt-en-ro', { dtype: 'q8' });
// One at a time: batching this model through transformers.js produces
// degenerate output (long runs of trailing full stops).
const pairs = {};
for (const en of SENTENCES) {
  const [out] = await translate(en);
  pairs[en] = normalizeRomanian(out.translation_text);
}

writeFileSync('test/fixtures/mt-en-ro.json', JSON.stringify({
  _model: 'Xenova/opus-mt-en-ro (q8), the model the app runs in the browser',
  _note: 'regenerate with: npm run mt:fixture',
  pairs,
}, null, 1) + '\n', 'utf8');

for (const [en, ro] of Object.entries(pairs)) console.log(`  ${en.padEnd(36)}${ro}`);
