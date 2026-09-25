import type { Agreement } from './gender.ts';
import { allEntries } from './lexicon.ts';
import { buildParadigm } from './noun.ts';
import { inflectAdjective } from './adjective.ts';
import { ADJECTIVES, FUNCTION_WORDS, NOUNS, NOUN_GENDER } from './words.ts';
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
    if (!list.some((e) => e.counterpart === counterpart)) {
      list.push({ form, lemma, agreement, counterpart, kind, status, note });
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

/** A copula and the predicate that agrees with its subject. */
type Span = {
  role: Role;
  /** The lowercased name of the subject, when the subject is one we can read. */
  subject?: string;
  copula: number;
  end: number;
};

/**
 * Work out, for every token, whose gender it agrees with.
 *
 * A copula opens a span running to the end of its clause, because everything
 * in a Romanian predicate agrees with the subject -- article, superlative,
 * noun, possessive article and possessive alike ("cea mai buna prietena a
 * mea"). Possessives agree with the POSSESSED noun, so they follow the same
 * span rather than the possessor's gender.
 *
 * The span closes at a conjunction, a third-person verb or the end of the
 * sentence. Guessing past those is coreference resolution, and getting it
 * wrong rewrites a sentence about somebody else.
 */
function analyze(tokens: string[], names: ReadonlySet<string> = new Set()):
    { owners: (Span | null)[]; spans: Span[] } {
  const owners: (Span | null)[] = new Array(tokens.length).fill(null);
  const spans: Span[] = [];
  let open: Span | undefined;

  const start = (role: Role | null, at: number, subject?: string) => {
    open = undefined;
    if (!role) return;
    open = subject ? { role, subject, copula: at, end: at } : { role, copula: at, end: at };
    spans.push(open);
  };

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i]!;
    const word = bare(raw).toLowerCase();
    const next = i + 1 < tokens.length ? bare(tokens[i + 1]!).toLowerCase() : '';
    const prev = i > 0 ? bare(tokens[i - 1]!).toLowerCase() : '';

    // A clause whose subject is an explicit pronoun keeps the gender the
    // pronoun states; only a named or unnamed third party is ours to set.
    // When the subject IS a name, the span records it, so that person can be
    // set separately from everyone else in the sentence.
    const third = (role: Role) =>
      start(GENDERED_PRONOUN.has(prev) ? null : role, i, names.has(prev) ? prev : undefined);

    // "am fost" opens a span; a bare "a" or "ai" is a possessive article.
    if (next === 'fost' && word in PERFECT) {
      const role = PERFECT[word];
      if (role === 'other') third('other');
      else start(role ?? null, i);
      continue;
    }
    if (word === 'fost') { if (open) open.end = i; continue; }
    if (FIRST_PERSON.has(word)) {
      // "sunt" is also 3rd plural: "ei sunt obositi" is not about us, and
      // neither is "Josh si Maya sunt prietenii mei".
      if (GENDERED_PRONOUN.has(prev) || names.has(prev)) open = undefined;
      else start('speaker', i);
      continue;
    }
    if (SECOND_PERSON.has(word)) { start('addressee', i); continue; }
    if (THIRD_PERSON.has(word)) { third('other'); continue; }
    // "Rose lucreaza ca profesoara": a name, the verb, then the role it names.
    // The role agrees with the name, and "ca" is exactly what marks it off --
    // which is why "ca" is a clause boundary everywhere else.
    if (word === 'ca' && i >= 2) {
      const subject = bare(tokens[i - 2]!).toLowerCase();
      if (names.has(subject) && !names.has(prev)) { start('other', i, subject); continue; }
    }
    if (BOUNDARY.has(word)) {
      // "si" directly after the copula is "also", not a new clause: a
      // conjunction cannot coordinate a predicate that has not started yet.
      // "Maya este si prietena mea" is one clause, and all of it agrees.
      if (!open || i !== open.copula + 1) { open = undefined; continue; }
    }

    if (open) { owners[i] = open; open.end = i; }
    if (/[,;.!?]$/.test(raw)) open = undefined;
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
  const pick = <T extends Target | undefined>(t: T, g: Agreement) =>
    (t === 'both' ? g : t) as T extends undefined ? Target | undefined : Target;
  const pickPeople = (g: Agreement): PeopleOptions | undefined => people && {
    source: people.source,
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
  const { owners, spans } = analyze(tokens, names);
  const changed: Candidate[] = [];
  let fellBack = false;

  /** A named person's own choice wins; anyone else follows the general one. */
  const targetFor = (span: Span | null | undefined): Target | undefined => {
    if (!span) return undefined;
    if (span.role === 'speaker') return speaker;
    return (span.subject ? chosen.get(span.subject) : undefined) ?? other;
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
    const lemma = candidates
      .filter((c) => c.index > span.copula && c.index <= span.end)
      .flatMap((c) => c.options.map((o) => o.lemma))
      .find((l) => paraphraseFor(l));
    const verb = lemma ? paraphraseFor(lemma) : undefined;
    if (!verb) { fellBack = true; continue; }
    const tail = tokens[span.end]!.match(/[^\p{L}]+$/u)?.[0] ?? '';
    const word = span.role === 'speaker' ? verb.verb1sg : verb.verb2sg;
    const atStart = span.copula === 0 || /[.!?]$/.test(tokens[span.copula - 1] ?? '');
    replaced.set(span.copula, (atStart ? capitalize(word) : word) + tail);
    for (let i = span.copula + 1; i <= span.end; i++) dropped.add(i);
  }

  for (const c of candidates) {
    if (dropped.has(c.index) || replaced.has(c.index)) continue;
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

  const finalTokens = tokens
    .map((t, i) => replaced.get(i) ?? (dropped.has(i) ? undefined : t))
    .filter((t): t is string => t !== undefined);
  const finalText = finalTokens.join(' ');

  // Recompute for display: a paraphrase removes tokens, so the original
  // indices no longer line up with what the user actually sees.
  const display = findGendered(finalText);
  const finalNames = people?.source ? namesIn(finalTokens, people.source) : names;
  const finalOwners = analyze(finalTokens, finalNames).owners;
  const governed = new Set<string>();
  for (const c of display) {
    const owner = finalOwners[c.index];
    c.role = owner?.role;
    c.person = owner?.subject;
    c.autoApplied = Boolean(targetFor(owner));
    if (owner?.subject) governed.add(owner.subject);
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

  return { text: finalText, candidates: display, changed, fellBack, people: peopleFound };
}
