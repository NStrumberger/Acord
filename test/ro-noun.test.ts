import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildParadigm, inflectNoun } from '../src/ro/noun.ts';

const profesor  = buildParadigm('profesor',  'm', 'profesori');
const profesoara = buildParadigm('profesoară', 'f', 'profesoare');
const scaun     = buildParadigm('scaun',     'n', 'scaune');
const frate     = buildParadigm('frate',     'm', 'frați');
const carte     = buildParadigm('carte',     'f', 'cărți');

test('masculine noun takes -ul / -ului and -i / -ii', () => {
  assert.equal(inflectNoun(profesor, 'sg', 'na', 'indef'), 'profesor');
  assert.equal(inflectNoun(profesor, 'sg', 'na', 'def'),   'profesorul');
  assert.equal(inflectNoun(profesor, 'sg', 'gd', 'def'),   'profesorului');
  assert.equal(inflectNoun(profesor, 'pl', 'na', 'indef'), 'profesori');
  assert.equal(inflectNoun(profesor, 'pl', 'na', 'def'),   'profesorii');
  assert.equal(inflectNoun(profesor, 'pl', 'gd', 'def'),   'profesorilor');
});

test('feminine noun in -ă takes -a, and its gen-dat is built on the plural', () => {
  assert.equal(inflectNoun(profesoara, 'sg', 'na', 'def'),   'profesoara');
  // "unei profesoare" -- the gen-dat singular IS the plural form
  assert.equal(inflectNoun(profesoara, 'sg', 'gd', 'indef'), 'profesoare');
  assert.equal(inflectNoun(profesoara, 'sg', 'gd', 'def'),   'profesoarei');
  assert.equal(inflectNoun(profesoara, 'pl', 'na', 'def'),   'profesoarele');
  assert.equal(inflectNoun(profesoara, 'pl', 'gd', 'def'),   'profesoarelor');
});

test('neuter takes the masculine article in the singular and feminine in the plural', () => {
  // The same chokepoint that drives adjective agreement also drives the article.
  assert.equal(inflectNoun(scaun, 'sg', 'na', 'def'), 'scaunul');
  assert.equal(inflectNoun(scaun, 'pl', 'na', 'def'), 'scaunele');
  assert.equal(inflectNoun(scaun, 'pl', 'gd', 'def'), 'scaunelor');
});

test('nouns ending in -e take -le / -lui', () => {
  assert.equal(inflectNoun(frate, 'sg', 'na', 'def'), 'fratele');
  assert.equal(inflectNoun(frate, 'sg', 'gd', 'def'), 'fratelui');
  assert.equal(inflectNoun(frate, 'pl', 'na', 'def'), 'frații');
});

test('feminine nouns ending in -e take -ea', () => {
  assert.equal(inflectNoun(carte, 'sg', 'na', 'def'), 'cartea');
  assert.equal(inflectNoun(carte, 'sg', 'gd', 'def'), 'cărții');
  assert.equal(inflectNoun(carte, 'pl', 'na', 'def'), 'cărțile');
});

test('every paradigm cell is populated for every noun', () => {
  for (const p of [profesor, profesoara, scaun, frate, carte]) {
    for (const num of ['sg', 'pl'] as const)
      for (const c of ['na', 'gd'] as const)
        for (const d of ['indef', 'def'] as const)
          assert.ok(inflectNoun(p, num, c, d).length > 0,
            `empty cell ${num}.${c}.${d} for ${p.lemma}`);
  }
});

test('gen-dat forms match ones attested in the EnRoGend corpus', () => {
  // These exact surface forms appear in the dataset, so they pin the
  // feminine gen-dat rule (built on the plural stem) to real evidence
  // rather than to our reconstruction of it.
  const auditoare = buildParadigm('auditoare', 'f', 'auditoare');
  assert.equal(inflectNoun(auditoare, 'sg', 'na', 'def'), 'auditoarea');
  assert.equal(inflectNoun(auditoare, 'sg', 'gd', 'def'), 'auditoarei');

  const topografa = buildParadigm('topografă', 'f', 'topografe');
  assert.equal(inflectNoun(topografa, 'sg', 'na', 'def'), 'topografa');
  assert.equal(inflectNoun(topografa, 'sg', 'gd', 'def'), 'topografei');
});
