import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realizeClause, type Referent, type Clause } from '../src/ro/frames.ts';

const ref = (id: string, gender: Referent['gender'], person: 1 | 2 | 3 = 3): Referent =>
  ({ id, gender, person, number: 'sg' });
const speaker = (gender: Referent['gender']): Referent => ref('me', gender, 1);

const text = (c: Clause, refs: Referent[]) =>
  realizeClause(c, refs).tokens.map((t) => t.text).join(' ');

test('predicate noun agrees with the speaker', () => {
  const c: Clause = { frame: 'predicate-noun', subject: 'me', noun: 'teacher' };
  assert.equal(text(c, [speaker('male')]), 'Sunt profesor');
  assert.equal(text(c, [speaker('female')]), 'Sunt profesoară');
});

test('predicate adjective agrees where English marks nothing', () => {
  // "I am tired" carries no gender in English and none in German either --
  // Romanian marks it on the adjective. The product's core case.
  const c: Clause = { frame: 'predicate-adj', subject: 'me', adj: 'tired' };
  assert.equal(text(c, [speaker('male')]), 'Sunt obosit');
  assert.equal(text(c, [speaker('female')]), 'Sunt obosită');
});

test('possessed noun agrees with the POSSESSED person, not the possessor', () => {
  // A male speaker with a female friend must still get the feminine noun.
  // Choosing the noun from the possessor is a real bug this pins.
  const c: Clause = { frame: 'possessed-noun', possessor: 'me', possessed: 'f', noun: 'friend' };
  assert.equal(text(c, [speaker('male'), ref('f', 'male')]), 'prietenul meu');
  assert.equal(text(c, [speaker('male'), ref('f', 'female')]), 'prietena mea');
  assert.equal(text(c, [speaker('female'), ref('f', 'male')]), 'prietenul meu');
});

test('a noun phrase is not capitalized like a sentence', () => {
  const c: Clause = { frame: 'possessed-noun', possessor: 'me', possessed: 'f', noun: 'friend' };
  assert.equal(realizeClause(c, [speaker('male'), ref('f', 'male')]).kind, 'phrase');
  const s: Clause = { frame: 'predicate-adj', subject: 'me', adj: 'tired' };
  assert.equal(realizeClause(s, [speaker('male')]).kind, 'clause');
});

test('object gender changes WORD ORDER, and provenance points at the object', () => {
  // L-am vazut  (masculine: clitic before the auxiliary)
  // Am vazut-o  (feminine: clitic after the participle)
  // No find-and-replace design can express this, which is why Token.ref is a
  // pointer into the IR rather than a list of alternative strings.
  const c: Clause = { frame: 'past-transitive', subject: 'me', object: 'them', verb: 'see' };
  const him = realizeClause(c, [speaker('male'), ref('them', 'male')]);
  const her = realizeClause(c, [speaker('male'), ref('them', 'female')]);
  assert.equal(him.tokens.map((t) => t.text).join(' '), 'L-am văzut');
  assert.equal(her.tokens.map((t) => t.text).join(' '), 'Am văzut-o');
  assert.equal(him.tokens.find((t) => t.ref)?.ref, 'them');
  assert.equal(her.tokens.find((t) => t.ref)?.ref, 'them');
  // the gendered token is in a different POSITION in each
  assert.notEqual(him.tokens.findIndex((t) => t.ref), her.tokens.findIndex((t) => t.ref));
});

test('politeness splits syntactic from semantic number', () => {
  // "Dumneavoastra sunteti obosita" -- verb 2nd person PLURAL, adjective
  // singular FEMININE. One number field cannot express this.
  const polite: Referent =
    { id: 'you', gender: 'female', person: 2, number: 'sg', verbNumber: 'pl' };
  const c: Clause = { frame: 'predicate-adj', subject: 'you', adj: 'tired' };
  assert.equal(text(c, [polite]), 'Sunteți obosită');
});

test('unspecified gender yields a doublet where one slot can hold both', () => {
  for (const [c, refs, expected] of [
    [{ frame: 'predicate-adj', subject: 'me', adj: 'tired' },
     [speaker('unspecified')], 'Sunt obosit/obosită'],
    [{ frame: 'possessed-noun', possessor: 'me', possessed: 'f', noun: 'friend' },
     [speaker('male'), ref('f', 'unspecified')], 'prietenul meu/prietena mea'],
  ] as [Clause, Referent[], string][]) {
    const out = realizeClause(c, refs);
    assert.equal(out.tokens.map((t) => t.text).join(' '), expected);
    assert.match(out.tokens.find((t) => t.note)!.note!, /no neutral form/);
  }
});

test('unspecified gender is REFUSED where it would change word order', () => {
  // A doublet cannot express two different word orders in one slot, and
  // defaulting to masculine is the exact failure this project exists to stop.
  const c: Clause = { frame: 'past-transitive', subject: 'me', object: 'them', verb: 'see' };
  assert.throws(
    () => realizeClause(c, [speaker('male'), ref('them', 'unspecified')]),
    /gender required/,
  );
});

test('no output ever contains an invented non-form', () => {
  const cases: [Clause, Referent[]][] = [
    [{ frame: 'predicate-adj', subject: 'me', adj: 'tired' }, [speaker('unspecified')]],
    [{ frame: 'predicate-noun', subject: 'me', noun: 'lawyer' }, [speaker('unspecified')]],
  ];
  for (const [c, refs] of cases) {
    assert.doesNotMatch(text(c, refs), /[@*]/);
  }
});

test('unknown vocabulary is refused, never invented', () => {
  const c: Clause = { frame: 'predicate-noun', subject: 'me', noun: 'astronaut' };
  assert.throws(() => realizeClause(c, [speaker('female')]), /astronaut/);
});
