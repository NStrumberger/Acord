import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGender } from '../src/ro/postedit.ts';

test('a name in the sentence does not override the selection', () => {
  // Reported bug: the model infers gender from "Maya" or "Josh" and the user's
  // choice was ignored, because a third-person clause was left untouched.
  assert.equal(applyGender('Maya e prietena mea.', 'M', 'M').text, 'Maya e prietenul meu.');
  assert.equal(applyGender('Josh este prietenul meu.', 'M', 'F').text, 'Josh este prietena mea.');
});

test('with the other person not set, the model output is left alone', () => {
  // The one case where the name still decides: we were told nothing better.
  assert.equal(applyGender('Maya e prietena mea.', 'M').text, 'Maya e prietena mea.');
  assert.equal(applyGender('Josh este prietenul meu.', 'F').text, 'Josh este prietenul meu.');
});

test('the speaker clause is still governed by the speaker', () => {
  assert.equal(
    applyGender('Sunt obosit și Maya e prietena mea.', 'F', 'M').text,
    'Sunt obosită și Maya e prietenul meu.',
  );
});

test('second and third person share the one setting', () => {
  assert.equal(applyGender('Ești prietenul meu.', 'M', 'F').text, 'Ești prietena mea.');
  assert.equal(applyGender('Maya e prietena mea.', 'M', 'F').text, 'Maya e prietena mea.');
});

test('avoiding gender still applies to the other person', () => {
  assert.equal(applyGender('Maya e profesor.', 'M', 'both').text, 'Maya e profesor/profesoară.');
});
