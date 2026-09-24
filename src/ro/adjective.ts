import type { Case, Num } from '../core/types.ts';
import type { Agreement } from './gender.ts';

/**
 * A Romanian adjective's four agreement slots, stored rather than derived.
 * Classes (4-form bun/buna/buni/bune, 3-form mic/mica/mici, 2-form mare/mari,
 * invariable gri) fall out of how many distinct strings fill these slots, so
 * the class is a reported property rather than a branch in the code.
 */
export type AdjectiveForms = {
  msg: string;
  fsg: string;
  mpl: string;
  fpl: string;
};

/**
 * Realize an adjective. Note the one irregularity worth encoding: a feminine
 * singular in the genitive-dative takes the feminine PLURAL form --
 * "unei fete bune", never *"unei fete buna".
 */
export function inflectAdjective(
  forms: AdjectiveForms,
  agreement: Agreement,
  num: Num,
  grammaticalCase: Case,
): string {
  if (num === 'pl') return agreement === 'M' ? forms.mpl : forms.fpl;
  if (agreement === 'M') return forms.msg;
  return grammaticalCase === 'gd' ? forms.fpl : forms.fsg;
}

/** How many distinct surface forms this adjective has: 4, 3, 2 or 1. */
export function classifyAdjective(forms: AdjectiveForms): number {
  return new Set([forms.msg, forms.fsg, forms.mpl, forms.fpl]).size;
}
