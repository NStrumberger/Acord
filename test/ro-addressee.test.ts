import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGender } from '../src/ro/postedit.ts';

test('a second-person predicate agrees with the ADDRESSEE, not the speaker', () => {
  // "Esti obosit" describes the person being spoken to.
  assert.equal(applyGender('Ești obosit', 'M', 'F').text, 'Ești obosită');
  assert.equal(applyGender('Ești obosită', 'M', 'M').text, 'Ești obosit');
});

test('polite address is in scope', () => {
  // "Dumneavoastra sunteti obosita" -- 2nd person plural verb, singular adjective.
  assert.equal(applyGender('Sunteți obosit', 'M', 'F').text, 'Sunteți obosită');
});

test('the compound past distinguishes speaker from addressee', () => {
  assert.equal(applyGender('Am fost obosit', 'F', 'M').text, 'Am fost obosită');
  assert.equal(applyGender('Ai fost obosit', 'F', 'F').text, 'Ai fost obosită');
});

test('speaker and addressee are rewritten independently in one sentence', () => {
  const out = applyGender('Sunt obosit și ești obosit', 'M', 'F');
  assert.equal(out.text, 'Sunt obosit și ești obosită');
  assert.equal(out.changed.length, 1);
});

test('a third person is still left alone', () => {
  const out = applyGender('Sunt obosit și el este obosit', 'F', 'F');
  assert.equal(out.text, 'Sunt obosită și el este obosit');
});

test('omitting the addressee leaves second-person words untouched', () => {
  assert.equal(applyGender('Ești obosit', 'F').text, 'Ești obosit');
});

test('addressee can be shown in both forms too', () => {
  assert.equal(applyGender('Ești obosit', 'M', 'both').text, 'Ești obosit/obosită');
});
