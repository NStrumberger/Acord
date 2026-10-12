import type { Agreement } from './gender.ts';
import { allEntries } from './lexicon.ts';
import { bare, findGendered as findForms, type Candidate } from './forms.ts';
import { analyze, governance, isWord, namesIn, wordIndex, type Span } from './analyze.ts';

export { buildFormIndex, type Candidate, type GenderedForm } from './forms.ts';

/** Every token that is a gendered form we recognise, from the full word list. */
export const findGendered = (text: string): Candidate[] => findForms(text, wordIndex());
export type { Role } from './analyze.ts';

const isUpper = (t: string) => t.length > 0 && t[0]! === t[0]!.toUpperCase();
const recase = (replacement: string, original: string) =>
  isUpper(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * What to do about one person's gender.
 *   'M' / 'F'  a definite grammatical gender
 *   'both'     print both forms; Romanian has no third to invent
 *   'avoid'    say it without gender at all, where the language allows
 */
export type Target = Agreement | 'both' | 'avoid';

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
  /** The English names a thing as subject somewhere: "it is", "this was", "that's". */
  const impersonal = /\b(?:it|this|that)(?:['’]s\b|\s+(?:is|was|seems|looks|sounds|feels)\b)/i
    .test(people?.source ?? '');
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

  const cand = new Map(candidates.map((c) => [c.index, c]));
  const words = tokens.map((t) => bare(t).toLowerCase());
  const { isNoun, isOrdinal, free, afterPreposition, adverb, anonymous, personal } =
    governance(tokens, candidates, owners);

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
    if (!free(c.index) || afterPreposition(c.index) || adverb(c.index)) continue;
    // "It's clear that ..." is "E clar că ...": when the English says the
    // subject is a thing, a subject-less clause is that thing's, and only a
    // word for a person ("E profesoară") follows anyone's setting.
    const span = owners[c.index];
    if (impersonal && span && anonymous(span) && !personal(c.index)) continue;
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
