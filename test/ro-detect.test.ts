import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectGender, type Finding } from '../src/ro/detect.ts';

/** The finding reduced to what a person would read off the screen. */
const shown = (f: Finding | undefined) =>
  !f ? 'absent' : f.status === 'shown' ? `${f.gender}${f.plural ? ' pl' : ''}` : f.status;
const words = (f: Finding | undefined) => f?.evidence.map((e) => e.word) ?? [];

test('the writer\'s own adjective shows their gender', () => {
  const f = detectGender('Sunt obosită.', "I'm tired.");
  assert.equal(shown(f.them), 'F');
  assert.deepEqual(words(f.them), ['obosită']);
  assert.equal(shown(f.you), 'notShown');
  assert.equal(f.others, undefined);
  assert.equal(shown(detectGender('Sunt obosit.', "I'm tired.").them), 'M');
});

test('how they address you shows your gender', () => {
  assert.equal(shown(detectGender('Ești obosită?', 'Are you tired?').you), 'F');
  assert.equal(shown(detectGender('Ești acasă?', 'Are you home?').you), 'notShown');
  // Plural "you": all women is shown; masculine plural may be a mixed group.
  assert.equal(shown(detectGender('Sunteți obosite?', 'Are you tired?').you), 'F');
  assert.equal(shown(detectGender('Sunteți obosiți?', 'Are you tired?').you), 'notShown');
});

test('a feminine job title shows a woman; a masculine one, said by women too, shows nothing', () => {
  assert.equal(shown(detectGender('Sunt contabilă.', "I'm an accountant.").them), 'F');
  assert.equal(shown(detectGender('Sunt contabil.', "I'm an accountant.").them), 'notShown');
  assert.equal(shown(detectGender('Sunt profesor.', "I'm a teacher.").them), 'notShown');
  assert.equal(shown(detectGender('Maria e doctor.', 'Maria is a doctor.').people[0]), 'notShown');
  assert.equal(shown(detectGender('Sunt medică.', "I'm a doctor.").them), 'F');
  // Many women say "Sunt medic"; the masculine shows only the word's gender.
  assert.equal(shown(detectGender('Sunt medic.', "I'm a doctor.").them), 'notShown');
  // ...and the words agreeing with it inherit that.
  assert.equal(shown(detectGender('Sunt un medic bun.', "I'm a good doctor.").them), 'notShown');
});

test('a named person gets their own finding, listed even when nothing shows', () => {
  const f = detectGender('Maya este prietena mea.', 'Maya is my friend.');
  assert.deepEqual(f.people.map((p) => [p.name, shown(p)]), [['Maya', 'F']]);
  assert.equal(shown(f.them), 'notShown');   // "mea" agrees with the friend, not the writer
  const none = detectGender('Am vorbit cu Maya.', 'I talked to Maya.');
  assert.deepEqual(none.people.map((p) => [p.name, shown(p)]), [['Maya', 'notShown']]);
});

test('a name the English changed is still read from the Romanian', () => {
  const f = detectGender('Azi Ioana este obosită.', 'Today Joan is tired.');
  assert.deepEqual(f.people.map((p) => [p.name, shown(p)]), [['Ioana', 'F']]);
});

test('a capitalised word nothing agrees with is not taken for a person', () => {
  const f = detectGender('Locuiesc în București.', 'I live in Bucharest.');
  assert.deepEqual(f.people, []);
});

test('"sunt" with a plural is "they are", not "I am"', () => {
  const f = detectGender('Sunt profesoare.', "They're teachers.");
  assert.equal(shown(f.them), 'notShown');
  assert.equal(shown(f.others), 'F pl');
  // "They" may be things ("Sunt obosite" of the flowers): only a person word counts.
  const things = detectGender('Sunt obosite.', "I'm tired.");
  assert.equal(shown(things.them), 'notShown');
  assert.equal(things.others, undefined);
});

test('with no subject, "E bun" may be "it is good": only a word for a person counts', () => {
  assert.equal(detectGender('E bun.', "It's good.").others, undefined);
  assert.equal(detectGender('Am citit cartea. E bună.', 'I read the book. It is good.').others, undefined);
  assert.equal(shown(detectGender('E profesoară.', "She's a teacher.").others), 'F');
});

test('attested adjectives beyond the post-editor\'s own list are read', () => {
  assert.equal(shown(detectGender('Sunt pregătit.', "I'm ready.").them), 'M');
  assert.equal(shown(detectGender('Ești sigură?', 'Are you sure?').you), 'F');
  assert.equal(shown(detectGender('Maya este căsătorită.', 'Maya is married.').people[0]), 'F');
});

test('a masculine form used as an adverb is not evidence', () => {
  const f = detectGender('Sunt extrem de obosită.', "I'm extremely tired.");
  assert.equal(shown(f.them), 'F');
  assert.deepEqual(words(f.them), ['obosită']);
  assert.equal(shown(detectGender('Ești total nepregătită.', "You're totally unprepared.").you), 'F');
});

test('a given name starts a sentence as a person even when the English renamed her', () => {
  const f = detectGender('Ioana este obosită.', 'Joan is tired.');
  assert.deepEqual(f.people.map((p) => [p.name, shown(p)]), [['Ioana', 'F']]);
});

test('"we" shows the writer only when the whole group is female', () => {
  assert.equal(shown(detectGender('Suntem obosite.', "We're tired.").them), 'F');
  assert.equal(shown(detectGender('Suntem obosiți.', "We're tired.").them), 'notShown');
});

test('pronouns and family words show someone else\'s gender', () => {
  assert.equal(shown(detectGender('Ea este obosită.', 'She is tired.').others), 'F');
  assert.equal(shown(detectGender('Sora mea este obosită.', 'My sister is tired.').others), 'F');
  assert.equal(shown(detectGender('Mama lui este acasă.', 'His mother is at home.').others), 'mixed');
  // "lui" before a name is an article, not "his".
  assert.equal(shown(detectGender('Am vorbit cu mama lui Ion.', "I talked to Ion's mother.").others), 'F');
});

test('a family word in the writer\'s own predicate is the writer', () => {
  assert.equal(shown(detectGender('Sunt sora lui.', "I'm his sister.").them), 'F');
});

test('a thing is nobody', () => {
  const f = detectGender('Cartea este bună.', 'The book is good.');
  assert.equal(f.others, undefined);
  assert.equal(shown(f.them), 'notShown');
  // "mea" agrees with the house, which is no one's gender.
  assert.equal(shown(detectGender('Sunt la casa mea.', "I'm at my house.").them), 'notShown');
});

test('evidence both ways is reported as a conflict, never resolved', () => {
  const f = detectGender('Sunt obosit și sunt fericită.', "I'm tired and I'm happy.");
  assert.equal(shown(f.them), 'conflict');
  assert.deepEqual(words(f.them), ['obosit', 'fericită']);
});

test('the English he or she is our own guess, not evidence', () => {
  // The model chose "she"; nothing in the Romanian says so.
  assert.equal(detectGender('E acasă.', "She's home.").others, undefined);
});

test('cedilla spellings are read like comma-below ones', () => {
  assert.equal(shown(detectGender('Eşti obosită?', 'Are you tired?').you), 'F');
});

test('past a preposition a word is where or what, not who', () => {
  // "matematică" and "engleză" are adjectives as well as subjects.
  assert.equal(shown(detectGender('Sunt la matematică.', "I'm at maths.").them), 'notShown');
  assert.equal(shown(detectGender('Ești la engleză?', 'Are you at English?').you), 'notShown');
  assert.equal(shown(detectGender('Sunt bun la matematică.', "I'm good at maths.").them), 'M');
  // The "de" of a degree is still part of the predicate.
  assert.equal(shown(detectGender('Sunt atât de obosită.', "I'm so tired.").them), 'F');
  // A sister at whose place I am is not me.
  const f = detectGender('Sunt la sora mea.', "I'm at my sister's.");
  assert.equal(shown(f.them), 'notShown');
  assert.equal(shown(f.others), 'F');
});

test('"să fiu" is the verb, not a son', () => {
  const f = detectGender('Să fiu sincer, sunt obosit.', "To be honest, I'm tired.");
  assert.equal(f.others, undefined);
  assert.equal(shown(f.them), 'M');
  assert.equal(shown(detectGender('Am un fiu.', 'I have a son.').others), 'M');
});
