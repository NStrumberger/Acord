import { allEntries } from './lexicon.ts';

/**
 * Smooths two habits of the Bergamot model that reviewers marked as stiff
 * (notes/R12), before the post-editor sees the text:
 *
 *  - "Eu sunt profesoară": Romanian drops a subject pronoun the verb already
 *    marks, unless it is there for contrast;
 *  - "Fratele meu este un contabil": a job title on its own after a copula
 *    takes no article ("este contabil"); with an adjective it keeps one
 *    ("este un contabil bun").
 *
 * Running first also hands the post-editor the sentence shapes it was built
 * and reviewed on. Only known job titles lose their article: a miss is never a guess.
 */

/** Verbs a pronoun may be dropped before, by pronoun: copulas, "have", "work". */
const PRO_DROP: Record<string, ReadonlySet<string>> = {
  eu: new Set(['sunt', 'eram', 'am', 'lucrez']),
  tu: new Set(['ești', 'erai', 'ai', 'lucrezi']),
  noi: new Set(['suntem', 'eram', 'am', 'avem', 'lucrăm']),
  voi: new Set(['sunteți', 'erați', 'ați', 'aveți', 'lucrați']),
  // English "they" has no gender, so the model's "ei" is a guess, and an
  // explicit pronoun would pin it against the user's setting. "el"/"ea" stay:
  // a singular he or she in the English is evidence (see postedit.ts).
  ei: new Set(['sunt', 'erau', 'au', 'lucrează']),
  ele: new Set(['sunt', 'erau', 'au', 'lucrează']),
};

/** Any other subject pronoun later in the sentence makes the first one contrastive. */
const OTHER_PRONOUN = /(?<!\p{L})(eu|tu|el|ea|noi|voi|ei|ele)(?!\p{L})/iu;

const COPULA = '(?:sunt|ești|este|e|suntem|sunteți|era|eram|erai|erați|erau|fost)';
/** Copula, article, one word, then the end of the sentence. */
const BARE_TITLE = new RegExp(`(?<!\\p{L})(${COPULA}) (?:un|o) ([\\p{L}-]+)(?=[.!?…]*$)`, 'iu');

let titles: ReadonlySet<string> | undefined;
/** Indefinite singular job titles, both genders. */
function jobTitles(): ReadonlySet<string> {
  titles ??= new Set(allEntries().flatMap((e) => [
    e.m, e.f, e.fAlt, e.formsM?.['sg.na.indef'], e.formsF?.['sg.na.indef'],
  ].filter((w): w is string => !!w).map((w) => w.toLowerCase())));
  return titles;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function dropPronoun(sentence: string): string {
  // "Eu nu sunt …" drops the same way: the negation stays with its verb.
  const m = /^(\P{L}*)(Eu|Tu|Noi|Voi|Ei|Ele) ((?:nu )?)(\p{L}+)/u.exec(sentence);
  if (!m) return sentence;
  const [whole, lead = '', pronoun = '', negation = '', verb = ''] = m;
  if (!PRO_DROP[pronoun.toLowerCase()]?.has(verb.toLowerCase())) return sentence;
  const rest = sentence.slice(whole.length);
  if (OTHER_PRONOUN.test(rest)) return sentence;
  return `${lead}${capitalise(negation + verb)}${rest}`;
}

/**
 * "Acesta este un medic", "Ce este un medic?": with "this" or a question word
 * as subject the noun names a kind of thing, not someone's job, and the
 * article belongs there.
 */
const NOT_A_PERSON = new Set(['acesta', 'aceasta', 'asta', 'ăsta', 'acela', 'aceea', 'aia', 'ăla',
  'aceștia', 'acestea', 'ce', 'cine', 'care']);

function dropArticle(sentence: string): string {
  return sentence.replace(BARE_TITLE, (match, copula: string, noun: string, at: number) => {
    const before = /(\p{L}+)\P{L}*$/u.exec(sentence.slice(0, at))?.[1]?.toLowerCase();
    if (before && NOT_A_PERSON.has(before)) return match;
    return jobTitles().has(noun.toLowerCase()) ? `${copula} ${noun}` : match;
  });
}

export function tidyRomanian(text: string): string {
  // Split after sentence ends, keeping the whitespace so nothing else moves.
  return text.split(/((?<=[.!?…])\s+)/u)
    .map((part) => (/^\s*$/u.test(part) ? part : dropArticle(dropPronoun(part))))
    .join('');
}
