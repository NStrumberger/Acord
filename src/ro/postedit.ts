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

/** Whose gender a predicate agrees with. */
export type Role = 'speaker' | 'addressee';

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
  am: 'speaker', ai: 'addressee', 'ați': 'addressee', ati: 'addressee', a: null, au: null,
};
/** Anything that starts a new clause ends the current agreement span. */
const BOUNDARY = new Set([
  'și', 'si', 'dar', 'iar', 'însă', 'insa', 'sau', 'ori',
  'care', 'că', 'ca', 'fiindcă', 'deoarece', 'pentru', 'când', 'cand', 'dacă', 'daca',
]);
const THIRD_PERSON_SUBJECT = new Set(['el', 'ea', 'ei', 'ele', 'dumnealui', 'dumneaei']);

/** A copula and the predicate that agrees with its subject. */
type Span = { role: Role; copula: number; end: number };

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
function analyze(tokens: string[]): { roles: (Role | null)[]; spans: Span[] } {
  const roles: (Role | null)[] = new Array(tokens.length).fill(null);
  const spans: Span[] = [];
  let open: Span | undefined;

  const start = (role: Role | null, at: number) => {
    open = undefined;
    if (!role) return;
    open = { role, copula: at, end: at };
    spans.push(open);
  };

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i]!;
    const word = bare(raw).toLowerCase();
    const next = i + 1 < tokens.length ? bare(tokens[i + 1]!).toLowerCase() : '';
    const prev = i > 0 ? bare(tokens[i - 1]!).toLowerCase() : '';

    // "am fost" opens a span; a bare "a" or "ai" is a possessive article.
    if (next === 'fost' && word in PERFECT) { start(PERFECT[word] ?? null, i); continue; }
    if (word === 'fost') { if (open) open.end = i; continue; }
    if (FIRST_PERSON.has(word)) {
      start(THIRD_PERSON_SUBJECT.has(prev) ? null : 'speaker', i);  // "ei sunt obositi" is not us
      continue;
    }
    if (SECOND_PERSON.has(word)) { start('addressee', i); continue; }
    if (THIRD_PERSON.has(word) || BOUNDARY.has(word)) { open = undefined; continue; }

    if (open) { roles[i] = open.role; open.end = i; }
    if (/[,;.!?]$/.test(raw)) open = undefined;
  }
  return { roles, spans };
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
};

/**
 * Rewrite the words that agree with the speaker or the addressee, leaving
 * everyone else's words alone. Omit `addressee` to rewrite only the speaker's.
 */
export function applyGender(text: string, speaker: Target, addressee?: Target): PostEdit {
  const primary = edit(text, speaker, addressee);
  const doubled = primary.changed.filter((c) => c.doubled).length;
  if (doubled <= 1) return { ...primary, variants: [primary.text] };
  // Several doublets in one sentence read as noise; print the two readings whole.
  const pick = (t: Target | undefined, g: Agreement) => (t === 'both' ? g : t);
  const m = edit(text, pick(speaker, 'M')!, pick(addressee, 'M'));
  const f = edit(text, pick(speaker, 'F')!, pick(addressee, 'F'));
  return { ...primary, text: m.text, variants: [m.text, f.text] };
}

function edit(text: string, speaker: Target, addressee?: Target): Omit<PostEdit, 'variants'> {
  const tokens = text.split(/\s+/);
  const candidates = findGendered(text);
  const { roles, spans } = analyze(tokens);
  const changed: Candidate[] = [];
  let fellBack = false;

  // Clause level first: avoiding gender replaces a whole copula clause with a
  // gender-free verb, which no amount of word swapping can achieve.
  const replaced = new Map<number, string>();
  const dropped = new Set<number>();
  for (const span of spans) {
    if ((span.role === 'speaker' ? speaker : addressee) !== 'avoid') continue;
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
    const role = roles[c.index] ?? null;
    const wanted = role === 'speaker' ? speaker : role === 'addressee' ? addressee : undefined;
    // An avoid that found no paraphrase degrades to showing both forms.
    const target = wanted === 'avoid' ? 'both' : wanted;
    if (!target) continue;
    const option = target === 'both'
      ? c.options[0]
      : c.options.find((o) => o.agreement !== target);
    if (!option) continue;
    c.doubled = target === 'both';
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
  const finalRoles = analyze(finalTokens).roles;
  for (const c of display) {
    const role = finalRoles[c.index] ?? null;
    c.role = role ?? undefined;
    c.autoApplied = Boolean(
      role === 'speaker' ? speaker : role === 'addressee' ? addressee : undefined);
  }
  return { text: finalText, candidates: display, changed, fellBack };
}
