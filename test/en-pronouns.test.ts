import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixPronouns, swapPronouns } from '../src/en/pronouns.ts';
import { detectGender } from '../src/ro/detect.ts';

const fix = (ro: string, en: string) => fixPronouns(en, detectGender(ro, en));

test('swaps every form of the pronoun, keeping capitals', () => {
  assert.equal(swapPronouns('He said he would bring his book himself.', 'F').text,
    'She said she would bring her book herself.');
  assert.equal(swapPronouns('She did it herself; the book is hers.', 'M').text,
    'He did it himself; the book is his.');
});

test('"her" is never turned masculine: "him" or "his" cannot be told apart', () => {
  for (const text of ['I gave her flowers.', 'I told her I was late.', 'I called her mother.', 'She saw her.']) {
    const out = swapPronouns(text, 'M');
    assert.equal(out.text, text);
    assert.deepEqual(out.changed, []);
  }
});

test('"his" is "her" before a noun and "hers" on its own', () => {
  assert.equal(swapPronouns('His car is his and nobody else\'s.', 'F').text,
    'Her car is hers and nobody else\'s.');
  assert.equal(swapPronouns('The book is his.', 'F').text, 'The book is hers.');
});

test('capitals are kept, all-caps included', () => {
  assert.equal(swapPronouns('HE IS TIRED.', 'F').text, 'SHE IS TIRED.');
});

test('marks each changed word', () => {
  const out = swapPronouns('He is tired.', 'F');
  assert.deepEqual(out.changed, [{ index: 0, from: 'He', to: 'She' }]);
});

test('the dropped subject\'s gender in the Romanian corrects the English guess', () => {
  assert.equal(fix('E obosită.', 'He is tired.').text, 'She is tired.');
  assert.equal(fix('E obosită și mașina ei e stricată.', "He's tired and his car is broken.").text,
    "She's tired and her car is broken.");
  assert.equal(fix('E obosit.', "She's tired.").text, "He's tired.");
  // A masculine job title is said of women too, so it proves nothing.
  assert.equal(fix('E profesor.', "She's a teacher.").text, "She's a teacher.");
});

test('leaves the English alone when it already agrees', () => {
  const out = fix('E obosită.', 'She is tired.');
  assert.equal(out.text, 'She is tired.');
  assert.deepEqual(out.changed, []);
});

test('leaves it alone when the pronoun could be someone else', () => {
  // Two pronoun families: two people, and we cannot tell which is which.
  assert.equal(fix('Spune că e obosită.', 'He says she is tired.').text, 'He says she is tired.');
  // The brother may be the "he".
  assert.equal(fix('Fratele meu spune că e obosită.', 'My brother says he is tired.').text,
    'My brother says he is tired.');
  // Nothing in the Romanian shows a gender.
  assert.equal(fix('E acasă.', 'He is at home.').text, 'He is at home.');
  // The Romanian disagrees with itself.
  assert.equal(fix('E obosită. E obosit.', 'He is tired. He is tired.').text, 'He is tired. He is tired.');
});

test('"his" and "her" are not touched for "I" and "you"', () => {
  assert.equal(fix('Sunt obosită.', "I'm tired.").text, "I'm tired.");
});
