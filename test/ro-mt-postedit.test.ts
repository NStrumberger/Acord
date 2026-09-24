import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyGender, findGendered } from '../src/ro/postedit.ts';

const { pairs } = JSON.parse(
  readFileSync(new URL('./fixtures/mt-en-ro.json', import.meta.url), 'utf8'),
) as { pairs: Record<string, string> };

const mt = (en: string) => {
  const v = pairs[en];
  if (!v) throw new Error(`fixture missing: ${en}`);
  return v;
};

test('machine translation picks gender arbitrarily -- that is the problem', () => {
  // Same adjective, same tense, nothing in the English to choose from: the
  // model gives the speaker masculine and the addressee feminine.
  assert.match(mt('I am tired.'), /obosit\b/);
  assert.match(mt('You are tired.'), /obosită/);
});

test('post-editing normalises machine output to the speaker profile', () => {
  assert.equal(applyGender(mt('I am tired.'), 'M').text, 'Sunt obosit.');
  assert.equal(applyGender(mt('I am happy.'), 'F').text, 'Sunt fericită.');
  assert.equal(applyGender(mt('I am a lawyer.'), 'F').text, 'Sunt avocată.');
});

test('punctuation survives a rewrite', () => {
  assert.ok(applyGender(mt('I am tired.'), 'M').text.endsWith('.'));
});

test('a past-tense clause is in scope', () => {
  // "Ieri eram obosita" -- the adjective agrees with the speaker even though
  // the copula is not sentence-initial.
  assert.equal(applyGender(mt('I was tired yesterday.'), 'M').text, 'Ieri eram obosit.');
  assert.equal(applyGender(mt('I was tired yesterday.'), 'F').text, 'Ieri eram obosită.');
});

test('a second person in the sentence is NOT rewritten', () => {
  // MT gave the speaker feminine and the friend masculine. Normalising the
  // speaker to male must leave the friend alone -- this is the coreference
  // trap, and we avoid it by only claiming the first-person predicate.
  const out = applyGender(mt('I am happy and my friend is tired.'), 'F');
  assert.equal(out.text, 'Sunt fericită și prietenul meu e obosit.');
  assert.equal(out.changed.length, 1);
});

test('sentences with no first-person subject are left entirely alone', () => {
  const src = mt('My friend is a teacher.');
  assert.equal(applyGender(src, 'F').text, src);
});

test('invariable adjectives are never touched', () => {
  assert.equal(applyGender(mt('I am ready.'), 'F').text, 'Sunt gata.');
});

test('clitic word order from the model is preserved', () => {
  // The model already gets these right; post-editing must not disturb them.
  assert.equal(applyGender(mt('I saw her yesterday.'), 'M').text, 'Am văzut-o ieri.');
  assert.equal(applyGender(mt('I saw him yesterday.'), 'F').text, 'L-am văzut ieri.');
});

test('rewritten words carry their lexicon status', () => {
  // "geolog" -> "geoloagă" is a variant spelling; the user should be told.
  const out = applyGender(mt('I am a geologist.'), 'F');
  assert.equal(out.text, 'Sunt geoloagă.');
  assert.equal(out.changed[0]!.options[0]!.status, 'variant');
});

test('every gendered word is reported even when not auto-applied', () => {
  const found = findGendered(mt('I am happy and my friend is tired.'));
  assert.ok(found.length >= 2, `expected the friend's words too, got ${found.length}`);
});

test('a whole second-person predicate is corrected from real model output', () => {
  // The reported bug, end to end against what the app actually produces.
  assert.equal(
    applyGender(mt('You are my best friend.'), 'M', 'F').text,
    'Ești cea mai bună prietenă a mea.',
  );
});
