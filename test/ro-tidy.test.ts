import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tidyRomanian } from '../src/ro/tidy.ts';

/**
 * The Bergamot model writes stiff Romanian: a subject pronoun the verb already
 * carries, and an article before a bare job title. Reviewers marked these
 * "awkward" far more often than anything else (notes/R12). Inputs below are
 * real model output.
 */

test('a sentence-initial subject pronoun the verb already marks is dropped', () => {
  assert.equal(tidyRomanian('Eu sunt arhitectă.'), 'Sunt arhitectă.');
  assert.equal(tidyRomanian('Tu ești casierul.'), 'Ești casierul.');
  assert.equal(tidyRomanian('Noi suntem inginere.'), 'Suntem inginere.');
  assert.equal(tidyRomanian('Bună ziua. Eu sunt obosită.'), 'Bună ziua. Sunt obosită.');
});

test('a negation between the pronoun and its verb does not stop the drop', () => {
  assert.equal(tidyRomanian('Eu nu sunt doctoriță.'), 'Nu sunt doctoriță.');
  assert.equal(tidyRomanian('Tu nu ești prietena mea.'), 'Nu ești prietena mea.');
});

test('"ei"/"ele" for an English "they" is dropped like any subject pronoun', () => {
  // The model picks the masculine "ei" for "they" (notes/R12), and an
  // explicit pronoun would then pin the gender against the user's setting.
  assert.equal(tidyRomanian('Ei sunt muzicieni.'), 'Sunt muzicieni.');
  assert.equal(tidyRomanian('Ele erau obosite.'), 'Erau obosite.');
  assert.equal(tidyRomanian('Ei sunt vecinii noștri și ea e prietena mea.'),
    'Ei sunt vecinii noștri și ea e prietena mea.');
});

test('"el"/"ea" stay: a singular he or she carries the English gender', () => {
  assert.equal(tidyRomanian('El este obosit.'), 'El este obosit.');
});

test('a contrastive pronoun stays', () => {
  const contrast = 'Eu sunt profesoară și ea este doctor.';
  assert.equal(tidyRomanian(contrast), contrast);
  assert.equal(tidyRomanian('Eu sunt profesor, tu ești student.'), 'Eu sunt profesor, tu ești student.');
});

test('a pronoun that is not the bare subject of the next verb stays', () => {
  assert.equal(tidyRomanian('Eu și Maya suntem obosite.'), 'Eu și Maya suntem obosite.');
  assert.equal(tidyRomanian('Și eu sunt obosit.'), 'Și eu sunt obosit.');
  assert.equal(tidyRomanian('Ea este obosită.'), 'Ea este obosită.');   // el/ea carry gender
});

test('the article before a job title that ends the predicate is dropped', () => {
  assert.equal(tidyRomanian('Fratele meu este un contabil.'), 'Fratele meu este contabil.');
  assert.equal(tidyRomanian('Eu sunt o contabilă.'), 'Sunt contabilă.');
  assert.equal(tidyRomanian('Ești o actriță?'), 'Ești actriță?');
  assert.equal(tidyRomanian('A fost un dirijor.'), 'A fost dirijor.');
});

test('the article stays when an adjective or more follows', () => {
  assert.equal(tidyRomanian('Ești un profesor bun.'), 'Ești un profesor bun.');
  assert.equal(tidyRomanian('Sunt o profesoară și o cântăreață.'), 'Sunt o profesoară și o cântăreață.');
});

test('the article stays when the subject is "this" or a question word', () => {
  // Found by review: "This is a doctor" is not a statement about a person's job.
  for (const s of ['Acesta este un medic.', 'Aceasta este o profesoară!', 'Ce este un medic?',
    'Cine este un profesor?', 'Asta e un contabil.']) {
    assert.equal(tidyRomanian(s), s);
  }
});

test('only known job titles lose their article: a miss is never a guess', () => {
  assert.equal(tidyRomanian('Ești un om bun.'), 'Ești un om bun.');
  assert.equal(tidyRomanian('E un prieten.'), 'E un prieten.');
  assert.equal(tidyRomanian('Sunt un anetist.'), 'Sunt un anetist.');
});

test('text without either pattern is returned unchanged', () => {
  for (const s of ['Sunt obosită.', 'Am văzut-o pe Maria ieri.', '', 'Maya e prietena mea.']) {
    assert.equal(tidyRomanian(s), s);
  }
});
