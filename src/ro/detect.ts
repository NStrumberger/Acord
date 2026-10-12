import type { Agreement } from './gender.ts';
import { normalizeRomanian } from './normalize.ts';
import { KINSHIP } from './words.ts';
import { bare, findGendered, isUpper, type GenderedForm } from './forms.ts';
import { analyze, governance, known, namesIn, wordIndex, type Span } from './analyze.ts';
import nameData from './detect.names.json' with { type: 'json' };

/**
 * What a Romanian message shows about the gender of the people in it: the
 * writer, the person they write to, anyone they name, and anyone else.
 *
 * Only words the post-editor already trusts to agree with someone count, and
 * only as far as they must: "obosiți" is a group of men or a mixed one, so it
 * says nothing about any one of them, and "Sunt medic" is said by women too.
 * A gap is reported as not shown, never filled with a guess -- the point is
 * to read what the other person wrote, not what a model assumed.
 */

/** One word that shows a gender. `index` counts words of the normalised text. */
export type Evidence = { word: string; index: number; gender: Agreement; plural: boolean };

export type Finding = {
  /** 'conflict': the words disagree, and which is right is not ours to say. */
  status: 'shown' | 'notShown' | 'conflict';
  /** 'mixed' only for everyone else: several people, not all the same. */
  gender?: Agreement | 'mixed';
  /** Several people: a masculine plural may be all men or a mixed group. */
  plural?: boolean;
  evidence: Evidence[];
};
export type NamedFinding = Finding & { name: string };

export type Detection = {
  /** The writer. */
  them: Finding;
  /** The reader, as the writer addresses them. */
  you: Finding;
  /** Everyone named, in order of appearance, whether or not anything shows. */
  people: NamedFinding[];
  /** People neither named nor taking part; absent when there are none. */
  others?: Finding;
  /**
   * Words agreeing with one third person the Romanian leaves unstated ("E
   * obosită"): whoever the English had to call he or she. Not a finding --
   * it may be a thing -- but enough to say which pronoun the English owes.
   */
  unstated: Evidence[];
};

type Num = 'sg' | 'pl' | undefined;
const THEM = '@them', YOU = '@you', OTHERS = '@others';

/** Pronouns that state a third person's gender. "ei" is left out: it is also "her". */
const PRONOUNS: ReadonlyMap<string, [Agreement, Num]> = new Map([
  ['el', ['M', 'sg']], ['ea', ['F', 'sg']], ['ele', ['F', 'pl']],
  ['dânsul', ['M', 'sg']], ['dânsa', ['F', 'sg']], ['dumnealui', ['M', 'sg']], ['dumneaei', ['F', 'sg']],
  ['lui', ['M', 'sg']],
]);
const KIN_PLURAL = new Set(['surori', 'surorile', 'părinți', 'părinții', 'frați', 'frații']);

/** Given names, so a sentence-initial "Ioana" is a person. Their usual gender is not kept. */
const GIVEN = new Set(nameData.names);

/**
 * One gender, when every reading of the form agrees. The number is the first
 * reading's: the index lists the nominative first, which is what follows a
 * copula ("profesoare" is a plural there, not the genitive singular).
 */
function readingOf(options: GenderedForm[]): { gender: Agreement; number: Num } | undefined {
  const genders = new Set(options.map((o) => o.agreement));
  if (genders.size !== 1) return undefined;
  return { gender: [...genders][0]!, number: options[0]?.number };
}

const startsSentence = (tokens: string[], j: number) =>
  j === 0 || /[.!?…]\P{L}*$/u.test(tokens[j - 1]!) || /^\P{L}*["„«“]/u.test(tokens[j]!);

/**
 * Names the English lost ("Ioana" comes back as "Joan"): a capitalised word we
 * do not know, inside a sentence. At the start of one a capital proves
 * nothing ("Cartea"), so there it must be a known given name.
 */
function romanianNames(tokens: string[]): Set<string> {
  const names = new Set<string>();
  tokens.forEach((raw, j) => {
    const word = bare(raw);
    if (word.length < 2 || !isUpper(word) || word === word.toUpperCase()) return;
    if (startsSentence(tokens, j) && !GIVEN.has(word)) return;
    if (!known().has(word.toLowerCase())) names.add(word.toLowerCase());
  });
  return names;
}

/** Who a word in this span agrees with. */
function whoFor(span: Span, tokens: string[], number: Num): string[] {
  const member = (m: string) => (m === '@speaker' ? THEM : m === '@addressee' ? YOU : m);
  if (span.group) return span.group.map(member);
  if (span.role === 'speaker') {
    // "Sunt obosite" can only be "they are": nobody says "I am" in the plural.
    const sunt = bare(tokens[span.copula] ?? '').toLowerCase() === 'sunt';
    return [sunt && number === 'pl' ? OTHERS : THEM];
  }
  if (span.role === 'addressee') return [YOU];
  return [span.subject ?? OTHERS];
}

function resolve(evidence: Evidence[], several: boolean): Finding {
  const genders = new Set(evidence.map((e) => e.gender));
  if (!genders.size) return { status: 'notShown', evidence: [] };
  const plural = several && evidence.some((e) => e.plural);
  if (genders.size === 1) return { status: 'shown', gender: [...genders][0]!, plural, evidence };
  return several ? { status: 'shown', gender: 'mixed', plural, evidence } : { status: 'conflict', evidence };
}

export function detectGender(romanian: string, english = ''): Detection {
  const text = normalizeRomanian(romanian);
  const tokens = text.split(/\s+/);
  const words = tokens.map((t) => bare(t).toLowerCase());
  const confirmed = namesIn(tokens, english);
  const names = new Set([...confirmed, ...romanianNames(tokens)]);
  const ix = wordIndex();
  const candidates = findGendered(text, ix);
  const { owners } = analyze(tokens, names, english, { readStated: false, index: ix });
  // "E bun" is "he is good" or just as well "it is good", and "E bună" may be
  // about a book: with no subject in sight, only a word for a person ("E
  // profesoară") shows someone's gender.
  const { isOrdinal, headOf, free, afterPreposition, adverb, anonymous, personal } =
    governance(tokens, candidates, owners);
  const cand = new Map(candidates.map((c) => [c.index, c]));
  const shared = (j: number | undefined) =>
    j !== undefined && (cand.get(j)?.options.some((o) => o.sharedByWomen) ?? false);
  const found = new Map<string, Evidence[]>();
  const unstated: Evidence[] = [];
  const add = (who: string[], index: number, gender: Agreement, number: Num) => {
    for (const key of who) {
      // A masculine plural shows only that one of a group is a man, which
      // says nothing about any one person in it.
      if (key !== OTHERS && gender === 'M' && number !== 'sg') continue;
      const list = found.get(key) ?? [];
      list.push({ word: bare(tokens[index]!), index, gender, plural: number === 'pl' });
      found.set(key, list);
    }
  };

  for (const c of candidates) {
    const span = owners[c.index];
    if (!span || span.fixed || isOrdinal(c.index) || !free(c.index) || afterPreposition(c.index)) continue;
    const reading = readingOf(c.options);
    if (!reading) continue;
    // "Sunt (un) medic (bun)": the masculine a woman would use too.
    if (reading.gender === 'M' && (shared(c.index) || shared(headOf(c.index)))) continue;
    if (reading.gender === 'M' && reading.number === 'sg' && adverb(c.index)) continue;
    const who = whoFor(span, tokens, reading.number);
    if (span.role === 'other' && anonymous(span) && reading.number === 'sg') {
      unstated.push({ word: bare(tokens[c.index]!), index: c.index, gender: reading.gender, plural: false });
    }
    if (who.includes(OTHERS) && (anonymous(span) || span.role === 'speaker') && !personal(c.index)) continue;
    add(who, c.index, reading.gender, reading.number);
  }

  words.forEach((w, j) => {
    const kin = KINSHIP.get(w);
    // "să fiu" is the verb "to be"; only "un fiu" is a son.
    if (kin && !(w === 'fiu' && words[j - 1] !== 'un')) {
      // "Sunt sora lui" is the writer; "Sora mea e obosită" and "Sunt la sora
      // mea" are someone else.
      const span = owners[j];
      const number: Num = KIN_PLURAL.has(w) ? 'pl' : 'sg';
      const own = span && !span.fixed && !afterPreposition(j);
      add(own ? whoFor(span, tokens, number) : [OTHERS], j, kin, number);
      return;
    }
    if (kin) return;
    const pronoun = PRONOUNS.get(w);
    // "lui Ion" is the article of a name, not "his".
    if (!pronoun || (w === 'lui' && isUpper(bare(tokens[j + 1] ?? '')))) return;
    add([OTHERS], j, pronoun[0], pronoun[1]);
  });

  const byIndex = (list: Evidence[] = []) => [...list].sort((a, b) => a.index - b.index);
  const people: NamedFinding[] = [];
  const seen = new Set<string>();
  tokens.forEach((raw, j) => {
    const key = words[j]!;
    if (!names.has(key) || seen.has(key)) return;
    seen.add(key);
    // A name only the Romanian suggests is listed only when something agrees
    // with it: otherwise "în București" would turn up as a person.
    if (!confirmed.has(key) && !found.has(key)) return;
    people.push({ name: bare(raw), ...resolve(byIndex(found.get(key)), false) });
  });

  const detection: Detection = {
    them: resolve(byIndex(found.get(THEM)), false),
    you: resolve(byIndex(found.get(YOU)), false),
    people,
    unstated,
  };
  return found.has(OTHERS) ? { ...detection, others: resolve(byIndex(found.get(OTHERS)), true) } : detection;
}
