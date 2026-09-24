import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGender } from '../src/ro/postedit.ts';

test('avoiding gender replaces the clause with a gender-free verb', () => {
  // A Romanian present-tense verb carries no gender at all, so this sidesteps
  // the choice rather than doubling it.
  assert.equal(applyGender('Sunt profesor', 'avoid').text, 'Predau');
  assert.equal(applyGender('Sunt profesor.', 'avoid').text, 'Predau.');
});

test('it works for the person being addressed too', () => {
  assert.equal(applyGender('Ești profesor', 'M', 'avoid').text, 'Predai');
});

test('it falls back to both forms when no paraphrase exists, and says so', () => {
  const noVerb = applyGender('Sunt avocat', 'avoid');
  assert.equal(noVerb.text, 'Sunt avocat/avocată');
  assert.equal(noVerb.fellBack, true);

  // Adjectives have no gender-free equivalent that keeps the meaning.
  const adjective = applyGender('Sunt obosit', 'avoid');
  assert.equal(adjective.text, 'Sunt obosit/obosită');
  assert.equal(adjective.fellBack, true);
});

test('a successful paraphrase does not report a fallback', () => {
  assert.equal(applyGender('Sunt profesor', 'avoid').fellBack, false);
});

test('only the avoided clause is replaced', () => {
  assert.equal(
    applyGender('Sunt profesor și prietenul meu e avocat', 'avoid').text,
    'Predau și prietenul meu e avocat',
  );
});

test('avoiding for one person leaves the other alone', () => {
  assert.equal(
    applyGender('Sunt profesor și ești obosit', 'avoid', 'F').text,
    'Predau și ești obosită',
  );
});
