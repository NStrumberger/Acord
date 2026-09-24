import type { NaturalGender } from '../core/types.ts';
import type { Agreement, LexicalGender } from './gender.ts';
import type { NounForms, NounParadigm } from './noun.ts';

/**
 * How well established a form is. Assigned from evidence, not opinion:
 * see notes/R2-findings.md.
 */
export type Status = 'normative' | 'variant' | 'attested' | 'contested' | 'none';

/**
 * Gender-neutral output is NOT a value of the gender feature -- Romanian has
 * no general neutral register, so it is the selection of a different
 * construction, per lexeme.
 */
export type NeutralStrategy =
  | { kind: 'epicene_noun'; form: string; gender: LexicalGender }
  | { kind: 'verb_paraphrase'; verb1sg: string; verb2sg: string }
  | { kind: 'doublet' }
  | { kind: 'none' };

export type OccupationEntry = {
  en: string;
  m: string;
  f: string;
  fAlt: string | null;
  status: Status;
  note: string | null;
  gender: LexicalGender;
  pluralM: string | null;
  pluralF: string | null;
  formsM: NounForms | null;
  formsF: NounForms | null;
  neutral: NeutralStrategy;
  sources: string[];
  reviewed: boolean;
};

// Imported rather than read from disk: this module must run in the browser,
// where there is no fs. Works in Node and under a bundler alike.
import raw from './lexicon.occupations.json' with { type: 'json' };

const data = raw as unknown as { entries: OccupationEntry[] };

const byEnglish = new Map(data.entries.map((e) => [e.en, e]));

/** Returns undefined for unknown words. A miss is never a guess. */
export function lookup(en: string): OccupationEntry | undefined {
  return byEnglish.get(en.toLowerCase().trim());
}

export type Realization = {
  form: string;
  status: Status;
  /** Competing forms the user should be shown rather than silently denied. */
  alternatives: string[];
  note: string | null;
  strategy: NeutralStrategy['kind'] | 'plain';
};

/**
 * Produce the Romanian form for a referent of the given natural gender,
 * together with everything the UI needs to be honest about it.
 */
export function realize(entry: OccupationEntry, gender: NaturalGender): Realization {
  if (gender === 'male') {
    // `status` records how settled the FEMININE form is -- the masculine is the
    // unmarked citation form and is not what the dispute is about. Reporting
    // the entry's status here would label "Sunt inginer" as contested, which
    // it is not.
    return { form: entry.m, status: 'normative', alternatives: [], note: null, strategy: 'plain' };
  }
  if (gender === 'female') {
    return {
      form: entry.f,
      status: entry.status,
      alternatives: entry.fAlt ? [entry.fAlt] : [],
      note: entry.note,
      strategy: 'plain',
    };
  }
  return neutral(entry);
}

function neutral(entry: OccupationEntry): Realization {
  const n = entry.neutral;
  if (n.kind === 'epicene_noun')
    return { form: n.form, status: entry.status, alternatives: [], note: null, strategy: n.kind };
  if (n.kind === 'verb_paraphrase')
    return { form: n.verb1sg, status: entry.status, alternatives: [], note: null, strategy: n.kind };
  // Romanian lacks a general neutral register, so doubling is the honest
  // fallback -- never an invented form like prieten@ or obosit*a.
  return {
    form: `${entry.m}/${entry.f}`,
    status: entry.status,
    alternatives: [],
    note: 'Romanian has no neutral form here; both are shown',
    strategy: 'doublet',
  };
}

/** The attested paradigm for one agreement class, or undefined if not curated. */
export function paradigmFor(entry: OccupationEntry, agreement: Agreement): NounParadigm | undefined {
  const forms = agreement === 'M' ? entry.formsM : entry.formsF;
  if (!forms) return undefined;
  return { lemma: agreement === 'M' ? entry.m : entry.f, gender: entry.gender, forms };
}

export const allEntries = (): readonly OccupationEntry[] => data.entries;
