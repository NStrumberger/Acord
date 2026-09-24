import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflectAdjective, classifyAdjective, type AdjectiveForms } from '../src/ro/adjective.ts';

const bun:  AdjectiveForms = { msg: 'bun',  fsg: 'bună', mpl: 'buni', fpl: 'bune' };
const mic:  AdjectiveForms = { msg: 'mic',  fsg: 'mică', mpl: 'mici', fpl: 'mici' };
const mare: AdjectiveForms = { msg: 'mare', fsg: 'mare', mpl: 'mari', fpl: 'mari' };
const gri:  AdjectiveForms = { msg: 'gri',  fsg: 'gri',  mpl: 'gri',  fpl: 'gri'  };

test('four-form adjective inflects across gender and number', () => {
  assert.equal(inflectAdjective(bun, 'M', 'sg', 'na'), 'bun');
  assert.equal(inflectAdjective(bun, 'F', 'sg', 'na'), 'bună');
  assert.equal(inflectAdjective(bun, 'M', 'pl', 'na'), 'buni');
  assert.equal(inflectAdjective(bun, 'F', 'pl', 'na'), 'bune');
});

test('feminine singular genitive-dative takes the feminine plural form', () => {
  // "unei fete bune" -- not *"unei fete buna".
  assert.equal(inflectAdjective(bun, 'F', 'sg', 'gd'), 'bune');
  assert.equal(inflectAdjective(mic, 'F', 'sg', 'gd'), 'mici');
});

test('masculine singular is unchanged in genitive-dative', () => {
  // "unui baiat bun"
  assert.equal(inflectAdjective(bun, 'M', 'sg', 'gd'), 'bun');
});

test('two-form and invariable adjectives never break', () => {
  assert.equal(inflectAdjective(mare, 'F', 'sg', 'na'), 'mare');
  assert.equal(inflectAdjective(mare, 'M', 'pl', 'na'), 'mari');
  for (const g of ['M', 'F'] as const)
    for (const n of ['sg', 'pl'] as const)
      assert.equal(inflectAdjective(gri, g, n, 'na'), 'gri');
});

test('adjective classes are reported from their distinct forms', () => {
  assert.equal(classifyAdjective(bun), 4);
  assert.equal(classifyAdjective(mic), 3);
  assert.equal(classifyAdjective(mare), 2);
  assert.equal(classifyAdjective(gri), 1);
});
