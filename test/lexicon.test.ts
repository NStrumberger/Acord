import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Entry = {
  en: string; m: string; f: string;
  status: string; sources: string[]; note: string | null; reviewed: boolean;
};

const lexicon = JSON.parse(
  readFileSync(new URL('../src/ro/lexicon.occupations.json', import.meta.url), 'utf8'),
) as { entries: Entry[] };

const entries = lexicon.entries;

test('seed lexicon is non-empty', () => {
  assert.ok(entries.length >= 82, `expected >= 82 entries, got ${entries.length}`);
});

test('every entry has a masculine and a feminine form', () => {
  for (const e of entries) {
    assert.ok(e.m?.trim(), `empty masculine for "${e.en}"`);
    assert.ok(e.f?.trim(), `empty feminine for "${e.en}"`);
  }
});

test('masculine and feminine forms differ', () => {
  // Romanian has epicene nouns, but none should have slipped into an m/f pair
  // silently -- an identical pair means the extraction failed, not that the
  // noun is invariable.
  for (const e of entries) {
    assert.notEqual(e.m, e.f, `"${e.en}" has identical m/f forms`);
  }
});

test('English keys are unique', () => {
  const seen = new Set<string>();
  for (const e of entries) {
    assert.ok(!seen.has(e.en), `duplicate entry for "${e.en}"`);
    seen.add(e.en);
  }
});

test('diacritics survived the pipeline', () => {
  // If an encoding step mangled the data, the Romanian-specific letters vanish.
  const all = entries.map((e) => e.f).join('');
  for (const ch of ['ă', 'ț', 'â', 'ș']) {
    assert.ok(all.includes(ch), `no "${ch}" anywhere in feminine forms -- encoding damage?`);
  }
});

test('known-irregular forms are recorded correctly', () => {
  // These are the entries a naive rule gets wrong; they are the reason the
  // app never derives at runtime. Guard them explicitly.
  const byEn = new Map(entries.map((e) => [e.en, e]));
  for (const [en, f] of [
    ['teacher', 'profesoară'],
    ['doctor', 'doctoriță'],
    ['actor', 'actriță'],
    ['hairdresser', 'coafeză'],
    ['chef', 'bucătăreasă'],
  ] as const) {
    assert.equal(byEn.get(en)?.f, f, `${en} should be "${f}"`);
  }
});

test('every entry carries a status and its sources', () => {
  // R0's `ruleDerivable` flag was scaffolding; the curated schema records
  // provenance instead -- which source(s) attest each form.
  for (const e of entries) {
    assert.match(e.status, /^(normative|variant|attested|contested|none)$/,
      `"${e.en}" has status "${e.status}"`);
    assert.ok(e.sources.length > 0, `"${e.en}" has no source`);
  }
});

test('forms agreed by two independent sources are marked normative', () => {
  const normative = entries.filter((e) => e.status === 'normative');
  assert.ok(normative.length > 30, 'expected a substantial normative core');
  for (const e of normative) {
    assert.ok(e.sources.includes('EnRoGend') && e.sources.includes('kaikki'),
      `"${e.en}" is normative but not corroborated by both sources`);
  }
});

test('variant and contested entries explain themselves', () => {
  for (const e of entries) {
    if (e.status === 'variant' || e.status === 'contested') {
      assert.ok(e.note && e.note.length > 10,
        `"${e.en}" is ${e.status} but carries no evidence note`);
    }
  }
});
