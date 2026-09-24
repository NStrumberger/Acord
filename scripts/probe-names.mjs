import { pipeline, env } from '@huggingface/transformers';
import { normalizeRomanian } from '../src/ro/normalize.ts';
import { applyGender } from '../src/ro/postedit.ts';
env.cacheDir = './data/raw/hf-cache';
const t = await pipeline('translation', 'Xenova/opus-mt-en-ro', { dtype: 'q8' });
const say = async (en) => normalizeRomanian((await t(en))[0].translation_text);

const NAMES = ['Alex', 'Sam', 'Jordan', 'Robin', 'Andrea', 'Maya', 'Josh'];
console.log('What the model guesses, with nothing in the English to go on:\n');
for (const n of NAMES) {
  const ro = await say(`${n} is my friend`);
  const guess = /prietena/.test(ro) ? 'feminine' : /prietenul/.test(ro) ? 'masculine' : '?';
  const forced = applyGender(ro, 'M', 'F').text;
  console.log(`  ${n.padEnd(8)} ${ro.padEnd(34)} model guessed ${guess}`);
  console.log(`  ${''.padEnd(8)} you choose feminine -> ${forced}`);
}
