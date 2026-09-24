import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFormIndex, findGendered, applyGender } from '../src/ro/postedit.ts';

test('the index pairs each gendered form with its counterpart in the SAME cell', () => {
  const ix = buildFormIndex();
  const defArticle = ix.get('profesorul') ?? [];
  assert.ok(defArticle.some((f) => f.counterpart === 'profesoara'),
    'definite masculine should pair with definite feminine, not the bare lemma');
  const bare = ix.get('profesor') ?? [];
  assert.ok(bare.some((f) => f.counterpart === 'profesoară'));
});

test('adjective forms pair by number', () => {
  const ix = buildFormIndex();
  assert.ok((ix.get('obosit') ?? []).some((f) => f.counterpart === 'obosită'));
  assert.ok((ix.get('obosiți') ?? []).some((f) => f.counterpart === 'obosite'));
});

test('invariable forms are not offered as flippable', () => {
  // "mare" is identical in both genders; offering a flip would be noise.
  const ix = buildFormIndex();
  assert.equal(ix.has('mare'), false);
  assert.equal(ix.has('gata'), false);
});

test('gendered words in machine output are found with their position', () => {
  const found = findGendered('Sunt obosit astăzi');
  assert.equal(found.length, 1);
  assert.equal(found[0]!.token, 'obosit');
  assert.equal(found[0]!.index, 1);
});

test('applying the profile rewrites a first-person predicate', () => {
  assert.equal(applyGender('Sunt obosit', 'F').text, 'Sunt obosită');
  assert.equal(applyGender('Sunt profesor', 'F').text, 'Sunt profesoară');
  assert.equal(applyGender('Sunt obosită', 'M').text, 'Sunt obosit');
});

test('words that do not agree with the speaker are LEFT ALONE', () => {
  // This is the coreference trap. "el este obosit" describes someone else;
  // rewriting it to match the speaker's profile would be plainly wrong.
  const out = applyGender('Sunt obosit și el este obosit', 'F');
  assert.equal(out.text, 'Sunt obosită și el este obosit');
  assert.equal(out.changed.length, 1);
});

test('unrecognised words pass through untouched', () => {
  const src = 'Merg la magazin cu bicicleta';
  assert.equal(applyGender(src, 'F').text, src);
});

test('capitalisation is preserved when a word is rewritten', () => {
  assert.equal(applyGender('Obosit sunt', 'F').text, 'Obosit sunt'); // not a predicate position
  const out = applyGender('Sunt Obosit', 'F');
  assert.equal(out.text, 'Sunt Obosită');
});

test('candidates outside the auto-apply scope are still reported for review', () => {
  // The UI can offer these as clickable; we simply refuse to guess for them.
  const out = applyGender('Sunt obosit și el este obosit', 'F');
  assert.ok(out.candidates.length >= 2, 'both gendered words should be surfaced');
  assert.equal(out.candidates.filter((c) => c.autoApplied).length, 1);
});

test('"show both" renders a doublet, always masculine first', () => {
  // Romanian has only two agreement classes, so there is no third form to
  // generate. Showing both is the honest option -- never an invented one.
  assert.equal(applyGender('Sunt obosit', 'both').text, 'Sunt obosit/obosită');
  assert.equal(applyGender('Sunt obosită', 'both').text, 'Sunt obosit/obosită');
  assert.equal(applyGender('Sunt profesor', 'both').text, 'Sunt profesor/profesoară');
});

test('"show both" respects the same scope as a gendered profile', () => {
  const out = applyGender('Sunt obosit și el este obosit', 'both');
  assert.equal(out.text, 'Sunt obosit/obosită și el este obosit');
});

test('"show both" never invents a non-form', () => {
  for (const src of ['Sunt obosit', 'Sunt profesor', 'Sunt avocat']) {
    assert.doesNotMatch(applyGender(src, 'both').text, /[@*]/);
  }
});
