import type { AdjectiveForms } from './adjective.ts';
import type { LexicalGender } from './gender.ts';

/**
 * Small hand-written vocabulary for words outside the occupation lexicon.
 * Forms are stored, not derived -- same reason as R0. Kept inline because a
 * dozen entries do not earn a JSON file and a loader.
 */
export const ADJECTIVES: Record<string, AdjectiveForms> = {
  tired: { msg: 'obosit', fsg: 'obosită', mpl: 'obosiți', fpl: 'obosite' },
  happy: { msg: 'fericit', fsg: 'fericită', mpl: 'fericiți', fpl: 'fericite' },
  tall: { msg: 'înalt', fsg: 'înaltă', mpl: 'înalți', fpl: 'înalte' },
  good: { msg: 'bun', fsg: 'bună', mpl: 'buni', fpl: 'bune' },
  big: { msg: 'mare', fsg: 'mare', mpl: 'mari', fpl: 'mari' },
  ready: { msg: 'gata', fsg: 'gata', mpl: 'gata', fpl: 'gata' }, // invariable
};

/** Non-occupation nouns with a masculine/feminine pair. */
export const NOUNS: Record<string, { m: string; f: string; mPl: string; fPl: string }> = {
  friend: { m: 'prieten', f: 'prietenă', mPl: 'prieteni', fPl: 'prietene' },
  colleague: { m: 'coleg', f: 'colegă', mPl: 'colegi', fPl: 'colege' },
  neighbour: { m: 'vecin', f: 'vecină', mPl: 'vecini', fPl: 'vecine' },
};

/** Past participles, invariable in the compound past with a preceding auxiliary. */
export const PARTICIPLES: Record<string, string> = {
  see: 'văzut', call: 'sunat', meet: 'întâlnit', help: 'ajutat',
};

/** Exact key space, so the compiler enforces these paradigms stay total. */
export type PersonNumber = `${1 | 2 | 3}${'sg' | 'pl'}`;

export const COPULA_PRESENT: Record<PersonNumber, string> = {
  '1sg': 'sunt', '2sg': 'ești', '3sg': 'este',
  '1pl': 'suntem', '2pl': 'sunteți', '3pl': 'sunt',
};

export const PERFECT_AUX: Record<PersonNumber, string> = {
  '1sg': 'am', '2sg': 'ai', '3sg': 'a',
  '1pl': 'am', '2pl': 'ați', '3pl': 'au',
};

/**
 * First-person possessive, agreeing with the POSSESSED noun. All four cells are
 * required by the type even though only the singulars are reachable today --
 * a partial paradigm is what lets "undefined" leak into generated Romanian.
 */
export const POSSESSIVE_1SG: Record<`${'M' | 'F'}${'sg' | 'pl'}`, string> = {
  Msg: 'meu', Fsg: 'mea', Mpl: 'mei', Fpl: 'mele',
};

export const NOUN_GENDER: Record<'M' | 'F', LexicalGender> = { M: 'm', F: 'f' };

/**
 * Closed-class words that carry gender: articles, possessives, demonstratives.
 * Finite, fully known and stable - exactly what a rule-based system should own
 * outright. Without these, a predicate like "cel mai bun prieten al meu" can
 * only be half-corrected, which is worse than not correcting it at all.
 */
export const FUNCTION_WORDS: readonly (readonly [string, string])[] = [
  ['un', 'o'],                                    // indefinite article
  ['cel', 'cea'], ['cei', 'cele'],                // demonstrative / superlative
  ['al', 'a'], ['ai', 'ale'],                     // possessive article
  ['meu', 'mea'], ['mei', 'mele'],
  ['tău', 'ta'], ['tăi', 'tale'],
  ['său', 'sa'], ['săi', 'sale'],
  ['nostru', 'noastră'], ['noștri', 'noastre'],
  ['vostru', 'voastră'], ['voștri', 'voastre'],
  ['acest', 'această'], ['acești', 'aceste'],
  ['acel', 'acea'], ['acei', 'acele'],
];
