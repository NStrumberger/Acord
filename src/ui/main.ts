import '@fontsource-variable/inter';
import './styles.css';
import { applyGender, type Person, type Target } from '../ro/postedit.ts';
import { translate, isLoaded, TranslationUnavailable, type Pair } from '../ro/mt.ts';
import { mountThumb } from './seg.ts';
import { renderFindings, countShown } from './read.ts';
import type { PronounFix } from '../en/pronouns.ts';
import type { Detection } from '../ro/detect.ts';
import * as conversation from './conversation.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('form');
const source = $<HTMLTextAreaElement>('source');
const go = $<HTMLButtonElement>('go');
const output = $<HTMLDivElement>('output');
const empty = $<HTMLParagraphElement>('empty');
const notes = $<HTMLDivElement>('notes');
const meta = $<HTMLParagraphElement>('meta');
const tools = $<HTMLDivElement>('tools');
const speakBtn = $<HTMLButtonElement>('speak');
const copyBtn = $<HTMLButtonElement>('copy');
const toolStatus = $<HTMLSpanElement>('toolStatus');

let spoken = '';   // what the action row acts on

const whoGroup = $<HTMLDivElement>('whoGroup');
const generalRow = $<HTMLDivElement>('generalRow');
const explain = $<HTMLParagraphElement>('explain');
const explainBtn = $<HTMLButtonElement>('explainBtn');
const explainRead = $<HTMLParagraphElement>('explainRead');
const readGroup = $<HTMLDivElement>('readGroup');
const whoHeader = $<HTMLSpanElement>('whoHeader');
const langbar = $<HTMLDivElement>('langbar');
const langFrom = $<HTMLSpanElement>('langFrom');
const langTo = $<HTMLSpanElement>('langTo');
const flipBtn = $<HTMLButtonElement>('flip');
const sourceLabel = $<HTMLLabelElement>('sourceLabel');
const outPane = $<HTMLElement>('outPane');
const keyWrite = $<HTMLParagraphElement>('keyWrite');
const keyRead = $<HTMLParagraphElement>('keyRead');
const generalHint = $<HTMLSpanElement>('generalHint');
const turnBtn = $<HTMLButtonElement>('turn');
const convoSection = $<HTMLElement>('conversation');
const transcript = $<HTMLDivElement>('transcript');
const clearConvo = $<HTMLButtonElement>('clearConvo');
const convoToggle = $<HTMLInputElement>('convoToggle');

const STORE = 'gendered-translator.profile';
const TARGETS = new Set<Target>(['M', 'F', 'both', 'avoid']);

/**
 * A choice per person named in the sentence, keyed by the lowercased name.
 * Deliberately NOT persisted and cleared whenever the text changes: a name is
 * not a person. Two people called Alex can be different genders, so carrying a
 * choice forward would quietly apply it to the wrong one.
 */
const personChoices = new Map<string, Target>();

const chosen = (group: string) =>
  document.querySelector<HTMLInputElement>(`input[name="${group}"]:checked`)?.value ?? '';

const targetOf = (group: string): Target | undefined =>
  TARGETS.has(chosen(group) as Target) ? (chosen(group) as Target) : undefined;

const setChoice = (group: string, value: string) => {
  const inputs = document.querySelectorAll<HTMLInputElement>(`input[name="${group}"]`);
  // An empty value selects nothing: the translator had no single answer to
  // show, so the control shows none either rather than proposing one.
  for (const input of inputs) input.checked = input.value === value && value !== '';
  // Setting `checked` from code fires no change event, so the thumb would stay
  // where it was. Tell the control itself; the inputs' own handlers stay quiet.
  inputs[0]?.closest('.seg')?.dispatchEvent(new Event('change'));
};

function saveProfile(): void {
  try {
    // Only "Me" is remembered. Everyone else is a fact about this sentence,
    // and their row now starts on what the translation did with them.
    localStorage.setItem(STORE, JSON.stringify({ speaker: chosen('speaker') }));
  } catch { /* private mode or blocked storage: the app works without it */ }
}

function loadProfile(): void {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return;
    const saved = JSON.parse(raw) as { speaker?: string };
    // Every restored value is checked before it reaches setChoice, which
    // interpolates it into a selector: one stray quote there throws, and the
    // catch below would swallow the rest of the restore with it.
    const valid = (v: string | undefined) =>
      v !== undefined && (v === '' || TARGETS.has(v as Target));
    if (valid(saved.speaker)) setChoice('speaker', saved.speaker!);
  } catch { /* ignore unreadable or malformed storage */ }
}

const bare = (t: string) => t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
const strong = (n: number) => {
  const b = document.createElement('b');
  b.textContent = String(n);
  return b;
};

type Rendered = { text: string; applied: number; untouched: number; fellBack: boolean };

function render(result: ReturnType<typeof applyGender>): Rendered {
  output.replaceChildren();
  notes.replaceChildren();

  const byIndex = new Map(result.candidates.map((c) => [c.index, c]));
  const seen = new Set<string>();

  // Several doubled words read as noise inline, so the engine hands back two
  // whole sentences instead. Marking them is redundant: every gendered word
  // differs between the two.
  if (result.variants.length > 1) {
    result.variants.forEach((variant, i) => {
      const p = document.createElement('p');
      p.className = 'variant';
      p.lang = 'ro';
      if (i > 0) p.dataset['or'] = 'or';
      p.textContent = variant;
      output.append(p);
    });
    collectNotes(result, seen);
    notes.hidden = notes.childElementCount === 0;
    const n = result.candidates.filter((c) => c.autoApplied).length;
    return { text: result.text, applied: n, untouched: result.candidates.length - n, fellBack: result.fellBack };
  }

  result.text.split(/\s+/).forEach((token, i) => {
    if (i > 0) output.append(' ');
    const candidate = byIndex.get(i);
    if (!candidate) return void output.append(token);

    // Marks are informational now: the profile decides the form, not a click.
    // Only the word carries the mark -- underlining the full stop after "mea."
    // looks like a mistake.
    const word = bare(token);
    const [before = '', after = ''] = token.split(word);
    const mark = document.createElement('span');
    mark.className = 'g';
    mark.textContent = word;
    const status = candidate.options[0]?.status;
    const disputed = status === 'variant' || status === 'contested';
    if (disputed) mark.dataset['status'] = status;
    if (!candidate.autoApplied) mark.dataset['other'] = 'true';
    output.append(before, mark, after);

    if (disputed) addNote(word, candidate.options[0]?.note, seen);
  });

  notes.hidden = notes.childElementCount === 0;
  const applied = result.candidates.filter((c) => c.autoApplied).length;
  return { text: result.text, applied, untouched: result.candidates.length - applied, fellBack: result.fellBack };
}

function addNote(word: string, explain: string | null | undefined, seen: Set<string>): void {
  if (!explain || seen.has(explain)) return;
  seen.add(explain);
  const p = document.createElement('p');
  p.className = 'note';
  p.append(Object.assign(document.createElement('b'), { textContent: word }), ` — ${explain}`);
  notes.append(p);
}

function collectNotes(result: ReturnType<typeof applyGender>, seen: Set<string>): void {
  for (const c of result.candidates) {
    const status = c.options[0]?.status;
    if (status === 'variant' || status === 'contested') addNote(c.token, c.options[0]?.note, seen);
  }
}

function describe({ applied, untouched, fellBack }: Rendered): void {
  meta.classList.remove('error');
  meta.replaceChildren();
  if (!applied && !untouched) { meta.textContent = 'No gendered words recognised.'; return; }
  meta.append(strong(applied), applied === 1 ? ' word set by you' : ' words set by you');
  if (untouched) meta.append(' · ', strong(untouched), ' left as translated');
  if (fellBack) meta.append(' · no gender-free wording exists here, so both forms are shown');
}

/**
 * The four things that can be done about one person's gender.
 */
const BEHAVIOURS: readonly (readonly [string, string])[] = [
  ['M', 'Masculine'], ['F', 'Feminine'], ['both', 'Both'], ['avoid', 'Avoid'],
];

/**
 * A named person the translator already guessed a gender for starts on that
 * guess, so the row shows what the output is actually doing and the user
 * overrules it by moving the control. Only somebody it guessed nothing for
 * needs a blank option, and what that falls back to depends on whether the
 * general row is still there.
 */
const personOptions = (guess: string | undefined, fallback: string):
    readonly (readonly [string, string])[] =>
  (guess ? BEHAVIOURS : [['', fallback] as const, ...BEHAVIOURS]);

/** Once the sentence names two or more people, they ARE the other people. */
const GENERAL_ROW_LIMIT = 2;

/**
 * Measured rather than guessed. A name row costs about 88px once the layout
 * stacks, and five is the most that still leaves every control reachable
 * without scrolling on a current phone in Safari (390x756 of visible page).
 * An installed app fits six and a small SE only three, so five is what the
 * common case carries. Anyone past it folds away behind a toggle rather than
 * vanishing.
 */
const MAX_VISIBLE_PEOPLE = 5;

let peopleExpanded = false;
/** Whether the user has actually picked for the catch-all row this sentence.
    Until they do it only DISPLAYS the translator's choice, and applies
    nothing -- otherwise a preselected value would silently take effect. */
let othersTouched = false;

let shownPeople = '';
/** One per person row. A ResizeObserver outlives the node it watches. */
let personObservers: ResizeObserver[] = [];
/** Re-places each person row's thumb. A row revealed from display:none has
    never been measured, so it would show a zero-width thumb for a frame. */
let personPlacers: (() => void)[] = [];

/**
 * One row per person the sentence's gender actually turns on, directly under
 * the general rows they override. The engine only reports somebody it can act
 * on, so every row here does something -- an unreachable control would be
 * worse than no control.
 */
function renderPeople(people: Person[], othersPresent: boolean): void {
  // With one name, the catch-all row also covers that person ("Same"). From
  // two names on they each have their own row, and the catch-all stays only
  // while someone unnamed is left for it to cover.
  const general = people.length < GENERAL_ROW_LIMIT;
  generalRow.hidden = !general && !othersPresent;

  // Rebuilding on every translation would blow away a selection mid-edit.
  const signature = people.map((p) => `${p.name}:${p.governs}:${p.guess ?? ''}`)
    .join('\u0000') + `|${general}`;
  if (signature === shownPeople) return;
  shownPeople = signature;
  peopleExpanded = false;   // a new cast of people starts collapsed
  for (const observer of personObservers) observer.disconnect();
  personObservers = [];
  personPlacers = [];
  for (const stale of whoGroup.querySelectorAll('.row-person')) stale.remove();

  const fallback = general ? 'Same' : 'Not set';
  const overflow: HTMLElement[] = [];

  people.forEach(({ name, governs, guess }, i) => {
    const key = name.toLowerCase();
    const id = `person-${i}`;

    const label = document.createElement('span');
    label.className = 'row-label';
    label.id = `${id}-label`;
    label.textContent = name;

    // Nothing in the Romanian follows this person's gender, so there is
    // nothing to offer. Say so rather than dropping them from the list, where
    // the absence would read as not having seen them at all.
    if (!governs) {
      const row = document.createElement('div');
      row.className = 'row row-person row-inert';
      const note = document.createElement('span');
      note.className = 'row-note';
      note.textContent = 'not marked in Romanian';
      row.append(label, note);
      whoGroup.append(row);
      if (i >= MAX_VISIBLE_PEOPLE) overflow.push(row);
      return;
    }

    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-labelledby', label.id);

    for (const [value, text] of personOptions(guess, fallback)) {
      const option = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = id;
      input.value = value;
      input.checked = (personChoices.get(key) ?? guess ?? '') === value;
      const caption = document.createElement('span');
      caption.textContent = text;
      option.append(input, caption);
      seg.append(option);
    }

    seg.addEventListener('change', () => {
      const value = seg.querySelector<HTMLInputElement>('input:checked')?.value ?? '';
      if (TARGETS.has(value as Target)) personChoices.set(key, value as Target);
      else personChoices.delete(key);
      void run();
    });

    const row = document.createElement('div');
    row.className = 'row row-person';
    row.append(label, seg);
    whoGroup.append(row);
    if (i >= MAX_VISIBLE_PEOPLE) overflow.push(row);
    const thumb = mountThumb(seg);   // in the document: the thumb is measured
    personObservers.push(thumb.observer);
    personPlacers.push(() => thumb.place(false));
  });

  if (overflow.length) mountOverflowToggle(overflow);
}

/**
 * Fold the people past the cap away behind one control, rather than letting
 * the list run off the bottom of a phone. They are collapsed to begin with,
 * because the first names in a sentence are the ones most likely to be meant.
 */
function mountOverflowToggle(overflow: HTMLElement[]): void {
  const button = document.createElement('button');
  button.type = 'button';   // inside a form: a bare button would submit it
  button.className = 'toggle';

  const apply = () => {
    for (const row of overflow) row.hidden = !peopleExpanded;
    for (const place of personPlacers) place();   // newly shown rows need measuring
    button.textContent = peopleExpanded
      ? 'Show fewer'
      : `Show ${overflow.length} more ${overflow.length === 1 ? 'person' : 'people'}`;
    button.setAttribute('aria-expanded', String(peopleExpanded));
  };
  button.addEventListener('click', () => { peopleExpanded = !peopleExpanded; apply(); });
  apply();

  const row = document.createElement('div');
  row.className = 'row row-toggle';
  row.append(button);
  whoGroup.append(row);
}

function fail(message: string): void {
  output.replaceChildren();
  notes.replaceChildren();
  notes.hidden = true;
  empty.hidden = false;
  tools.hidden = true;
  meta.classList.add('error');
  meta.textContent = message;
  // Nothing of the previous result may outlive the error: stale findings under
  // it would read as the answer, and Reply would file the wrong translation.
  readGroup.replaceChildren();
  readGroup.hidden = true;
  spoken = '';
  translated = undefined;
  updateTurn();
}

function flash(message: string): void {
  toolStatus.textContent = message;
  toolStatus.classList.add('show');
  setTimeout(() => toolStatus.classList.remove('show'), 1800);
}

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(spoken);
    flash('Copied');
  } catch {
    flash('Your browser blocked the clipboard');
  }
});

/**
 * Which way the app translates. English to Romanian writes your message with
 * the genders you set; Romanian to English reads theirs and shows the genders
 * it reveals. Remembered, because a conversation tends to stay on one side.
 */
let direction: Pair = 'en-ro';
const DIRECTION = 'acord.direction';
const reading = () => direction === 'ro-en';
const outputLang = () => (reading() ? 'en' : 'ro');

/** Only offer speech when the system actually has a voice for the output language. */
const voiceFor = (lang: string): SpeechSynthesisVoice | undefined =>
  window.speechSynthesis?.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));

function refreshSpeak(): void {
  speakBtn.hidden = !voiceFor(outputLang());
}

if ('speechSynthesis' in window) {
  refreshSpeak();
  // Voices populate asynchronously, and often only after the first query.
  window.speechSynthesis.addEventListener('voiceschanged', refreshSpeak);
} else {
  speakBtn.hidden = true;
}

speakBtn.addEventListener('click', () => {
  const voice = voiceFor(outputLang());
  if (!voice) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(spoken.split('\n')[0] ?? '');
  utterance.voice = voice;
  utterance.lang = voice.lang;
  window.speechSynthesis.speak(utterance);
});

/**
 * The last translation, kept so that changing anybody's gender re-runs only
 * the post-editor. Gender is decided after translation, so the model has
 * nothing to add the second time.
 */
let translated: { source: string; pair: Pair; target: string } | undefined;

async function translateFresh(text: string, pair: Pair): Promise<string> {
  if (pair === 'en-ro') {
    // New text, new people: the Alex in this sentence need not be the Alex
    // in the last one, so nobody's choice survives the change.
    personChoices.clear();
    // In a conversation, the people their message showed start your reply on
    // that: a suggestion in the row, which you can still change.
    for (const [name, g] of carried?.people ?? []) personChoices.set(name, g);
    othersTouched = false;
    shownPeople = '';
  }
  const [target] = await translate([text], ({ percent }) => {
    meta.textContent = `Downloading the translation model… ${Math.round(percent)}%`;
  }, pair);
  translated = { source: text, pair, target: target ?? '' };
  return translated.target;
}

function showWriting(text: string, romanian: string): void {
  const speaker = targetOf('speaker') ?? 'M';
  const choices = { source: text, targets: Object.fromEntries(personChoices) };
  // Replying in a conversation: what their message showed about them is who
  // "Anyone else" now is, until you choose otherwise.
  const suggestion = othersTouched ? undefined : carried?.them;
  const others = othersTouched ? targetOf('addressee') : suggestion;
  let result = applyGender(romanian, speaker, others, choices);
  // From two names on, each named person has a row of their own, so "Anyone
  // else" must never reach them: a catch-all silently outranking a named row
  // is a trap. It still covers whoever the sentence does not name ("my
  // boss"), and when there is nobody like that it is hidden and applies to
  // nothing. Re-running costs nothing -- the model is not involved again.
  if (result.people.length >= GENERAL_ROW_LIMIT) {
    result = applyGender(romanian, speaker, result.othersPresent ? others : undefined,
      { ...choices, namedFollowOthers: false });
  }
  // Show what the translator did with everyone it did not name, so this row
  // reads like the others: a visible starting point rather than a blank.
  if (!othersTouched) setChoice('addressee', suggestion ?? result.othersGuess ?? '');
  generalHint.hidden = !suggestion;
  renderPeople(result.people, result.othersPresent);
  spoken = result.variants.join('\n');
  describe(render(result));
}

/** The English, with any pronoun the Romanian corrected marked like a set word. */
function renderEnglish(fix: PronounFix): void {
  output.replaceChildren();
  notes.replaceChildren();
  notes.hidden = true;
  const changed = new Set(fix.changed.map((c) => c.index));
  fix.text.split(/\s+/).forEach((token, i) => {
    if (i > 0) output.append(' ');
    if (!changed.has(i)) return void output.append(token);
    const word = bare(token);
    const [before = '', after = ''] = token.split(word);
    const mark = document.createElement('span');
    mark.className = 'g';
    mark.textContent = word;
    output.append(before, mark, after);
  });
}

/** Returns false when a newer run or a flip overtook it while the code loaded. */
async function showReading(romanian: string, english: string, isCurrent: () => boolean): Promise<boolean> {
  // Loaded on first use: the word list is only needed to read Romanian.
  const [{ detectGender }, { fixPronouns }] =
    await Promise.all([import('../ro/detect.ts'), import('../en/pronouns.ts')]);
  if (!isCurrent()) return false;
  const detection = detectGender(romanian, english);
  lastDetection = detection;
  const fix = fixPronouns(english, detection);
  renderFindings(readGroup, detection);
  readGroup.hidden = false;
  renderEnglish(fix);
  spoken = fix.text;
  const { shown, notShown } = countShown(detection);
  meta.classList.remove('error');
  meta.replaceChildren(strong(shown), shown === 1 ? ' person shown' : ' people shown');
  if (notShown) meta.append(' · ', strong(notShown), ' not shown');
  if (fix.changed.length) {
    meta.append(' · ', strong(fix.changed.length), fix.changed.length === 1 ? ' pronoun corrected' : ' pronouns corrected');
  }
  return true;
}

/** Counts runs, so a slow one that finishes late cannot overwrite a newer one. */
let runs = 0;

async function run(): Promise<void> {
  const text = source.value.trim();
  if (!text) return;
  const pair = direction;
  const ticket = ++runs;
  const isCurrent = () => ticket === runs && pair === direction;
  go.disabled = true;
  meta.classList.remove('error');
  const cached = translated?.source === text && translated.pair === pair ? translated.target : undefined;
  // The model is fetched once, then kept by the service worker. Say so, because
  // ~15 MB downloading in silence on a slow line looks like the app has hung.
  if (cached === undefined) meta.textContent = isLoaded(pair) ? 'Translating…' : 'Preparing the translator…';
  try {
    const target = cached ?? await translateFresh(text, pair);
    if (!isCurrent()) return;   // flipped, or a newer run started, while it translated
    if (pair === 'ro-en') {
      if (!await showReading(text, target, isCurrent)) return;
    } else {
      showWriting(text, target);
    }
    empty.hidden = true;
    tools.hidden = false;
    updateTurn();
    // Re-trigger the enter animation on every new result.
    output.classList.remove('enter');
    void output.offsetWidth;
    output.classList.add('enter');
  } catch (err) {
    if (!isCurrent()) return;
    fail(err instanceof TranslationUnavailable
      ? 'The translation model could not be loaded. Check your connection and try again.'
      : `Translation failed: ${String(err)}`);
  } finally {
    if (ticket === runs) go.disabled = false;
  }
}

form.addEventListener('submit', (e) => { e.preventDefault(); void run(); });

for (const radio of document.querySelectorAll('input[name="speaker"], input[name="addressee"]')) {
  radio.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).name === 'addressee') othersTouched = true;
    saveProfile();
    if (source.value.trim()) void run();
  });
}

/** The explanation that belongs to the current direction. */
const currentExplain = () => (reading() ? explainRead : explain);

explainBtn.addEventListener('click', () => {
  const open = explainBtn.getAttribute('aria-expanded') !== 'true';
  explainBtn.setAttribute('aria-expanded', String(open));
  explain.hidden = true;
  explainRead.hidden = true;
  currentExplain().hidden = !open;
  explainBtn.setAttribute('aria-controls', currentExplain().id);
});

/** Everything that names a language or belongs to one direction. */
function applyDirection(): void {
  const r = reading();
  langFrom.textContent = r ? 'Romanian' : 'English';
  langTo.textContent = r ? 'English' : 'Romanian';
  flipBtn.setAttribute('aria-label', r ? 'Swap: translate English to Romanian' : 'Swap: translate Romanian to English');
  sourceLabel.textContent = r ? 'Romanian' : 'English';
  source.lang = r ? 'ro' : 'en';
  output.lang = outputLang();
  outPane.setAttribute('aria-label', r ? 'English translation' : 'Romanian translation');
  whoHeader.textContent = r ? 'What their Romanian shows' : 'People in the sentence';
  whoGroup.hidden = r;
  readGroup.hidden = !r || readGroup.childElementCount === 0;
  keyWrite.hidden = r;
  keyRead.hidden = !r;
  const open = explainBtn.getAttribute('aria-expanded') === 'true';
  explain.hidden = r || !open;
  explainRead.hidden = !r || !open;
  explainBtn.setAttribute('aria-controls', currentExplain().id);
  refreshSpeak();
}

function clearOutput(): void {
  output.replaceChildren();
  notes.replaceChildren();
  notes.hidden = true;
  readGroup.replaceChildren();
  empty.hidden = false;
  tools.hidden = true;
  meta.classList.remove('error');
  meta.textContent = '';
  spoken = '';
  updateTurn();
}

/**
 * Swap languages, as every translate app does: the translation becomes the
 * text to translate, so their reply can go straight back the other way.
 */
function turnRound(text: string): void {
  direction = reading() ? 'en-ro' : 'ro-en';
  try { localStorage.setItem(DIRECTION, direction); } catch { /* the app works without it */ }
  flipBtn.classList.toggle('turned');
  langbar.classList.remove('swapping');
  void langbar.offsetWidth;
  langbar.classList.add('swapping');
  source.value = text;
  clearOutput();
  applyDirection();
  autoGrow();
  if (text.trim()) void run();
}

/** The translation on screen, if it belongs to the text in the box. */
const current = () =>
  translated && translated.source === source.value.trim() && translated.pair === direction && spoken
    ? { original: translated.source, translation: spoken.split('\n')[0]! } : undefined;

flipBtn.addEventListener('click', () => turnRound(current()?.translation ?? source.value));

/**
 * What their last message showed, offered to your reply, and the reading it
 * came from. Kept until their next message or until the conversation is cleared.
 */
let carried: conversation.Carried | undefined;
let lastDetection: Detection | undefined;

/** "Their reply" after writing, "Reply" after reading: file it, turn round, empty box. */
function updateTurn(): void {
  turnBtn.textContent = reading() ? 'Reply' : 'Their reply';
  turnBtn.hidden = !conversation.isEnabled() || !current();
}

function showTranscript(): void {
  conversation.renderTranscript(transcript);
  convoSection.hidden = !conversation.isEnabled() || conversation.count() === 0;
}

turnBtn.addEventListener('click', () => {
  const now = current();
  if (!now) return;
  conversation.record({ who: reading() ? 'them' : 'you', ...now });
  if (reading() && lastDetection) carried = conversation.carryFrom(lastDetection);
  showTranscript();
  turnRound('');
  source.focus();
});

/**
 * Forget what their message showed, including the person rows it started on:
 * with the mode off, writing must behave exactly as it did without it.
 */
function forgetCarried(): void {
  for (const [name, g] of carried?.people ?? []) {
    if (personChoices.get(name) === g) personChoices.delete(name);
  }
  carried = undefined;
  shownPeople = '';
}

clearConvo.addEventListener('click', () => {
  conversation.clear();
  forgetCarried();
  showTranscript();
  if (source.value.trim() && !reading()) void run();
});

convoToggle.addEventListener('change', () => {
  conversation.setEnabled(convoToggle.checked);
  if (!convoToggle.checked) { conversation.clear(); forgetCarried(); }
  showTranscript();
  updateTurn();
  if (source.value.trim() && !reading()) void run();
});

function loadDirection(): void {
  try {
    if (localStorage.getItem(DIRECTION) === 'ro-en') direction = 'ro-en';
  } catch { /* private mode or blocked storage */ }
}


/** The field grows with its content rather than reserving empty rows. */
function autoGrow(): void {
  source.style.height = 'auto';
  source.style.height = `${source.scrollHeight}px`;
}
source.addEventListener('input', () => { autoGrow(); updateTurn(); });

// Offline shell, so the app opens without a network once installed.
if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost')) {
  void navigator.serviceWorker.register(new URL('sw.js', location.href)).catch(() => {
    /* offline support is a bonus; the app works without it */
  });
}

loadProfile();
loadDirection();
applyDirection();
convoToggle.checked = conversation.isEnabled();
for (const seg of document.querySelectorAll<HTMLElement>('.seg')) mountThumb(seg);
autoGrow();
empty.hidden = false;
