import type { Case, Definiteness, Num } from '../core/types.ts';
import { resolveAgreement, type Agreement, type LexicalGender } from './gender.ts';

/** The eight cells of a Romanian noun paradigm, stored rather than derived. */
export type NounForms = Record<`${Num}.${Case}.${Definiteness}`, string>;

export type NounParadigm = {
  lemma: string;
  gender: LexicalGender;
  forms: NounForms;
};

/** Romanian's definite article is enclitic: profesor -> profesorul. */
function definiteSingular(lemma: string, agreement: Agreement): string {
  if (agreement === 'M') {
    if (lemma.endsWith('u')) return `${lemma}l`;          // codru -> codrul
    if (lemma.endsWith('e')) return `${lemma}le`;         // frate -> fratele
    return `${lemma}ul`;                                  // profesor -> profesorul
  }
  if (lemma.endsWith('ă')) return `${lemma.slice(0, -1)}a`;   // fată -> fata
  if (lemma.endsWith('ie')) return `${lemma.slice(0, -2)}ia`; // câmpie -> câmpia
  if (lemma.endsWith('e')) return `${lemma.slice(0, -1)}ea`;  // carte -> cartea
  if (lemma.endsWith('a')) return `${lemma}ua`;               // cafea -> cafeaua
  return `${lemma}a`;
}

function genDatSingularDefinite(lemma: string, plural: string, agreement: Agreement): string {
  if (agreement === 'M') {
    if (lemma.endsWith('u') || lemma.endsWith('e')) return `${lemma}lui`;
    return `${lemma}ului`;
  }
  // Feminine gen-dat is built on the PLURAL stem: fete -> fetei, cărți -> cărții.
  if (plural.endsWith('e')) return `${plural.slice(0, -1)}ei`;
  return `${plural}i`;
}

function definitePlural(plural: string, agreement: Agreement): string {
  return agreement === 'M' ? `${plural}i` : `${plural}le`;
}

/**
 * Generate a candidate paradigm. This is a CURATION AID used at build time --
 * see notes/R0-findings.md. The app resolves stored forms at runtime and never
 * derives, because a plausible-but-wrong Romanian word is undetectable
 * downstream.
 */
export function buildParadigm(
  lemma: string,
  gender: LexicalGender,
  plural: string,
): NounParadigm {
  const sg = resolveAgreement(gender, 'sg');
  const pl = resolveAgreement(gender, 'pl');
  return {
    lemma,
    gender,
    forms: {
      'sg.na.indef': lemma,
      'sg.na.def': definiteSingular(lemma, sg),
      // Masculine keeps the bare lemma; feminine borrows the plural: "unei fete".
      'sg.gd.indef': sg === 'M' ? lemma : plural,
      'sg.gd.def': genDatSingularDefinite(lemma, plural, sg),
      'pl.na.indef': plural,
      'pl.na.def': definitePlural(plural, pl),
      'pl.gd.indef': plural,
      'pl.gd.def': `${plural}lor`,
    },
  };
}

export function inflectNoun(
  paradigm: NounParadigm,
  num: Num,
  grammaticalCase: Case,
  definiteness: Definiteness,
): string {
  return paradigm.forms[`${num}.${grammaticalCase}.${definiteness}`];
}
