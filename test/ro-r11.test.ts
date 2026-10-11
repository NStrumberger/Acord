import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGender, findGendered } from '../src/ro/postedit.ts';

/**
 * Regressions from the R11 model review. Each Romanian input is real model
 * output (or the auditor's minimal repro of it); see notes/R11-model-review.md.
 */
type T = 'M' | 'F' | 'both' | 'avoid';
const run = (ro: string, en: string, speaker: T, other?: T, targets?: Record<string, T>) =>
  applyGender(ro, speaker, other, { source: en, targets });

test('P1: an explicit he or she in the English is evidence, and is kept', () => {
  assert.equal(run('E obosit.', 'He is tired.', 'M', 'F').text, 'E obosit.');
  assert.equal(run('E o profesoară bună.', 'She is a good teacher.', 'M', 'M').text,
    'E o profesoară bună.');
});

test('P1: a kinship subject states its own gender', () => {
  assert.equal(run('Soția lui e colega mea.', 'His wife is my colleague.', 'M', 'M').text,
    'Soția lui e colega mea.');
  assert.equal(run('Sora mea, care este profesoară, este obosită.',
    'My sister, who is a teacher, is tired.', 'M', 'M').text,
    'Sora mea, care este profesoară, este obosită.');
});

test('P1: a kinship subject sets the gender, even against the model', () => {
  // Found by re-running the review set: freezing these left the model's
  // masculine in place for a mother.
  assert.equal(run('Mama mea este un doctor obosit.', 'My mother is a tired doctor.', 'M').text,
    'Mama mea este o doctoriță obosită.');
  assert.equal(run('E obosită.', 'He is tired.', 'F', 'F').text, 'E obosit.');
});

test('P1: "și" before "eu" does not pull the previous clause into the subject', () => {
  assert.equal(run('Fratele meu este profesor și eu sunt profesor.',
    'My brother is a teacher and I am a teacher too.', 'avoid').text,
    'Fratele meu este profesor și eu predau.');
});

test('review: a "care" clause follows whoever its antecedent belongs to', () => {
  assert.equal(run('Maya este prietena mea, care este bună.', 'Maya is my friend, who is good.',
    'F', 'M', { maya: 'F' }).text, 'Maya este prietena mea, care este bună.');
  assert.equal(run('Sunt prietenul lui, care este profesor.', 'I am his friend, who is a teacher.', 'F').text,
    'Sunt prietena lui, care este profesoară.');
});

test('review: a coordinated job with a complement still agrees', () => {
  assert.equal(run('Sunt un profesor și un prieten al familiei.',
    'I am a teacher and a friend of the family.', 'F').text,
    'Sunt o profesoară și o prietenă a familiei.');
});

test('review: "we" with someone other than you or a name is left as translated', () => {
  assert.equal(run('Fratele meu și cu mine suntem prieteni.', 'My brother and I are friends.', 'F').text,
    'Fratele meu și cu mine suntem prieteni.');
});

test('review: words that are Object.prototype keys are not grammar', () => {
  assert.equal(run('Lucrez ca constructor.', 'I work as a constructor.', 'F').text, 'Lucrez ca constructor.');
  assert.equal(run('Sunt un prieten constructor.', 'I am a constructor friend.', 'F').text,
    'Sunt o prietenă constructor.');
});

test('P1: a relative clause follows the person it is about', () => {
  assert.equal(run('Maya, care este colega mea, este un inginer bun.',
    'Maya, who is my colleague, is a good engineer.', 'F', 'M', { maya: 'F' }).text,
    'Maya, care este colega mea, este o ingineră bună.');
});

test('P2: a plural subject before "sunt" is "they are", not "I am"', () => {
  assert.equal(run('Părinții sunt obosiți.', 'The parents are tired.', 'F').text,
    'Părinții sunt obosiți.');
  assert.equal(run('Sunt obosiți.', 'They are tired.', 'F').text, 'Sunt obosiți.');
  assert.equal(run('Sunt obosiți.', 'They are tired.', 'M', 'F').text, 'Sunt obosite.');
});

test('P3: "you and I" is masculine unless both of us are women', () => {
  assert.equal(run('Tu și cu mine suntem obosiți.', 'You and I are tired.', 'F', 'M').text,
    'Tu și cu mine suntem obosiți.');
  assert.equal(run('Tu și cu mine suntem obosiți.', 'You and I are tired.', 'F', 'F').text,
    'Tu și cu mine suntem obosite.');
});

test('P4: a possessive that belongs to another noun is left alone', () => {
  assert.equal(run('Sunt din familia mea.', 'I am from my family.', 'M').text,
    'Sunt din familia mea.');
  assert.equal(run('Sunt cel mai înalt din familia mea.', 'I am the tallest in my family.', 'F').text,
    'Sunt cea mai înaltă din familia mea.');
  assert.equal(run('Ești un prieten de-al fratelui meu.', 'You are a friend of my brother.', 'M', 'F').text,
    'Ești o prietenă de-a fratelui meu.');
});

test('P5: nothing flips when the noun it belongs to cannot', () => {
  assert.equal(run('Ești un om bun.', 'You are a good person.', 'M', 'F').text, 'Ești un om bun.');
  assert.equal(run('Sunt un al 17-lea.', 'I am a plumber.', 'F').text, 'Sunt un al 17-lea.');
  assert.equal(run('Sunt un al XVII-lea.', 'I am a sculptor.', 'F').text, 'Sunt un al XVII-lea.');
  assert.equal(run('Sunt un Zorost.', 'I am a zoologist.', 'F').text, 'Sunt un Zorost.');
});

test("P6: the nurse's adjective follows the noun", () => {
  assert.equal(run('Sunt asistentă medicală.', 'I am a nurse.', 'M').text, 'Sunt asistent medical.');
});

test('P7: every item of a coordinated predicate agrees', () => {
  assert.equal(run('Sunt obosit și fericit.', 'I am tired and happy.', 'F').text,
    'Sunt obosită și fericită.');
  assert.equal(run('Sunt înalt, obosit și fericit.', 'I am tall, tired and happy.', 'F').text,
    'Sunt înaltă, obosită și fericită.');
  assert.equal(run('Ești un prieten bun și un coleg bun.',
    'You are a good friend and a good colleague.', 'M', 'F').text,
    'Ești o prietenă bună și o colegă bună.');
  // A new clause after "și" still ends the predicate.
  assert.equal(run('Sunt fericit și prietenul meu doarme.', 'I am happy and my friend sleeps.', 'F').text,
    'Sunt fericită și prietenul meu doarme.');
});

test('P8: avoiding gender never drops part of the predicate', () => {
  const out = run('Ești un profesor bun.', 'You are a good teacher.', 'M', 'avoid');
  assert.equal(out.fellBack, true);
  assert.deepEqual(out.variants, ['Ești un profesor bun.', 'Ești o profesoară bună.']);
  assert.equal(run('Sunt profesor.', 'I am a teacher.', 'avoid').text, 'Predau.');
});

test('P9: an unnamed subject noun agrees with its own predicate', () => {
  assert.equal(run('Vecinul meu e obosit.', 'My neighbour is tired.', 'M', 'F').text,
    'Vecina mea e obosită.');
});

test('P10: a group of named women takes the feminine plural', () => {
  const ro = 'Maya și Ana sunt obosiți.', en = 'Maya and Ana are tired.';
  assert.equal(run(ro, en, 'M', undefined, { maya: 'F', ana: 'F' }).text, 'Maya și Ana sunt obosite.');
  assert.equal(run(ro, en, 'M', undefined, { maya: 'F', ana: 'M' }).text, ro);
});

test('P11: definite forms of known occupations are rewritten', () => {
  assert.equal(run('Ești procurorul.', 'You are the prosecutor.', 'M', 'F').text, 'Ești procuroarea.');
  assert.equal(run('Ești auditorul.', 'You are the auditor.', 'M', 'F').text, 'Ești auditoarea.');
});

test('P12: "de-al" re-agrees with the possessed noun', () => {
  assert.equal(run('Sunt un coleg de-al lui.', 'I am a colleague of his.', 'F').text,
    'Sunt o colegă de-a lui.');
});

test('P13: "works as" for I and you', () => {
  assert.equal(run('Lucrez ca fotograf.', 'I work as a photographer.', 'F').text, 'Lucrez ca fotografă.');
});

test('P14: a perfect with a fused clitic still opens a predicate', () => {
  assert.equal(run('Maya mi-a fost un prieten.', 'Maya has been a friend to me.', 'M', undefined,
    { maya: 'F' }).text, 'Maya mi-a fost o prietenă.');
});

test('P15: a name ending one sentence does not reach into the next', () => {
  assert.equal(run('Eu sunt Ana. Sunt obosit.', 'I am Ana. I am tired.', 'F').text,
    'Eu sunt Ana. Sunt obosită.');
});

test('P16: the object clitic follows its noun', () => {
  assert.equal(run('Ești cel mai bun profesor pe care-l am.', 'You are the best teacher I have.', 'M', 'F').text,
    'Ești cea mai bună profesoară pe care o am.');
});

test('P17: with two names, "anyone else" reaches the unnamed and nobody named', () => {
  const ro = 'Ana e obosită, Mihai e obosit și vecinul meu e obosit.';
  const en = 'Ana is tired, Mihai is tired and my neighbour is tired.';
  const out = applyGender(ro, 'M', 'F', { source: en, targets: {}, namedFollowOthers: false });
  assert.equal(out.othersPresent, true);
  assert.equal(out.text, 'Ana e obosită, Mihai e obosit și vecina mea e obosită.');
  const named = 'Josh și Maya sunt obosiți.';
  assert.equal(applyGender(named, 'M', 'F', { source: 'Josh and Maya are tired.' }).othersPresent, false);
});

test('P18: an athlete is now known, so the predicate agrees whole', () => {
  assert.equal(run('Suntem sportivi obosiți.', 'We are tired athletes.', 'F').text,
    'Suntem sportive obosite.');
});

test('F1: the masculine of a contested pair is never flagged', () => {
  const [inginer] = findGendered('inginer');
  assert.equal(inginer?.options.find((o) => o.agreement === 'M')?.status, 'normative');
  const [ingineră] = findGendered('ingineră');
  assert.equal(ingineră?.options[0]?.status, 'contested');
});
