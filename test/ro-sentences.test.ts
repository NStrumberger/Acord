import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences } from '../src/ro/mt.ts';

test('sentences are separated so the model sees them one at a time', () => {
  // opus-mt is sentence-level: given three at once it splices the first two
  // with a comma and drops the third. "Hello. How are you? I am well." came
  // back as "- Bună, ce mai faci?".
  assert.deepEqual(splitSentences('I am tired. My friend is happy.'),
    ['I am tired.', 'My friend is happy.']);
  assert.deepEqual(splitSentences('Hello. How are you? I am well.'),
    ['Hello.', 'How are you?', 'I am well.']);
  assert.deepEqual(splitSentences('Stop! Look at this.'), ['Stop!', 'Look at this.']);
});

test('terminal punctuation is kept, because the translation needs it too', () => {
  assert.deepEqual(splitSentences('One. Two! Three?'), ['One.', 'Two!', 'Three?']);
});

test('a single sentence is left exactly as it is', () => {
  const one = 'Maya is my friend, although Steve is tired, Rose works as a teacher';
  assert.deepEqual(splitSentences(one), [one]);
  assert.deepEqual(splitSentences('I am tired.'), ['I am tired.']);
});

test('an abbreviation is not the end of a sentence', () => {
  assert.deepEqual(splitSentences('Dr. Popescu is my friend.'),
    ['Dr. Popescu is my friend.']);
  assert.deepEqual(splitSentences('I saw Mr. Ionescu. He is tired.'),
    ['I saw Mr. Ionescu.', 'He is tired.']);
  assert.deepEqual(splitSentences('J. R. Tolkien is a writer.'),
    ['J. R. Tolkien is a writer.']);
});

test('empty and whitespace-only input yields nothing to translate', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('   '), []);
  assert.deepEqual(splitSentences('.  '), ['.']);
});
