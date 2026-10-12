import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGender, type Target } from '../src/ro/postedit.ts';
import { tidyRomanian } from '../src/ro/tidy.ts';

/**
 * Regressions from the R12 engine swap. Each Romanian input is real Bergamot
 * output, which reaches the post-editor through tidyRomanian (see mt.ts);
 * see notes/R12-reverse-spike.md.
 */
const run = (ro: string, en: string, speaker: Target, other?: Target) =>
  applyGender(tidyRomanian(ro), speaker, other, { source: en }).text;

test('"they" written as masculine "ei" still follows the setting', () => {
  assert.equal(run('Ei sunt barmani.', 'They are bartenders.', 'M', 'F'), 'Sunt barmanițe.');
  assert.equal(run('Ei sunt muzicieni.', 'They are musicians.', 'M', 'F'), 'Sunt muziciene.');
  assert.equal(run('Ei sunt vecinii noștri.', 'They are our neighbours.', 'F', 'F'), 'Sunt vecinele noastre.');
});

test('the stiff "Eu sunt un/o …" reaches the post-editor in its plain form', () => {
  assert.equal(run('Eu sunt un contabil.', 'I am an accountant.', 'F'), 'Sunt contabilă.');
  assert.equal(run('Fratele meu este un contabil.', 'My brother is an accountant.', 'M', 'M'),
    'Fratele meu este contabil.');
});

test('the model already guessing feminine is corrected for a man', () => {
  assert.equal(run('Sunt obosită.', 'I am tired.', 'M'), 'Sunt obosit.');
  assert.equal(run('Eu sunt profesoară.', 'I am a teacher.', 'M'), 'Sunt profesor.');
});
