import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRomanian } from '../src/ro/normalize.ts';

test('legacy cedilla letters become the correct comma-below ones', () => {
  // Marian-family models emit s-cedilla (U+015F) and t-cedilla (U+0163).
  // Correct Romanian, and our whole lexicon, uses U+0219 and U+021B.
  assert.equal(normalizeRomanian('\u015Fi e\u015Fti'), 'și ești');
  assert.equal(normalizeRomanian('obosi\u0163'), 'obosiț');
  assert.equal(normalizeRomanian('\u015E\u0163'), 'Șț');
});

test('correct text passes through untouched', () => {
  const good = 'Sunt obosită și tu ești cea mai bună prietenă a mea.';
  assert.equal(normalizeRomanian(good), good);
});

test('unnormalised output would silently miss the lexicon', () => {
  // The point of this function: without it every lookup on a word containing
  // s or t fails quietly, producing no gender correction and no error.
  assert.notEqual('e\u015Fti', 'ești');
  assert.equal(normalizeRomanian('e\u015Fti'), 'ești');
});
