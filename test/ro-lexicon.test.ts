import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookup, realize, paradigmFor } from '../src/ro/lexicon.ts';

test('unknown occupations are a miss, never a guess', () => {
  // The refusal path: inventing a Romanian feminine is the failure mode
  // R0 exists to prevent.
  assert.equal(lookup('astronaut'), undefined);
});

test('a settled occupation realizes cleanly in both genders', () => {
  const teacher = lookup('teacher')!;
  assert.equal(realize(teacher, 'male').form, 'profesor');
  assert.equal(realize(teacher, 'female').form, 'profesoară');
  assert.equal(realize(teacher, 'female').status, 'normative');
  assert.equal(realize(teacher, 'female').alternatives.length, 0);
});

test('variant spellings surface BOTH forms rather than picking one', () => {
  const geologist = lookup('geologist')!;
  const out = realize(geologist, 'female');
  assert.equal(out.status, 'variant');
  assert.deepEqual([out.form, ...out.alternatives].sort(), ['geoloagă', 'geologă']);
  assert.match(out.note!, /DOOM3|breaking/);
});

test('contested forms are flagged with their evidence', () => {
  const engineer = lookup('engineer')!;
  const out = realize(engineer, 'female');
  assert.equal(out.status, 'contested');
  assert.equal(out.form, 'ingineră');
  assert.ok(out.note && out.note.length > 0, 'a contested form must carry its reason');
});

test('unspecified gender uses a neutral strategy when one exists', () => {
  // Romanian has no general neutral register, so this is per-lexeme. A verb
  // paraphrase is preferred over the epicene noun "cadru didactic": a
  // present-tense verb carries no gender at all, whereas the epicene noun is
  // still lexically neuter and any adjective in the clause must agree with it.
  const teacher = lookup('teacher')!;
  const out = realize(teacher, 'unspecified');
  assert.equal(out.form, 'predau');
  assert.equal(out.strategy, 'verb_paraphrase');
});

test('unspecified gender falls back to a doublet, never an invented form', () => {
  const lawyer = lookup('lawyer')!;
  const out = realize(lawyer, 'unspecified');
  assert.equal(out.strategy, 'doublet');
  assert.equal(out.form, 'avocat/avocată');
  // must never emit prieten@ / obosit*ă style non-forms
  assert.doesNotMatch(out.form, /[@*]/);
});

test('paradigms carry attested plurals, not derived ones', () => {
  const teacher = lookup('teacher')!;
  const m = paradigmFor(teacher, 'M')!;
  assert.equal(m.forms['pl.na.indef'], 'profesori');
  assert.equal(m.forms['pl.na.def'], 'profesorii');
  const f = paradigmFor(teacher, 'F')!;
  assert.equal(f.forms['pl.na.indef'], 'profesoare');
});

test('every entry has a status and is honest about review state', () => {
  for (const en of ['teacher', 'geologist', 'engineer', 'lawyer']) {
    const e = lookup(en)!;
    assert.match(e.status, /^(normative|variant|attested|contested|none)$/);
    assert.equal(e.reviewed, false, 'nothing is speaker-reviewed yet');
  }
});

test('a contested status describes the feminine form, not the masculine', () => {
  // "Sunt inginer" is ordinary Romanian; only "inginera" is disputed.
  const engineer = lookup('engineer')!;
  assert.equal(engineer.status, 'contested');
  assert.equal(realize(engineer, 'female').status, 'contested');
  assert.equal(realize(engineer, 'male').status, 'normative');
  assert.equal(realize(engineer, 'male').note, null);
});
