import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGender } from '../src/ro/postedit.ts';

test('the whole predicate agrees, not just the word after the copula', () => {
  // Reported bug: "You're my best friend" to a woman. Five words must change
  // (cel, bun, prieten, al, meu) and the old adjacent-token rule caught none.
  assert.equal(
    applyGender('Ești cel mai bun prieten al meu.', 'F', 'F').text,
    'Ești cea mai bună prietenă a mea.',
  );
  assert.equal(
    applyGender('Ești cea mai bună prietenă a mea.', 'M', 'M').text,
    'Ești cel mai bun prieten al meu.',
  );
});

test('closed-class gendered words are known', () => {
  assert.equal(applyGender('Sunt un prieten bun', 'F').text, 'Sunt o prietenă bună');
  assert.equal(applyGender('Sunt o prietenă bună', 'M').text, 'Sunt un prieten bun');
});

test('a possessive agrees with the possessed noun, so it follows the span', () => {
  // "Sunt prietenul tău" -> speaking as a woman -> "Sunt prietena ta".
  // "ta" is chosen by the noun's gender, not the addressee's.
  assert.equal(applyGender('Sunt prietenul tău', 'F').text, 'Sunt prietena ta');
});

test('the span stops at a conjunction', () => {
  const out = applyGender('Sunt obosit și prietenul meu e profesor', 'F');
  assert.equal(out.text, 'Sunt obosită și prietenul meu e profesor');
});

test('the span stops at a third-person copula', () => {
  assert.equal(applyGender('Ești bun și el este bun', 'M', 'F').text,
               'Ești bună și el este bun');
});

test('the span stops at sentence end', () => {
  assert.equal(applyGender('Ești bun. El este bun.', 'M', 'F').text,
               'Ești bună. El este bun.');
});

test('speaker and addressee spans stay independent', () => {
  assert.equal(
    applyGender('Sunt un prieten bun și ești o prietenă bună', 'F', 'M').text,
    'Sunt o prietenă bună și ești un prieten bun',
  );
});

test('a single doubled word stays inline', () => {
  const out = applyGender('Sunt obosit', 'both');
  assert.equal(out.text, 'Sunt obosit/obosită');
  assert.equal(out.variants.length, 1);
});

test('several doubled words become two whole sentences instead', () => {
  // "cel/cea mai bun/bună prieten/prietenă al/a meu/mea" is unreadable.
  const out = applyGender('Ești cel mai bun prieten al meu.', 'M', 'both');
  assert.deepEqual(out.variants, [
    'Ești cel mai bun prieten al meu.',
    'Ești cea mai bună prietenă a mea.',
  ]);
  assert.equal(out.text, out.variants[0]);
});

test('variants is always populated, even with no doubling', () => {
  const out = applyGender('Sunt obosit', 'F');
  assert.deepEqual(out.variants, ['Sunt obosită']);
});
