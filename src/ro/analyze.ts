import type { Agreement } from './gender.ts';
import { KINSHIP } from './words.ts';
import { bare, formIndex, isUpper, withAdjectives, type AdjectiveRow, type Candidate, type GenderedForm } from './forms.ts';
import adjectiveData from './adjectives.json' with { type: 'json' };

/**
 * Who each word of a Romanian sentence agrees with. Read-only: the post-editor
 * uses it to decide what to rewrite, the detector to report what the Romanian
 * shows about each person.
 */

/**
 * Whose gender a predicate agrees with. 'other' is a third party -- someone
 * named or referred to rather than speaking or spoken to.
 */
export type Role = 'speaker' | 'addressee' | 'other';

const FIRST_PERSON = new Set(['sunt', 'suntem', 'eram']);
const SECOND_PERSON = new Set(['ești', 'esti', 'sunteți', 'sunteti', 'erai', 'erați', 'erati']);
const THIRD_PERSON = new Set(['este', 'e', 'era', 'erau']);
/** Perfect auxiliaries, recognised only when they actually head a compound past. */
const PERFECT: Record<string, Role | null> = {
  am: 'speaker', ai: 'addressee', 'ați': 'addressee', ati: 'addressee',
  a: 'other', au: 'other',
};
/** Anything that starts a new clause ends the current agreement span. */
const BOUNDARY = new Set([
  'și', 'si', 'dar', 'iar', 'însă', 'insa', 'sau', 'ori',
  'care', 'că', 'ca', 'fiindcă', 'deoarece', 'pentru', 'când', 'cand', 'dacă', 'daca', 'să',
]);
/**
 * An explicit pronoun already states the gender, so it is never overridden --
 * "el este bună" is nonsense. A *name* states nothing we can read, which is
 * why "Maya is my friend" is ours to decide and "he is my friend" is not.
 */
const GENDERED_PRONOUN = new Set(['el', 'ea', 'ei', 'ele', 'dumnealui', 'dumneaei']);

/** "I" and "you" as subjects -- they carry no gender of their own. */
const SPEAKER_PRONOUN = new Set(['eu', 'mine']);
const ADDRESSEE_PRONOUN = new Set(['tu', 'tine']);
/** Pronouns that are never a copula's subject here, and agree with nothing. */
const OBJECT_PRONOUN = new Set([
  'lui', 'lor', 'noi', 'voi', 'mie', 'ție', 'îmi', 'îți', 'mi', 'ți', 'dânsul', 'dânsa',
]);
/** Words that sit inside a clause without belonging to anyone's noun phrase. */
const TRANSPARENT = new Set([
  'nu', 'mai', 'foarte', 'prea', 'tot', 'încă', 'deja', 'chiar', 'doar', 'numai', 'cam',
  'destul', 'atât', 'așa', 'tare', 'ieri', 'azi', 'astăzi', 'acum', 'mâine', 'mereu',
  'întotdeauna', 'niciodată', 'asemenea', 'fel', 'aici', 'acolo', 'acasă', 'afară', 'împreună',
]);
export const PREPOSITION = new Set([
  'de', 'din', 'la', 'în', 'cu', 'pe', 'pentru', 'despre', 'fără', 'lângă', 'sub', 'peste',
  'prin', 'după', 'între', 'spre', 'până', 'dintre',
]);
/** Determiners come before the noun they agree with; possessives come after it. */
const DETERMINER = new Set([
  'un', 'o', 'cel', 'cea', 'cei', 'cele', 'acest', 'această', 'acești', 'aceste',
  'acel', 'acea', 'acei', 'acele',
]);
/** "Lucrez ca profesor": the role after "ca" agrees with whoever works. */
const WORKS_AS: Record<string, Role> = {
  lucrez: 'speaker', lucram: 'speaker', lucrezi: 'addressee', lucrai: 'addressee',
  lucrează: 'other', lucra: 'other',
};
/** A pronoun fused onto the auxiliary: "mi-a fost", "i-am fost". */
const CLITIC = /^(?:mi|ți|ti|i|ne|v|vi|le|l|s|și)-/;

/** Own keys only: the words come from machine output, and "constructor" is on every prototype. */
const has = (table: object, key: string) => Object.hasOwn(table, key);

export const isClosed = (w: string) =>
  FIRST_PERSON.has(w) || SECOND_PERSON.has(w) || THIRD_PERSON.has(w) || BOUNDARY.has(w) ||
  TRANSPARENT.has(w) || PREPOSITION.has(w) || OBJECT_PRONOUN.has(w) || GENDERED_PRONOUN.has(w) ||
  SPEAKER_PRONOUN.has(w) || ADDRESSEE_PRONOUN.has(w) || has(PERFECT, w) || w === 'fost' || has(WORKS_AS, w);
export const isWord = (t: string) => /[\p{L}\d]/u.test(t);

/**
 * "sunt" is both "I am" and "they are", and with the subject dropped only the
 * English can tell them apart. Returned in English order, to be consumed by
 * each "sunt" whose subject the Romanian leaves out.
 */
function suntReadings(source?: string): ('I' | 'they')[] {
  const re = /\b(?:i am|i['’]m|am i|i was|was i|they are|they['’]re|are they|they were|were they)\b/gi;
  return [...(source ?? '').matchAll(re)].map((m) => (/they/i.test(m[0]) ? 'they' : 'I'));
}

/** A copula and the predicate that agrees with its subject. */
export type Span = {
  role: Role;
  /** The lowercased name of the subject, when the subject is one we can read. */
  subject?: string;
  /** Several people agreeing jointly: lowercased names, '@speaker', '@addressee'. */
  group?: string[];
  /** The subject's gender is known from the text itself: a sister, or he or she. */
  gender?: Agreement;
  /** The subject is one we cannot read (a pronoun, a noun we do not know): leave it. */
  fixed?: boolean;
  /** Opened by "care": its subject is the noun phrase before "care". */
  relative?: boolean;
  copula: number;
  end: number;
};

type Subject =
  | { kind: 'none' } | { kind: 'fixed' } | { kind: 'pronoun' } | { kind: 'kin'; gender: Agreement }
  | { kind: 'speaker' } | { kind: 'addressee' }
  | { kind: 'name'; name: string } | { kind: 'group'; members: string[] }
  | { kind: 'noun'; from: number };

/**
 * Work out, for every token, whose gender it agrees with.
 *
 * A copula opens a span running to the end of its clause, because everything
 * in a Romanian predicate agrees with the subject -- article, superlative,
 * noun, possessive article and possessive alike ("cea mai buna prietena a
 * mea"). Possessives agree with the POSSESSED noun, so they follow the same
 * span rather than the possessor's gender.
 *
 * Whose span it is depends on the subject in front of the copula: a pronoun
 * or a sister states her own gender and is left alone, a name is that
 * person's, several names are a group, and an ordinary noun ("vecinul meu")
 * joins the span so subject and predicate change together.
 *
 * The span closes at a conjunction that starts a new clause, a third-person
 * verb or the end of the sentence. Guessing past those is coreference
 * resolution, and getting it wrong rewrites a sentence about somebody else.
 */
export function analyze(tokens: string[], names: ReadonlySet<string> = new Set(), source?: string,
                        { readStated = true, index = wordIndex() } = {}): { owners: (Span | null)[]; spans: Span[] } {
  const ix = index;
  const words = tokens.map((t) => bare(t).toLowerCase());
  const owners: (Span | null)[] = new Array(tokens.length).fill(null);
  const spans: Span[] = [];
  const readings = suntReadings(source);
  // Romanian drops the pronoun, so "He is tired" is just "E obosit". An
  // explicit he or she in the English is evidence, and is kept. With both in
  // one input we cannot tell which clause is whose, so those are left alone.
  // Reading Romanian someone else wrote, the English is our own translation of
  // it, so its he or she is the model's guess, not evidence: readStated off.
  const english = readStated ? source ?? '' : '';
  const he = /\bhe\b/i.test(english), she = /\bshe\b/i.test(english);
  const stated: Partial<Span> = he && she ? { fixed: true } : he ? { gender: 'M' } : she ? { gender: 'F' } : {};
  let open: Span | undefined;

  const start = (role: Role, at: number, extra: Partial<Span> = {}): Span => {
    open = { role, copula: at, end: at, ...extra };
    spans.push(open);
    return open;
  };
  const endsSentence = (j: number) => /[.!?;…]$/.test(tokens[j]!);
  const isPerson = (j: number) =>
    names.has(words[j]!) || SPEAKER_PRONOUN.has(words[j]!) || ADDRESSEE_PRONOUN.has(words[j]!);
  const isCopulaAt = (j: number) => {
    const w = words[j]!;
    return FIRST_PERSON.has(w) || SECOND_PERSON.has(w) || THIRD_PERSON.has(w) || w === 'fost' ||
      has(WORKS_AS, w) || (has(PERFECT, w.replace(CLITIC, '')) && words[j + 1] === 'fost');
  };

  const classify = (region: number[]): Subject => {
    if (!region.length) return { kind: 'none' };
    if (region.some((j) => GENDERED_PRONOUN.has(words[j]!))) return { kind: 'pronoun' };
    if (region.every(isPerson)) {
      const members = region.map((j) => SPEAKER_PRONOUN.has(words[j]!) ? '@speaker'
        : ADDRESSEE_PRONOUN.has(words[j]!) ? '@addressee' : words[j]!);
      if (members.length > 1) return { kind: 'group', members };
      const [only] = members as [string];
      return only === '@speaker' ? { kind: 'speaker' }
        : only === '@addressee' ? { kind: 'addressee' } : { kind: 'name', name: only };
    }
    const kinship = region.map((j) => KINSHIP.get(words[j]!)).find(Boolean);
    if (kinship) return { kind: 'kin', gender: kinship };
    const named = region.find((j) => names.has(words[j]!));
    if (named !== undefined) return { kind: 'name', name: words[named]! };
    if (region.some((j) => ix.get(words[j]!)?.some((o) => o.kind === 'noun'))) {
      return { kind: 'noun', from: region[0]! };
    }
    const unknown = region.filter((j) => isWord(tokens[j]!) && !ix.has(words[j]!) && !isClosed(words[j]!));
    if (!unknown.length) return { kind: 'none' };
    // Without the English, a capitalised unknown word may be a name we cannot
    // confirm, so the general setting still applies to it, as it always has.
    if (source === undefined && unknown.every((j) => isUpper(bare(tokens[j]!)))) return { kind: 'none' };
    return { kind: 'fixed' };
  };

  /** The subject in front of a copula, read back to the start of its clause. */
  const subjectBefore = (at: number, afterComma = false): Subject => {
    const region: number[] = [];
    let commaOk = afterComma;
    let j = at - 1;
    while (j >= 0) {
      if (endsSentence(j)) break;
      // "Maya, care este colega mea, este ..." -- step over the relative clause.
      const owner = owners[j];
      if (owner?.relative && owner.copula - 2 < j) { j = owner.copula - 2; commaOk = true; continue; }
      if (tokens[j]!.endsWith(',') && !commaOk) break;
      commaOk = false;
      const w = words[j]!;
      // "Josh și Maya", "tu și cu mine": a conjunction inside a group of people.
      if (w === 'și' || w === 'si' || w === 'cu') {
        let k = j - 1;
        while (k >= 0 && ['și', 'si', 'cu'].includes(words[k]!)) k--;
        if (!region.length || !region.every(isPerson) || k < 0 || !isPerson(k)) break;
        j--; continue;
      }
      if (BOUNDARY.has(w) || isCopulaAt(j)) break;
      if (!TRANSPARENT.has(w)) region.unshift(j);
      j--;
    }
    return classify(region);
  };

  /**
   * Whether the predicate goes on after "și" or a comma ("obosit și fericit",
   * "înalt, obosit") rather than a new clause starting ("și prietenul meu e").
   */
  const continues = (from: number): boolean => {
    let seen = false;
    for (let k = from; k < tokens.length; k++) {
      const w = words[k]!;
      if (w !== 'și' && w !== 'si') {
        if (BOUNDARY.has(w) || isCopulaAt(k) || names.has(w) || KINSHIP.has(w) ||
            GENDERED_PRONOUN.has(w) || SPEAKER_PRONOUN.has(w) || ADDRESSEE_PRONOUN.has(w)) return false;
        // "un prieten al familiei": a word we do not know is fine as the
        // complement of a preposition or possessive article, not on its own.
        const complement = PREPOSITION.has(words[k - 1]!) || ['al', 'a', 'ai', 'ale'].includes(words[k - 1]!);
        if (ix.has(w)) seen = true;
        else if (isWord(tokens[k]!) && !TRANSPARENT.has(w) && !PREPOSITION.has(w) && !complement) return false;
      }
      if (endsSentence(k)) return seen;
    }
    return seen;
  };

  const third = (at: number, given?: Subject) => {
    const relative = !given && words[at - 1] === 'care';
    // "Maya este prietena mea, care este bună": the antecedent sits in Maya's
    // predicate, so the relative clause is about whoever that predicate is.
    const host = relative ? owners[at - 2] : null;
    if (host && !host.relative) {
      const { role, subject, group, gender, fixed } = host;
      start(role, at, { relative: true, subject, group, gender, fixed });
      return;
    }
    const subject = given ?? (relative ? subjectBefore(at - 1, true) : subjectBefore(at));
    const extra: Partial<Span> = relative ? { relative: true } : {};
    switch (subject.kind) {
      case 'name': start('other', at, { ...extra, subject: subject.name }); return;
      case 'group': start('other', at, { ...extra, group: subject.members }); return;
      case 'speaker': start('speaker', at, extra); return;
      case 'addressee': start('addressee', at, extra); return;
      case 'noun': {
        const span = start('other', at, extra);
        // The subject noun phrase agrees too: "Vecinul meu e obosit" becomes
        // "Vecina mea e obosită", never "Vecinul meu e obosită".
        if (!relative) for (let j = subject.from; j < at; j++) if (!owners[j]) owners[j] = span;
        return;
      }
      case 'kin': start('other', at, { ...extra, gender: subject.gender }); return;
      case 'none': start('other', at, { ...extra, ...stated }); return;
      default: start('other', at, { ...extra, fixed: true });
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i]!;
    const word = words[i]!;
    const next = words[i + 1] ?? '';
    const prev = words[i - 1] ?? '';
    const aux = word.replace(CLITIC, '');

    // "am fost" opens a span; a bare "a" or "ai" is a possessive article.
    if (next === 'fost' && has(PERFECT, aux)) {
      const role = PERFECT[aux];
      if (role === 'other') third(i);
      else if (role) start(role, i);
      continue;
    }
    if (word === 'fost') { if (open) open.end = i; continue; }
    if (word === 'sunt') {
      const subject = subjectBefore(i);
      const dropped = subject.kind === 'none';
      const reading = dropped || subject.kind === 'speaker' || subject.kind === 'pronoun'
        ? readings.shift() : undefined;
      if (dropped) start(reading === 'they' ? 'other' : 'speaker', i);
      else third(i, subject);
      continue;
    }
    if (word === 'suntem') {
      // "Tu și cu mine suntem": the group agrees jointly, not with me alone.
      // "Fratele meu și cu mine": someone we cannot set is in it, so it is
      // left as translated rather than following my setting alone.
      const subject = subjectBefore(i);
      let k = i - 1;
      while (k >= 0 && !endsSentence(k) && !tokens[k]!.endsWith(',') && !['și', 'si', 'cu'].includes(words[k]!)) k--;
      const coordinated = k >= 0 && ['și', 'si', 'cu'].includes(words[k]!);
      if (subject.kind === 'group') start('speaker', i, { group: subject.members });
      else if (coordinated || (subject.kind !== 'none' && subject.kind !== 'speaker')) start('speaker', i, { fixed: true });
      else start('speaker', i);
      continue;
    }
    if (word === 'eram') { readings.shift(); start('speaker', i); continue; }
    if (SECOND_PERSON.has(word)) { start('addressee', i); continue; }
    if (THIRD_PERSON.has(word)) { third(i); continue; }
    // "Rose lucreaza ca profesoara": the role agrees with whoever works, and
    // "ca" is exactly what marks it off -- which is why "ca" is a clause
    // boundary everywhere else.
    if (word === 'ca') {
      const worker = has(WORKS_AS, prev) ? WORKS_AS[prev] : undefined;
      if (worker === 'other') { third(i, subjectBefore(i - 1)); continue; }
      if (worker) { start(worker, i); continue; }
      const subject = i >= 2 ? words[i - 2]! : '';
      if (names.has(subject) && !names.has(prev)) { start('other', i, { subject }); continue; }
    }
    if (BOUNDARY.has(word)) {
      // "si" directly after the copula is "also", not a new clause: a
      // conjunction cannot coordinate a predicate that has not started yet.
      // "Maya este si prietena mea" is one clause, and all of it agrees.
      const also = open !== undefined && i === open.copula + 1;
      const coordinated = open !== undefined && (word === 'și' || word === 'si') && continues(i + 1);
      if (!also && !coordinated) { open = undefined; continue; }
    }

    if (open) { owners[i] = open; open.end = i; }
    if (/[;.!?…]$/.test(raw) || (raw.endsWith(',') && !(open && continues(i + 1)))) open = undefined;
  }
  return { owners, spans };
}

/**
 * Romanian words, so a capital letter on one is sentence case rather than a
 * name. Every gendered form we index, plus the closed-class words that hold
 * the analysis together.
 */
let knownWords: Set<string> | undefined;
/**
 * Titles before a name. "Dr" survives into the Romanian unchanged, so the
 * English confirmed it as a name, and "Dr Popescu" became two people.
 */
const TITLES = ['dr', 'prof', 'mr', 'mrs', 'ms', 'dl', 'dna', 'd-l', 'd-na', 'domnul', 'doamna', 'domnișoara'];
export function known(): Set<string> {
  if (knownWords) return knownWords;
  const words = new Set<string>(wordIndex().keys());
  for (const w of [
    ...FIRST_PERSON, ...SECOND_PERSON, ...THIRD_PERSON, ...BOUNDARY,
    ...GENDERED_PRONOUN, ...Object.keys(PERFECT), 'fost', ...TITLES,
  ]) words.add(w);
  return (knownWords = words);
}

/**
 * The people named in the Romanian, lowercased.
 *
 * A capitalised word is only read as somebody's name when the same word also
 * appears in the English that produced it. That one check is what separates
 * "Maya" from "Prietena" at the start of a sentence, and it is cheap because
 * names are the words machine translation carries through unchanged.
 */
export function namesIn(tokens: string[], source: string): Set<string> {
  const inSource = new Set(source.toLowerCase().match(/\p{L}+/gu) ?? []);
  const names = new Set<string>();
  for (const raw of tokens) {
    const word = bare(raw);
    if (!word || !isUpper(word)) continue;
    const key = word.toLowerCase();
    if (inSource.has(key) && !known().has(key)) names.add(key);
  }
  return names;
}

/**
 * Which noun each gendered word belongs to. An article, adjective or
 * possessive may only change together with its noun: when the noun cannot
 * change ("un om bun", "din familia mea", an untranslated word), neither may
 * they -- half a correction is worse than none.
 */
export function governance(tokens: string[], candidates: Candidate[], owners: (Span | null)[]) {
  const cand = new Map(candidates.map((c) => [c.index, c]));
  const words = tokens.map((t) => bare(t).toLowerCase());
  const isNoun = (j: number) => cand.get(j)?.options.some((o) => o.kind === 'noun') ?? false;
  const isAdjective = (j: number) => cand.get(j)?.options.some((o) => o.kind === 'adjective') ?? false;
  /** "al 17-lea" is an ordinal, not a possessive article. */
  const isOrdinal = (j: number) => (words[j] === 'al' || words[j] === 'a') && /\d|-lea\b/i.test(tokens[j + 1] ?? '');
  const isFunction = (j: number) =>
    (cand.get(j)?.options.every((o) => o.kind === 'function') ?? false) && !isOrdinal(j);
  const nounAt = (j: number): 'known' | 'fixed' | undefined => {
    if (!isWord(tokens[j] ?? '')) return undefined;
    if (isNoun(j)) return 'known';
    if (isOrdinal(j)) return 'fixed';
    return cand.has(j) || isClosed(words[j]!) ? undefined : 'fixed';
  };
  const headOf = (i: number): number | undefined => {
    if (isNoun(i)) return i;
    const owner = owners[i];
    const scan = (from: number, step: 1 | -1, skip: (j: number) => boolean) => {
      for (let j = from; j >= 0 && j < tokens.length && owners[j] === owner; j += step) {
        if (nounAt(j)) return j;
        if (!skip(j)) return undefined;
      }
      return undefined;
    };
    const w = words[i]!;
    const modifier = (j: number) => isAdjective(j) || TRANSPARENT.has(words[j]!);
    if (isFunction(i)) {
      if (DETERMINER.has(w)) return scan(i + 1, 1, (j) => modifier(j) || isFunction(j));
      return scan(i - 1, -1, (j) => isAdjective(j) || isFunction(j) || (w === 'care-l' && words[j] === 'pe'));
    }
    // An adjective follows the noun before it -- or, with none, the subject.
    return scan(i - 1, -1, modifier) ?? scan(i + 1, 1, modifier);
  };
  /** Whether the word may follow its owner: its noun, if it has one, can change too. */
  const free = (i: number) => {
    const head = headOf(i);
    return head === undefined || nounAt(head) !== 'fixed';
  };
  /**
   * "Sunt la matematică", "Sunt căsătorit cu o profesoară": past a preposition
   * a word is where, what or whom, not the subject -- and many adjectives are
   * nouns too. The "de" of "extrem de", "atât de" still belongs to the predicate.
   */
  const afterPreposition = (i: number) => {
    const span = owners[i];
    if (!span) return false;
    for (let j = span.copula + 1; j < i; j++) {
      if (!PREPOSITION.has(words[j]!)) continue;
      // "pe care-l am": the object marker of a relative clause, not a place.
      if (words[j] === 'pe' && words[j + 1]?.startsWith('care')) continue;
      // "de a deveni bucătăreasă" starts a verb whose complement agrees too;
      // "de asemenea", "de fapt", "la fel" are adverbs, not places.
      const next = words[j + 1] ?? '';
      if (next === 'a' || TRANSPARENT.has(next) || ADVERBIAL.has(next)) continue;
      // "extrem de obosită": a degree only when an adjective follows; "îndrăgostită
      // de vecinul meu" is a complement, and the neighbour is someone else.
      const degree = words[j] === 'de' && isAdjective(j + 1) &&
        (isAdjective(j - 1) || DEGREE_BEFORE_DE.has(words[j - 1]!));
      if (!degree) return true;
    }
    return false;
  };
  /** "extrem de obosită", "total nepregătită": a masculine form that is an adverb here. */
  const adverb = (i: number) => {
    const options = cand.get(i)?.options ?? [];
    if (!options.length || !options.every((o) => o.kind === 'adjective' && o.agreement === 'M' && o.number === 'sg')) {
      return false;
    }
    // An adverb sits right against its adjective; "înalt, obosit" is a list.
    if (/[^\p{L}]$/u.test(tokens[i]!)) return false;
    let j = i + 1;
    while (j < tokens.length && owners[j] === owners[i] && DEGREE.has(words[j]!)) j++;
    return owners[j] === owners[i] && isAdjective(j);
  };
  /**
   * "E clar", "E bun": with no subject in sight -- no name, no noun, no he or
   * she -- the clause is as likely "it is" as "he/she is".
   */
  const anonymous = (span: Span) => span.role === 'other' && !span.subject && !span.group && !span.gender &&
    !span.fixed && !owners.some((o, j) => o === span && j < span.copula);
  /** A word for a person, or a word agreeing with one ("E o profesoară bună"). */
  const personal = (j: number) => {
    const head = headOf(j);
    return isNoun(j) || (head !== undefined && isNoun(head));
  };
  return { isNoun, isOrdinal, headOf, free, afterPreposition, adverb, anonymous, personal };
}

/** Words between an adverb and the adjective it modifies: "extrem de obosită". */
const DEGREE = new Set(['de', 'mai', 'prea', 'foarte', 'cam', 'tare']);
/** Words that make a preposition part of an adverb: "de fapt", "de obicei". */
const ADVERBIAL = new Set(['fapt', 'obicei', 'aceea', 'altfel', 'exemplu', 'regulă', 'nou', 'asta', 'data']);
/** Words a degree "de" follows: "atât de bună". */
const DEGREE_BEFORE_DE = new Set(['atât', 'așa', 'destul', 'prea', 'foarte', 'cam', 'tare', 'mai', 'mult']);

/**
 * Every gendered form Acord reads and writes: the hand-checked lists plus some
 * 16,000 adjectives and participles attested on Wiktionary headword lines
 * (scripts/extract_kaikki_detect.py). A form the hand lists already know keeps
 * their reading, and words that are mostly something else ("chiar" is "even")
 * are left out.
 */
let allWords: Map<string, GenderedForm[]> | undefined;
export const wordIndex = () =>
  (allWords ??= withAdjectives(formIndex(), adjectiveData.adjectives as AdjectiveRow[], isClosed));
