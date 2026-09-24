import type { NaturalGender, Num } from '../core/types.ts';
import { inflectAdjective } from './adjective.ts';
import type { Agreement } from './gender.ts';
import { lookup, realize as realizeOccupation } from './lexicon.ts';
import { buildParadigm, inflectNoun } from './noun.ts';
import {
  ADJECTIVES, COPULA_PRESENT, NOUNS, NOUN_GENDER, PARTICIPLES,
  PERFECT_AUX, POSSESSIVE_1SG, type PersonNumber,
} from './words.ts';

export type RefId = string;

export type Referent = {
  id: RefId;
  gender: NaturalGender;
  person: 1 | 2 | 3;
  /** Semantic number -- what adjectives agree with. */
  number: Num;
  /**
   * Syntactic number, when politeness splits it from the semantic one:
   * "Dumneavoastra sunteti obosita" is 2pl on the verb but feminine SINGULAR
   * on the adjective. Defaults to `number`.
   */
  verbNumber?: Num;
};

/**
 * Frames are a discriminated union rather than one clause type with optional
 * slots: gender lives on the Referent, so adding a frame costs one realizer
 * and never multiplies with the feature set.
 */
export type Clause =
  | { frame: 'predicate-noun'; subject: RefId; noun: string }
  | { frame: 'predicate-adj'; subject: RefId; adj: string }
  | { frame: 'possessed-noun'; possessor: RefId; possessed: RefId; noun: string }
  | { frame: 'past-transitive'; subject: RefId; object: RefId; verb: string };

export type Token = {
  text: string;
  /** Points back into the IR, so an override re-realizes instead of substituting. */
  ref?: RefId;
  status?: string;
  note?: string | null;
};

/**
 * `clause` gets sentence capitalization; `phrase` is a bare NP and does not.
 * Carried by each realizer so a new frame must state which it is, rather than
 * being decided by a string comparison the compiler cannot check.
 */
export type Realized = { tokens: Token[]; kind: 'clause' | 'phrase' };

const agreementOf = (r: Referent): Agreement | null =>
  r.gender === 'male' ? 'M' : r.gender === 'female' ? 'F' : null;

const find = (refs: Referent[], id: RefId): Referent => {
  const r = refs.find((x) => x.id === id);
  if (!r) throw new Error(`unknown referent: ${id}`);
  return r;
};

const verbKey = (r: Referent): PersonNumber => `${r.person}${r.verbNumber ?? r.number}`;

function predicateNoun(c: Clause & { frame: 'predicate-noun' }, refs: Referent[]): Realized {
  const subj = find(refs, c.subject);
  const entry = lookup(c.noun);
  if (!entry) throw new Error(`unknown word: ${c.noun}`);
  const out = realizeOccupation(entry, subj.gender);
  return {
    kind: 'clause',
    tokens: [
      { text: COPULA_PRESENT[verbKey(subj)] },
      { text: out.form, ref: subj.id, status: out.status, note: out.note },
    ],
  };
}

function predicateAdj(c: Clause & { frame: 'predicate-adj' }, refs: Referent[]): Realized {
  const subj = find(refs, c.subject);
  const forms = ADJECTIVES[c.adj];
  if (!forms) throw new Error(`unknown word: ${c.adj}`);
  const a = agreementOf(subj);
  // Both alternatives sit in the same slot, so a doublet can express them.
  const text = a
    ? inflectAdjective(forms, a, subj.number, 'na')
    : `${inflectAdjective(forms, 'M', subj.number, 'na')}/${inflectAdjective(forms, 'F', subj.number, 'na')}`;
  return {
    kind: 'clause',
    tokens: [
      { text: COPULA_PRESENT[verbKey(subj)] },
      { text, ref: subj.id, note: a ? null : 'Romanian has no neutral form here; both are shown' },
    ],
  };
}

/** "my friend" -- the NOUN's gender comes from the friend, not from me. */
function possessedNoun(c: Clause & { frame: 'possessed-noun' }, refs: Referent[]): Realized {
  find(refs, c.possessor); // 1sg possessor is the only series supported
  const owned = find(refs, c.possessed);
  const noun = NOUNS[c.noun];
  if (!noun) throw new Error(`unknown word: ${c.noun}`);

  const phrase = (a: Agreement) => {
    const paradigm = buildParadigm(a === 'M' ? noun.m : noun.f, NOUN_GENDER[a],
                                   a === 'M' ? noun.mPl : noun.fPl);
    // The possessive agrees with the POSSESSED noun.
    return `${inflectNoun(paradigm, 'sg', 'na', 'def')} ${POSSESSIVE_1SG[`${a}sg`]}`;
  };

  const a = agreementOf(owned);
  if (a) return { kind: 'phrase', tokens: [{ text: phrase(a), ref: owned.id }] };
  return {
    kind: 'phrase',
    tokens: [{
      text: `${phrase('M')}/${phrase('F')}`,
      ref: owned.id,
      note: 'Romanian has no neutral form here; both are shown',
    }],
  };
}

function pastTransitive(c: Clause & { frame: 'past-transitive' }, refs: Referent[]): Realized {
  const subj = find(refs, c.subject);
  const obj = find(refs, c.object);
  const participle = PARTICIPLES[c.verb];
  if (!participle) throw new Error(`unknown word: ${c.verb}`);
  const a = agreementOf(obj);
  // Here gender changes the clitic's POSITION, not just its form, so no
  // single-slot doublet can express both. Refusing beats guessing masculine.
  if (!a) {
    throw new Error(
      `gender required: the object "${c.object}" has unspecified gender, and ` +
      `Romanian places the object clitic differently for each (L-am vazut / Am vazut-o)`,
    );
  }
  const aux = PERFECT_AUX[verbKey(subj)];
  if (a === 'F') return { kind: 'clause', tokens: [{ text: aux }, { text: `${participle}-o`, ref: obj.id }] };
  return { kind: 'clause', tokens: [{ text: `l-${aux}`, ref: obj.id }, { text: participle }] };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function realizeClause(clause: Clause, refs: Referent[]): Realized {
  const out =
    clause.frame === 'predicate-noun' ? predicateNoun(clause, refs)
    : clause.frame === 'predicate-adj' ? predicateAdj(clause, refs)
    : clause.frame === 'possessed-noun' ? possessedNoun(clause, refs)
    : pastTransitive(clause, refs);

  const [first, ...rest] = out.tokens;
  if (out.kind === 'phrase' || !first) return out;
  return { ...out, tokens: [{ ...first, text: capitalize(first.text) }, ...rest] };
}
