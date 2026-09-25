import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGender } from '../src/ro/postedit.ts';

/**
 * What the model actually produces for the two-name case, verified against
 * Xenova/opus-mt-en-ro rather than assumed:
 *
 *   "Josh is my friend and Maya is also my friend"
 *     -> "Josh este prietenul meu și Maya este și prietena mea."
 */
const TWO = 'Josh este prietenul meu și Maya este și prietena mea.';
const TWO_EN = 'Josh is my friend and Maya is also my friend';

test('each named person can be set independently', () => {
  const out = applyGender(TWO, 'M', undefined, {
    source: TWO_EN, targets: { josh: 'F', maya: 'M' },
  });
  assert.equal(out.text, 'Josh este prietena mea și Maya este și prietenul meu.');
});

test('a person left unset follows the general setting', () => {
  const out = applyGender(TWO, 'M', 'F', { source: TWO_EN, targets: { josh: 'M' } });
  assert.equal(out.text, 'Josh este prietenul meu și Maya este și prietena mea.');
});

test('the people found are the ones whose gender the output depends on', () => {
  const out = applyGender(TWO, 'M', undefined, { source: TWO_EN });
  assert.deepEqual(out.people, [{ name: 'Josh', governs: true }, { name: 'Maya', governs: true }]);
});

test('a name we cannot act on is listed, but marked as not governing', () => {
  // "lui Josh" is an indirect object, not the subject of a copula, so nothing
  // in the sentence agrees with Josh. Dropping him would read as not having
  // seen him at all, which is the more misleading of the two.
  const out = applyGender('I-am spus lui Josh că Maya e obosită.', 'M', undefined, {
    source: 'I told Josh that Maya is tired.',
  });
  assert.deepEqual(out.people, [
    { name: 'Josh', governs: false }, { name: 'Maya', governs: true },
  ]);
});

test('a Romanian word capitalised at the start of a sentence is not a name', () => {
  const out = applyGender('Prietena mea Maya e doctor.', 'M', undefined, {
    source: 'My friend Maya is a doctor.',
  });
  assert.deepEqual(out.people, [{ name: 'Maya', governs: true }]);
});

test('a capitalised word absent from the English is not a name', () => {
  // The model renders "the plumber" as "Cel din '17". "Cel" is capitalised and
  // unknown to us, but it is not in the English, so it is not somebody's name.
  const out = applyGender("Cel din '17 e obosit.", 'M', undefined, {
    source: 'The plumber is tired.',
  });
  assert.deepEqual(out.people, []);
});

test('"și" straight after the copula is "also", not a new clause', () => {
  // A conjunction cannot coordinate a predicate that has not started yet, so
  // the predicate after it still agrees with the subject.
  assert.equal(
    applyGender('Maya este și prietena mea.', 'M', 'M').text,
    'Maya este și prietenul meu.',
  );
});

test('a name before "sunt" means they are, not I am', () => {
  // "sunt" is both "I am" and "they are". A name in front settles it, and
  // without that guard the speaker setting rewrites somebody else's predicate.
  assert.equal(
    applyGender('Josh și Maya sunt prietenii mei.', 'F', undefined, {
      source: 'Josh and Maya are my friends.',
    }).text,
    'Josh și Maya sunt prietenii mei.',
  );
});

test('avoiding gender for a third person shows both forms, not an invented verb', () => {
  // The gender-free paraphrase is stored for "I" and "you" only. A third
  // person needs a 3rd-singular this engine does not hold, and it never
  // invents a form, so the honest answer is both forms and a note.
  const out = applyGender('Maya e profesor.', 'M', undefined, {
    source: 'Maya is a teacher.', targets: { maya: 'avoid' },
  });
  assert.equal(out.text, 'Maya e profesor/profesoară.');
  assert.equal(out.fellBack, true);
});

test('per-person choices are ignored without the English to check names against', () => {
  // Names are read off the Romanian, and confirmed against the English. With no
  // English there is nothing to confirm against, so the general setting leads.
  const out = applyGender(TWO, 'M', 'F', { targets: { josh: 'M' } });
  assert.deepEqual(out.people, []);
  assert.equal(out.text, 'Josh este prietena mea și Maya este și prietena mea.');
});

test('two people shown both stay inline rather than being paired up', () => {
  // Collapsing to two sentences picks one gender for the whole sentence. With
  // two independent people that would print Josh-M/Maya-M and Josh-F/Maya-F,
  // hiding the two mixed readings that are just as valid.
  const out = applyGender('Josh e prietenul meu și Maya e prietena mea.', 'M', undefined, {
    source: 'Josh is my friend and Maya is my friend.',
    targets: { josh: 'both', maya: 'both' },
  });
  assert.equal(out.variants.length, 1);
  assert.equal(out.text, 'Josh e prietenul/prietena meu/mea și Maya e prietenul/prietena meu/mea.');
});

test('one person with several doubled words still collapses to two sentences', () => {
  const out = applyGender('Maya e cea mai bună prietenă a mea.', 'M', undefined, {
    source: 'Maya is my best friend.', targets: { maya: 'both' },
  });
  assert.deepEqual(out.variants, [
    'Maya e cel mai bun prieten al meu.',
    'Maya e cea mai bună prietenă a mea.',
  ]);
});

test('everyone named is listed, even where the sentence marks only the first', () => {
  // Reported: four names in, one row out. The Romanian states "prietenul meu"
  // once and elides it afterwards, so only Maya governs anything -- but Steve,
  // Rose and Henry were still found, and saying so beats staying silent.
  const out = applyGender('Maya e prietenul meu și la fel și Steve, la fel și Rose și Henry.',
    'M', undefined, { source: 'Maya is my friend and so is Steve, so is Rose and Henry' });
  assert.deepEqual(out.people, [
    { name: 'Maya', governs: true },
    { name: 'Steve', governs: false },
    { name: 'Rose', governs: false },
    { name: 'Henry', governs: false },
  ]);
});

test('"works as a ..." is an agreement site, because "ca" marks off the role', () => {
  // Reported: "Rose works as a teacher" left Rose with nothing to set, because
  // "lucreaza" is a lexical verb and only copulas opened a span.
  const out = applyGender('Rose lucrează ca profesoară.', 'M', undefined, {
    source: 'Rose works as a teacher.', targets: { rose: 'M' },
  });
  assert.equal(out.text, 'Rose lucrează ca profesor.');
  assert.deepEqual(out.people, [{ name: 'Rose', governs: true }]);
});

test('"as tired as Steve" does not hand the predicate to Steve', () => {
  // The same word, comparing rather than naming a role. Steve is the thing
  // compared TO, so nothing here is his to set.
  const out = applyGender('Maya e la fel de obosită ca Steve.', 'M', undefined, {
    source: 'Maya is as tired as Steve.', targets: { steve: 'M' },
  });
  assert.equal(out.text, 'Maya e la fel de obosită ca Steve.');
  assert.deepEqual(out.people, [
    { name: 'Maya', governs: true }, { name: 'Steve', governs: false },
  ]);
});

test('the reported three-name sentence is fully settable', () => {
  const out = applyGender(
    'Maya este prietena mea, deși Steve este obosit, Rose lucrează ca profesoară.',
    'M', undefined, {
      source: 'Maya is my friend, although Steve is tired, Rose works as a teacher',
      targets: { maya: 'M', steve: 'F', rose: 'M' },
    });
  assert.equal(out.text,
    'Maya este prietenul meu, deși Steve este obosită, Rose lucrează ca profesor.');
});
