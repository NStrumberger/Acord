import type { Num } from '../core/types.ts';

/**
 * Gender of a LEXEME, as listed in the dictionary. Romanian has three, but
 * the third is not a third agreement class -- see resolveAgreement.
 */
export type LexicalGender = 'm' | 'f' | 'n';

/**
 * What an agreement site actually consumes. Romanian has only two: there is
 * no such thing as "neuter agreement". Inflection functions accept this type
 * and never LexicalGender, which makes neuter physically unpassable to an
 * agreement site.
 */
export type Agreement = 'M' | 'F';

/**
 * The single chokepoint where Romanian neuter is resolved.
 *
 * Neuter behaves masculine in the singular and feminine in the plural:
 *   un scaun bun      (M sg)
 *   doua scaune bune  (F pl)
 *
 * Total by construction -- every gender and number yields an agreement class.
 */
export function resolveAgreement(gender: LexicalGender, num: Num): Agreement {
  if (gender === 'm') return 'M';
  if (gender === 'f') return 'F';
  return num === 'sg' ? 'M' : 'F';
}
