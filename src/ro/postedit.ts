import type { Agreement } from './gender.ts';
import { allEntries } from './lexicon.ts';
import { buildParadigm } from './noun.ts';
import { inflectAdjective } from './adjective.ts';
import { ADJECTIVES, FUNCTION_WORDS, KINSHIP, NOUNS, NOUN_GENDER } from './words.ts';
import type { NounForms } from './noun.ts';

export type GenderedForm = {
  form: string;
  lemma: string;
  agreement: Agreement;
  /** The corresponding form in the other gender, from the SAME paradigm cell. */
  counterpart: string;
  kind: 'noun' | 'adjective' | 'function';
  /** How settled the feminine form is -- carried through so post-edited
   *  machine output can flag a variant or contested word, same as the
   *  frame path does. */
  status?: string;
  /** Why the form is disputed, when it is -- shown to the user verbatim. */
  note?: string | null;
};

/** Nominative-accusative first, so the commonest reading is preferred. */
const CELLS: (keyof NounForms)[] = [
  'sg.na.indef', 'sg.na.def', 'pl.na.indef', 'pl.na.def',
  'sg.gd.indef', 'sg.gd.def', 'pl.gd.indef', 'pl.gd.def',
];

function addPair(ix: Map<string, GenderedForm[]>, m: string, f: string,
                 lemma: string, kind: GenderedForm['kind'],
                 status?: string, note?: string | null): void {
  if (!m || !f || m === f) return;  // invariable: a flip would be noise
  for (const [form, counterpart, agreement] of
       [[m, f, 'M'], [f, m, 'F']] as [string, string, Agreement][]) {
    const list = ix.get(form) ?? [];
    // A status describes the FEMININE form. The masculine of a contested pair
    // is not itself in dispute, so it must not carry the flag.
    const own = agreement === 'M' && status ? { status: 'normative', note: null } : { status, note };
    if (!list.some((e) => e.counterpart === counterpart)) {
      list.push({ form, lemma, agreement, counterpart, kind, ...own });
    }
    ix.set(form, list);
  }
}

/** form -> the gendered readings of that form, with their counterparts. */
export function buildFormIndex(): Map<string, GenderedForm[]> {
  const ix = new Map<string, GenderedForm[]>();

  for (const e of allEntries()) {
    addPair(ix, e.m, e.f, e.en, 'noun', e.status, e.note);
    if (e.formsM && e.formsF) {
      for (const cell of CELLS) {
        addPair(ix, e.formsM[cell], e.formsF[cell], e.en, 'noun', e.status, e.note);
      }
    }
  }

  for (const [en, n] of Object.entries(NOUNS)) {
    const pm = buildParadigm(n.m, NOUN_GENDER.M, n.mPl);
    const pf = buildParadigm(n.f, NOUN_GENDER.F, n.fPl);
    for (const cell of CELLS) addPair(ix, pm.forms[cell], pf.forms[cell], en, 'noun');
  }

  for (const [m, f] of FUNCTION_WORDS) addPair(ix, m, f, m, 'function');

  for (const [en, a] of Object.entries(ADJECTIVES)) {
    for (const num of ['sg', 'pl'] as const) {
      addPair(ix, inflectAdjective(a, 'M', num, 'na'),
                  inflectAdjective(a, 'F', num, 'na'), en, 'adjective');
    }
  }
  return ix;
}

let cached: Map<string, GenderedForm[]> | undefined;
const index = () => (cached ??= buildFormIndex());

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

const bare = (t: string) => t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
const isUpper = (t: string) => t.length > 0 && t[0]! === t[0]!.toUpperCase();
const recase = (replacement: string, original: string) =>
  isUpper(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every token that is a gendered form we recognise. */
export function findGendered(text: string): Candidate[] {
  const ix = index();
  const out: Candidate[] = [];
  text.split(/\s+/).forEach((token, i) => {
    const options = ix.get(bare(token).toLowerCase());
    if (options?.length) out.push({ index: i, token: bare(token), options });
  });
  return out;
}

/**
 * Whose gender a predicate agrees with. 'other' is a third party -- someone
 * named or referred to rather than speaking or spoken to.
 */
export type Role = 'speaker' | 'addressee' | 'other';

/**
 * What to do about one person's gender.
 *   'M' / 'F'  a definite grammatical gender
 *   'both'     print both forms; Romanian has no third to invent
 *   'avoid'    say it without gender at all, where the language allows
 */
export type Target = Agreement | 'both' | 'avoid';

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
  'care', 'că', 'ca', 'fiindcă', 'deoarece', 'pentru', 'când', 'cand', 'dacă', 'daca',
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
  'întotdeauna', 'niciodată', 'asemenea', 'fel',
]);
const PREPOSITION = new Set([
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

const isClosed = (w: string) =>
  FIRST_PERSON.has(w) || SECOND_PERSON.has(w) || THIRD_PERSON.has(w) || BOUNDARY.has(w) ||
  TRANSPARENT.has(w) || PREPOSITION.has(w) || OBJECT_PRONOUN.has(w) || GENDERED_PRONOUN.has(w) ||
  SPEAKER_PRONOUN.has(w) || ADDRESSEE_PRONOUN.has(w) || has(PERFECT, w) || w === 'fost' || has(WORKS_AS, w);
const isWord = (t: string) => /[\p{L}\d]/u.test(t);

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
type Span = {
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
function analyze(tokens: string[], names: ReadonlySet<string> = new Set(), source?: string):
    { owners: (Span | null)[]; spans: Span[] } {
  const ix = index();
  const words = tokens.map((t) => bare(t).toLowerCase());
  const owners: (Span | null)[] = new Array(tokens.length).fill(null);
  const spans: Span[] = [];
  const readings = suntReadings(source);
  // Romanian drops the pronoun, so "He is tired" is just "E obosit". An
  // explicit he or she in the English is evidence, and is kept. With both in
  // one input we cannot tell which clause is whose, so those are left alone.
  const he = /\bhe\b/i.test(source ?? ''), she = /\bshe\b/i.test(source ?? '');
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
function known(): Set<string> {
  if (knownWords) return knownWords;
  const words = new Set<string>(index().keys());
  for (const w of [
    ...FIRST_PERSON, ...SECOND_PERSON, ...THIRD_PERSON, ...BOUNDARY,
    ...GENDERED_PRONOUN, ...Object.keys(PERFECT), 'fost',
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
function namesIn(tokens: string[], source: string): Set<string> {
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

/** Occupations that can be said with a gender-free verb instead. */
let paraphrases: Map<string, { verb1sg: string; verb2sg: string }> | undefined;
function paraphraseFor(en: string) {
  paraphrases ??= new Map(allEntries().flatMap((e) =>
    e.neutral.kind === 'verb_paraphrase'
      ? [[e.en, { verb1sg: e.neutral.verb1sg, verb2sg: e.neutral.verb2sg }] as const]
      : []));
  return paraphrases.get(en);
}

export type PostEdit = {
  text: string;
  /** One entry normally; two whole sentences when several words are doubled. */
  variants: string[];
  /** Gendered words in the FINAL text, so indices line up for display. */
  candidates: Candidate[];
  changed: Candidate[];
  /** True when gender-free wording was asked for but no paraphrase existed. */
  fellBack: boolean;
  /**
   * Everyone the sentence names, as written, in the order they appear.
   *
   * `governs` is false when nothing in the Romanian follows that person's
   * gender -- usually because the sentence states the shared part once and
   * leaves it out afterwards ("Maya e prietenul meu si la fel si Steve").
   * They are still listed: a missing name reads as a failure to see them,
   * which is more misleading than an inert row that explains itself.
   */
  people: Person[];
  /**
   * The gender the translator used for third parties it did NOT name -- the
   * default for the catch-all row, for the same reason the named rows have
   * one. Absent when there are none, or when they disagree: preselecting one
   * of two would quietly propose changing the other.
   */
  othersGuess?: Agreement;
  /**
   * Whether anyone the sentence does not name has words agreeing with them --
   * the person addressed, or an unnamed third party. The catch-all row is only
   * worth showing alongside named rows when this is true.
   */
  othersPresent: boolean;
};

/**
 * Somebody the sentence names.
 *
 * `guess` is the gender the translator itself picked for them, read off its
 * own output before any of the user's choices were applied. It is a guess from
 * the name and nothing more -- Alex, Sam and Jordan all come back masculine --
 * but it makes a sensible default for that person's control, which the user
 * then sees and can overrule. Absent when nothing agrees with them.
 */
export type Person = { name: string; governs: boolean; guess?: Agreement };

/** The English input, and a choice for each person named in it. */
export type PeopleOptions = {
  /** The English that produced this Romanian, used to confirm names. */
  source?: string;
  /** Per-person choices, keyed by the lowercased name. */
  targets?: Record<string, Target>;
  /**
   * Whether a named person with no choice of their own follows the general
   * setting (the default). From two names on, each has a row of their own, and
   * "anyone else" must then mean only the people the sentence does not name.
   */
  namedFollowOthers?: boolean;
};

/**
 * Rewrite the words that agree with the speaker or the addressee, leaving
 * everyone else's words alone. Omit `addressee` to rewrite only the speaker's.
 *
 * `people` narrows that further: a named third party with their own choice
 * follows it, and everyone else still follows `addressee`.
 */
export function applyGender(text: string, speaker: Target, addressee?: Target,
                            people?: PeopleOptions): PostEdit {
  const primary = edit(text, speaker, addressee, people);
  const doubled = primary.changed.filter((c) => c.doubled);
  // Collapsing to two sentences means picking one gender for the whole
  // sentence, which is only faithful while every doubled word belongs to the
  // same person. Two people each shown "both" have four readings, not two, so
  // those stay as inline doublets rather than being silently paired up.
  const owners = new Set(doubled.map((c) => c.person ?? c.role ?? ''));
  if (doubled.length <= 1 || owners.size > 1) return { ...primary, variants: [primary.text] };

  // One person, several doublets: "cel/cea mai bun/buna prieten/prietena
  // al/a meu/mea" is unreadable, so print the two readings whole.
  // An avoid that fell back is printed as both, so its two readings split too.
  const pick = <T extends Target | undefined>(t: T, g: Agreement) =>
    (t === 'both' || t === 'avoid' ? g : t) as T extends undefined ? Target | undefined : Target;
  const pickPeople = (g: Agreement): PeopleOptions | undefined => people && {
    ...people,
    targets: Object.fromEntries(
      Object.entries(people.targets ?? {}).map(([name, t]) => [name, pick(t, g)])),
  };
  const m = edit(text, pick(speaker, 'M'), pick(addressee, 'M'), pickPeople('M'));
  const f = edit(text, pick(speaker, 'F'), pick(addressee, 'F'), pickPeople('F'));
  return { ...primary, text: m.text, variants: [m.text, f.text] };
}

function edit(text: string, speaker: Target, other?: Target,
              people?: PeopleOptions): Omit<PostEdit, 'variants'> {
  const tokens = text.split(/\s+/);
  const names = people?.source ? namesIn(tokens, people.source) : new Set<string>();
  // A Map, not an object: the keys are words lifted out of machine output,
  // and a person called "Constructor" must not reach Object.prototype.
  const chosen = new Map(Object.entries(people?.targets ?? {}));
  const candidates = findGendered(text);
  const { owners, spans } = analyze(tokens, names, people?.source);
  const changed: Candidate[] = [];
  let fellBack = false;

  const unset = people?.namedFollowOthers === false ? undefined : other;
  const member = (m: string): Target | undefined =>
    m === '@speaker' ? speaker : m === '@addressee' ? other : chosen.get(m) ?? unset;
  /** A named person's own choice wins; anyone else follows the general one. */
  const targetFor = (span: Span | null | undefined): Target | undefined => {
    if (!span || span.fixed) return undefined;
    if (span.gender) return span.gender;
    // A group is feminine only when everyone in it is; one man makes it
    // masculine. Anyone unset leaves the whole group as translated.
    if (span.group) {
      const each = span.group.map(member);
      if (each.some((t) => t === undefined)) return undefined;
      if (each.includes('M')) return 'M';
      return each.every((t) => t === 'F') ? 'F' : 'both';
    }
    if (span.role === 'speaker') return speaker;
    return span.subject ? chosen.get(span.subject) ?? unset : other;
  };

  // Which noun each gendered word belongs to. An article, adjective or
  // possessive may only change together with its noun: when the noun cannot
  // change ("un om bun", "din familia mea", an untranslated word), neither may
  // they -- half a correction is worse than none.
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

  // What the translator itself chose for each named person, read BEFORE any
  // rewriting -- so it stays the model's guess rather than becoming an echo of
  // whatever the user last set.
  const guesses = new Map<string, Agreement>();
  for (const c of candidates) {
    const subject = owners[c.index]?.subject;
    const option = c.options[0];
    if (subject && option && !guesses.has(subject)) guesses.set(subject, option.agreement);
  }

  const unnamed = new Set<Agreement>();
  for (const c of candidates) {
    const owner = owners[c.index];
    const option = c.options[0];
    if (owner && option && owner.role !== 'speaker' && !owner.subject && !owner.group && !owner.fixed && !owner.gender) {
      unnamed.add(option.agreement);
    }
  }
  const othersGuess = unnamed.size === 1 ? [...unnamed][0] : undefined;
  const othersPresent = unnamed.size > 0;

  // Clause level first: avoiding gender replaces a whole copula clause with a
  // gender-free verb, which no amount of word swapping can achieve.
  const replaced = new Map<number, string>();
  const dropped = new Set<number>();
  for (const span of spans) {
    if (targetFor(span) !== 'avoid') continue;
    // The gender-free paraphrase is stored for "I" and "you" only. A third
    // person would need a 3rd-singular we do not hold, and this engine never
    // invents a form, so it degrades to showing both.
    if (span.role === 'other') { fellBack = true; continue; }
    // Only a bare "[un/o] profesor" says nothing but the job. Anything more --
    // "bun", "cel mai bun", "acestei reviste", a second job -- would be
    // deleted by the paraphrase, so it falls back to both forms instead.
    const inside = Array.from({ length: span.end - span.copula }, (_, k) => span.copula + 1 + k);
    const jobs = inside.filter(isNoun);
    const bareJob = jobs.length === 1 && inside.every((i) =>
      isNoun(i) || words[i] === 'un' || words[i] === 'o' || !isWord(tokens[i]!));
    const lemma = !bareJob ? undefined : cand.get(jobs[0]!)!.options
      .map((o) => o.lemma).find((l) => paraphraseFor(l));
    const verb = lemma ? paraphraseFor(lemma) : undefined;
    if (!verb) { fellBack = true; continue; }
    const tail = tokens[span.end]!.match(/[^\p{L}]+$/u)?.[0] ?? '';
    const word = span.role === 'speaker' ? verb.verb1sg : verb.verb2sg;
    const atStart = span.copula === 0 || /[.!?]$/.test(tokens[span.copula - 1] ?? '');
    replaced.set(span.copula, (atStart ? capitalize(word) : word) + tail);
    for (let i = span.copula + 1; i <= span.end; i++) dropped.add(i);
  }

  for (const c of candidates) {
    if (dropped.has(c.index) || replaced.has(c.index) || isOrdinal(c.index)) continue;
    const head = headOf(c.index);
    if (head !== undefined && nounAt(head) === 'fixed') continue;
    const wanted = targetFor(owners[c.index]);
    // An avoid that found no paraphrase degrades to showing both forms.
    const target = wanted === 'avoid' ? 'both' : wanted;
    if (!target) continue;
    const option = target === 'both'
      ? c.options[0]
      : c.options.find((o) => o.agreement !== target);
    if (!option) continue;
    c.doubled = target === 'both';
    c.role = owners[c.index]?.role;
    c.person = owners[c.index]?.subject;
    const replacement = target === 'both'
      ? (option.agreement === 'M'
          ? `${option.form}/${option.counterpart}`
          : `${option.counterpart}/${option.form}`)
      : option.counterpart;
    tokens[c.index] = tokens[c.index]!.replace(c.token, recase(replacement, c.token));
    changed.push(c);
  }

  const finalText = tokens
    .map((t, i) => replaced.get(i) ?? (dropped.has(i) ? undefined : t))
    .filter((t): t is string => t !== undefined)
    .join(' ');
  // Re-split rather than reuse: "care-l" became "care o", two words.
  const finalTokens = finalText.split(/\s+/);

  // Recompute for display: a paraphrase removes tokens, so the original
  // indices no longer line up with what the user actually sees.
  const display = findGendered(finalText);
  const finalNames = people?.source ? namesIn(finalTokens, people.source) : names;
  const finalOwners = analyze(finalTokens, finalNames, people?.source).owners;
  const governed = new Set<string>();
  for (const c of display) {
    const owner = finalOwners[c.index];
    c.role = owner?.role;
    c.person = owner?.subject;
    c.autoApplied = Boolean(targetFor(owner));
    if (owner?.subject) governed.add(owner.subject);
    if (owner?.group && !owner.fixed) {
      for (const m of owner.group) if (!m.startsWith('@')) governed.add(m);
    }
  }

  // Everyone named, in the order they appear and spelled as they are written,
  // each marked with whether the output actually turns on their gender.
  const seen = new Set<string>();
  const peopleFound: Person[] = [];
  for (const raw of finalTokens) {
    const key = bare(raw).toLowerCase();
    if (!finalNames.has(key) || seen.has(key)) continue;
    seen.add(key);
    const guess = guesses.get(key);
    peopleFound.push(guess
      ? { name: bare(raw), governs: governed.has(key), guess }
      : { name: bare(raw), governs: governed.has(key) });
  }

  const result = { text: finalText, candidates: display, changed, fellBack, people: peopleFound, othersPresent };
  return othersGuess ? { ...result, othersGuess } : result;
}
