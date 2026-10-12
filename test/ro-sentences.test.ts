import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareEnglish, dropDialogueDashes } from '../src/ro/mt.ts';

test('a title loses its full stop, so the model does not end the sentence there', () => {
  // "Mrs. Smith" came back as "Doamna. Smith"; "Mrs Smith" as "Doamna Smith".
  assert.equal(prepareEnglish('Mrs. Smith is a lawyer.'), 'Mrs Smith is a lawyer.');
  assert.equal(prepareEnglish('I saw Mr. Ionescu and Ms. Kim.'), 'I saw Mr Ionescu and Ms Kim.');
  assert.equal(prepareEnglish('Dr. Popescu is my friend.'), 'Dr Popescu is my friend.');
  assert.equal(prepareEnglish('Prof. Ionescu is tired.'), 'Prof Ionescu is tired.');
});

test('a full stop that really ends a sentence is kept', () => {
  assert.equal(prepareEnglish('I am a teacher. Mrs is a title.'), 'I am a teacher. Mrs is a title.');
  assert.equal(prepareEnglish('I like Mrs. smith.'), 'I like Mrs. smith.');
});

test('a dialogue dash before a sentence is removed', () => {
  assert.equal(dropDialogueDashes('- Cum ești?'), 'Cum ești?');
  assert.equal(dropDialogueDashes('Bună ziua. - Cum ești?'), 'Bună ziua. Cum ești?');
  assert.equal(dropDialogueDashes('Bună ziua! – Cum ești?'), 'Bună ziua! Cum ești?');
});

test('a dash the source itself starts with is kept', () => {
  // Found by review: a list item the user typed is not a subtitle dash.
  assert.equal(dropDialogueDashes('- Cumpără pâine.', '- Buy bread.'), '- Cumpără pâine.');
  assert.equal(dropDialogueDashes('- Cum ești?', 'How are you?'), 'Cum ești?');
});

test('a dash inside a sentence or a word is kept', () => {
  assert.equal(dropDialogueDashes('Sunt bucătar-șef.'), 'Sunt bucătar-șef.');
  assert.equal(dropDialogueDashes('E frumos - foarte frumos.'), 'E frumos - foarte frumos.');
  assert.equal(dropDialogueDashes('Am văzut-o ieri.'), 'Am văzut-o ieri.');
});
