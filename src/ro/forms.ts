import type { Agreement } from './gender.ts';
import { allEntries } from './lexicon.ts';
import { buildParadigm } from './noun.ts';
import { inflectAdjective } from './adjective.ts';
import { ADJECTIVES, FUNCTION_WORDS, NOUNS, NOUN_GENDER } from './words.ts';
import type { NounForms } from './noun.ts';
import type { Role } from './analyze.ts';

/**
 * The gendered word forms Acord knows, and how to find them in a sentence.
 * Shared by the post-editor, which rewrites them, and the detector, which
 * reads them.
 */

export type GenderedForm = {
  form: string;
  lemma: string;
  agreement: Agreement;
  /** The corresponding form in the other gender, from the SAME paradigm cell. */
  counterpart: string;
  kind: 'noun' | 'adjective' | 'function';
  /** Singular or plural: "obosiți" is a group of men or a mixed one, never one man. */
  number: 'sg' | 'pl';
  /**
   * A masculine job title. Romanian women use these for themselves too, and
   * not only where the feminine is disputed ("Sunt medic", "Sunt profesor",
   * "Sunt director"), so it shows the word's gender, not the speaker's.
   */
  sharedByWomen?: boolean;
  /** How settled the feminine form is -- carried through so post-edited
   *  machine output can flag a variant or contested word, same as the
   *  frame path does. */
  status?: string;
  /** Why the form is disputed, when it is -- shown to the user verbatim. */
  note?: string | null;
};

const numberOf = (cell: keyof NounForms) => (cell.startsWith('pl') ? 'pl' : 'sg');

/** The plural function words, by their masculine form. */
const PLURAL_FUNCTION = new Set(['cei', 'ai', 'de-ai', 'mei', 'tăi', 'săi', 'noștri', 'voștri', 'acești', 'acei']);

/** Nominative-accusative first, so the commonest reading is preferred. */
const CELLS: (keyof NounForms)[] = [
  'sg.na.indef', 'sg.na.def', 'pl.na.indef', 'pl.na.def',
  'sg.gd.indef', 'sg.gd.def', 'pl.gd.indef', 'pl.gd.def',
];

type PairInfo = Pick<GenderedForm, 'lemma' | 'kind' | 'number' | 'status' | 'note'>;


function addPair(ix: Map<string, GenderedForm[]>, m: string, f: string,
                 { lemma, kind, number, status, note }: PairInfo): void {
  if (!m || !f || m === f) return;  // invariable: a flip would be noise
  for (const [form, counterpart, agreement] of
       [[m, f, 'M'], [f, m, 'F']] as [string, string, Agreement][]) {
    const list = ix.get(form) ?? [];
    // A status describes the FEMININE form. The masculine of a contested pair
    // is not itself in dispute, so it must not carry the flag.
    const own = agreement === 'M' && status ? { status: 'normative', note: null } : { status, note };
    const shared = agreement === 'M' && kind === 'noun' && status !== undefined ? { sharedByWomen: true } : {};
    if (!list.some((e) => e.counterpart === counterpart)) {
      list.push({ form, lemma, agreement, counterpart, kind, number, ...own, ...shared });
    }
    ix.set(form, list);
  }
}

/** form -> the gendered readings of that form, with their counterparts. */
export function buildFormIndex(): Map<string, GenderedForm[]> {
  const ix = new Map<string, GenderedForm[]>();

  for (const e of allEntries()) {
    const info = { lemma: e.en, kind: 'noun', status: e.status, note: e.note } as const;
    addPair(ix, e.m, e.f, { ...info, number: 'sg' });
    if (e.formsM && e.formsF) {
      for (const cell of CELLS) {
        addPair(ix, e.formsM[cell], e.formsF[cell], { ...info, number: numberOf(cell) });
      }
    }
  }

  for (const [en, n] of Object.entries(NOUNS)) {
    const pm = buildParadigm(n.m, NOUN_GENDER.M, n.mPl);
    const pf = buildParadigm(n.f, NOUN_GENDER.F, n.fPl);
    for (const cell of CELLS) {
      addPair(ix, pm.forms[cell], pf.forms[cell], { lemma: en, kind: 'noun', number: numberOf(cell) });
    }
  }

  for (const [m, f] of FUNCTION_WORDS) {
    addPair(ix, m, f, { lemma: m, kind: 'function', number: PLURAL_FUNCTION.has(m) ? 'pl' : 'sg' });
  }

  for (const [en, a] of Object.entries(ADJECTIVES)) {
    for (const num of ['sg', 'pl'] as const) {
      addPair(ix, inflectAdjective(a, 'M', num, 'na'),
                  inflectAdjective(a, 'F', num, 'na'), { lemma: en, kind: 'adjective', number: num });
    }
  }
  return ix;
}

/** [masculine sg, feminine sg, masculine pl, feminine pl], null where a form reads two ways. */
export type AdjectiveRow = (string | null)[];

/**
 * A copy of `base` with more adjectives, for reading rather than rewriting: a
 * form the base already knows keeps its own readings, and `skip` keeps out
 * words that are mostly something else ("chiar" is "even").
 */
export function withAdjectives(base: ReadonlyMap<string, GenderedForm[]>, rows: AdjectiveRow[],
                               skip: (form: string) => boolean): Map<string, GenderedForm[]> {
  const ix = new Map([...base].map(([form, list]) => [form, [...list]]));
  const fresh = new Map<string, GenderedForm[]>();
  for (const [msg, fsg, mpl, fpl] of rows) {
    const lemma = msg ?? mpl ?? '';
    if (msg && fsg) addPair(fresh, msg, fsg, { lemma, kind: 'adjective', number: 'sg' });
    if (mpl && fpl) addPair(fresh, mpl, fpl, { lemma, kind: 'adjective', number: 'pl' });
  }
  for (const [form, list] of fresh) if (!ix.has(form) && !skip(form)) ix.set(form, list);
  return ix;
}

let cached: Map<string, GenderedForm[]> | undefined;
export const formIndex = () => (cached ??= buildFormIndex());

export type Candidate = {
  index: number;
  token: string;
  options: GenderedForm[];
  autoApplied?: boolean;
  /** Set when this word was printed in both forms. */
  doubled?: boolean;
  /** Whose gender this word follows, when that is unambiguous. */
  role?: Role;
  /** The named person it follows, when the subject is a name we could read. */
  person?: string;
};

export const bare = (t: string) => t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
export const isUpper = (t: string) => t.length > 0 && t[0]! === t[0]!.toUpperCase();

/** Every token that is a gendered form we recognise. */
export function findGendered(text: string, ix = formIndex()): Candidate[] {
  const out: Candidate[] = [];
  text.split(/\s+/).forEach((token, i) => {
    const options = ix.get(bare(token).toLowerCase());
    if (options?.length) out.push({ index: i, token: bare(token), options });
  });
  return out;
}
