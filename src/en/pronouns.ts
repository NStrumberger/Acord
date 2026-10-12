import type { Agreement } from '../ro/gender.ts';
import type { Detection } from '../ro/detect.ts';

/**
 * Romanian leaves the subject out ("E obosită"), so the translation into
 * English has to pick he or she, and the model picks from habit. When the
 * Romanian shows the gender and the English got it wrong, put it right --
 * but only when no one else in the message could be the he or she meant.
 */

export type PronounFix = {
  text: string;
  /** Each word replaced; `index` counts words of `text` split on whitespace. */
  changed: { index: number; from: string; to: string }[];
};

const MASCULINE = /\b(he|him|his|himself)\b/i;
const FEMININE = /\b(she|her|hers|herself)\b/i;

/**
 * Words after "his" that make it stand alone ("it is his and mine") rather
 * than come before a noun ("his car"): "hers" in the first case, "her" in the
 * second.
 */
const NOT_A_NOUN = new Set([
  'the', 'a', 'an', 'to', 'that', 'this', 'these', 'those', 'and', 'but', 'or', 'nor', 'so', 'yet',
  'if', 'when', 'because', 'while', 'as', 'than', 'in', 'on', 'at', 'for', 'with', 'about', 'from',
  'of', 'by', 'into', 'onto', 'over', 'under', 'up', 'down', 'out', 'off', 'back', 'away', 'again',
  'too', 'also', 'very', 'now', 'then', 'today', 'tonight', 'yesterday', 'tomorrow', 'here', 'there',
  'all', 'both', 'some', 'any', 'how', 'what', 'why', 'where', 'who', 'which', 'whether', 'not',
  'never', 'always', 'just', 'only', 'really', 'already', 'still', 'once', 'home', 'go', 'come',
  'know', 'be', 'do', 'feel', 'think', 'see', 'stay', 'leave', 'sleep', 'eat', 'work', 'help', 'laugh',
  'cry', 'wait', 'have', 'get', 'make', 'take', 'tell', 'say', 'call', 'try', 'like', 'love', 'well',
]);

const recase = (word: string, like: string) =>
  like === like.toUpperCase() && like.length > 1 ? word.toUpperCase()
    : like[0] === like[0]!.toUpperCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word;

/**
 * Rewrite every pronoun of the other gender as `to`.
 *
 * "her" cannot be turned masculine safely: "I gave her flowers" wants "him",
 * "I called her mother" may want either, and English marks neither. A text
 * with "her" in it is left as it is -- a wrong correction is worse than none.
 */
export function swapPronouns(english: string, to: Agreement): PronounFix {
  const changed: PronounFix['changed'] = [];
  if (to === 'M' && /\bher\b/i.test(english)) return { text: english, changed };
  const text = english.replace(/\b(he|him|his|himself|she|her|hers|herself)\b/gi, (match, _w, at: number) => {
    const word = match.toLowerCase();
    // What follows decides "his": "her" before a noun, "hers" on its own.
    const after = /^([^\s\p{L}]*)\s+([\p{L}']+)/u.exec(english.slice(at + match.length));
    const beforeNoun = !!after && after[1] === '' && !NOT_A_NOUN.has(after[2]!.toLowerCase());
    const table: Record<string, string> = to === 'F'
      ? { he: 'she', him: 'her', his: beforeNoun ? 'her' : 'hers', himself: 'herself' }
      : { she: 'he', hers: 'his', herself: 'himself' };
    const swapped = Object.hasOwn(table, word) ? table[word] : undefined;
    if (!swapped) return match;
    const out = recase(swapped, match);
    changed.push({ index: english.slice(0, at).split(/\s+/).length - 1, from: match, to: out });
    return out;
  });
  return { text, changed };
}

/**
 * Correct the English he or she to what the Romanian shows, when it is safe:
 * the Romanian shows one gender for its unstated third person, the English
 * uses only the other pronoun, and nobody else the Romanian mentions has that
 * other gender -- a brother may well be the "he".
 */
export function fixPronouns(english: string, detection: Detection): PronounFix {
  const unchanged = { text: english, changed: [] };
  const shown = new Set(detection.unstated.map((e) => e.gender));
  if (shown.size !== 1) return unchanged;
  const [gender] = [...shown] as [Agreement];
  const hasM = MASCULINE.test(english), hasF = FEMININE.test(english);
  if (hasM === hasF) return unchanged;   // neither, or both: two people
  const wrong: Agreement = hasM ? 'M' : 'F';
  if (wrong === gender) return unchanged;

  const own = new Set(detection.unstated.map((e) => e.index));
  const someoneElse =
    detection.people.some((p) => p.evidence.some((e) => e.gender === wrong)) ||
    (detection.others?.evidence ?? []).some((e) => e.gender === wrong && !own.has(e.index));
  return someoneElse ? unchanged : swapPronouns(english, gender);
}
