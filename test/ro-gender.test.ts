import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAgreement } from '../src/ro/gender.ts';

test('masculine and feminine resolve to themselves in both numbers', () => {
  assert.equal(resolveAgreement('m', 'sg'), 'M');
  assert.equal(resolveAgreement('m', 'pl'), 'M');
  assert.equal(resolveAgreement('f', 'sg'), 'F');
  assert.equal(resolveAgreement('f', 'pl'), 'F');
});

test('neuter is masculine in the singular and feminine in the plural', () => {
  // The defining property of Romanian neuter: "un scaun bun" / "doua scaune bune".
  // Nothing ever agrees with "neuter" as such.
  assert.equal(resolveAgreement('n', 'sg'), 'M');
  assert.equal(resolveAgreement('n', 'pl'), 'F');
});

test('resolveAgreement is total over every gender and number', () => {
  for (const g of ['m', 'f', 'n'] as const) {
    for (const n of ['sg', 'pl'] as const) {
      assert.match(resolveAgreement(g, n), /^[MF]$/);
    }
  }
});
