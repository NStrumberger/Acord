/**
 * Regenerate the committed MT fixture from the engine the app actually uses,
 * so post-editor tests run against real output without needing the engine.
 * The engine only runs in a browser, so this drives one (see browser-mt.ts).
 */
import { writeFileSync } from 'node:fs';
import { openTranslator } from './browser-mt.ts';

const SENTENCES = [
  'I am tired.', 'I am happy.', 'I am a teacher.', 'I am a lawyer.',
  'I am a geologist.', 'I am an engineer.', 'I was tired yesterday.',
  'I saw her yesterday.', 'I saw him yesterday.',
  'I am happy and my friend is tired.',
  'My friend is a teacher.', 'I am ready.',
  'You are tired.', 'You are my best friend.',
];

const mt = await openTranslator();
const pairs = {};
try {
  const out = await mt.translate(SENTENCES);
  SENTENCES.forEach((en, i) => { pairs[en] = out[i]; });
} finally {
  await mt.close();
}

writeFileSync('test/fixtures/mt-en-ro.json', JSON.stringify({
  _model: 'Mozilla Firefox Translations en-ro (Bergamot tiny, spring 2024), through src/ro/mt.ts as the app runs it',
  _note: 'regenerate with: npm run mt:fixture',
  pairs,
}, null, 1) + '\n', 'utf8');

for (const [en, ro] of Object.entries(pairs)) console.log(`  ${en.padEnd(36)}${ro}`);
