import '@fontsource-variable/inter';
import './styles.css';
import { applyGender, type Person, type Target } from '../ro/postedit.ts';
import { translate, isLoaded, TranslationUnavailable } from '../ro/mt.ts';

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
  const el = document.querySelector<HTMLInputElement>(`input[name="${group}"][value="${value}"]`);
  if (el) el.checked = true;
};

function saveProfile(): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      speaker: chosen('speaker'), addressee: chosen('addressee'),
    }));
  } catch { /* private mode or blocked storage: the app works without it */ }
}

function loadProfile(): void {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return;
    const saved = JSON.parse(raw) as { speaker?: string; addressee?: string };
    // Every restored value is checked before it reaches setChoice, which
    // interpolates it into a selector: one stray quote there throws, and the
    // catch below would swallow the rest of the restore with it.
    const valid = (v: string | undefined) =>
      v !== undefined && (v === '' || TARGETS.has(v as Target));
    if (valid(saved.speaker)) setChoice('speaker', saved.speaker!);
    if (valid(saved.addressee)) setChoice('addressee', saved.addressee!);
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
  meta.append(strong(applied), applied === 1 ? ' word set from your profile' : ' words set from your profile');
  if (untouched) meta.append(' · ', strong(untouched), ' left as translated');
  if (fellBack) meta.append(' · no gender-free wording exists here, so both forms are shown');
}

/**
 * What a named person can be given. The blank option is not a fifth behaviour:
 * it means no override, so that person keeps following "Anyone else".
 */
const personOptions = (fallback: string): readonly (readonly [string, string])[] => [
  ['', fallback], ['M', 'Masculine'], ['F', 'Feminine'], ['both', 'Both'], ['avoid', 'Avoid'],
];

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
function renderPeople(people: Person[]): void {
  // Two or more named people ARE the other people, so the catch-all row goes
  // away rather than sitting there silently outranking them.
  const general = people.length < GENERAL_ROW_LIMIT;
  generalRow.hidden = !general;

  // Rebuilding on every translation would blow away a selection mid-edit.
  const signature = people.map((p) => `${p.name}:${p.governs}`).join('\u0000') + `|${general}`;
  if (signature === shownPeople) return;
  shownPeople = signature;
  peopleExpanded = false;   // a new cast of people starts collapsed
  for (const observer of personObservers) observer.disconnect();
  personObservers = [];
  personPlacers = [];
  for (const stale of whoGroup.querySelectorAll('.row-person')) stale.remove();

  const options = personOptions(general ? 'Same' : 'Not set');
  const overflow: HTMLElement[] = [];

  people.forEach(({ name, governs }, i) => {
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

    for (const [value, text] of options) {
      const option = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = id;
      input.value = value;
      input.checked = (personChoices.get(key) ?? '') === value;
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

/** Only offer speech when the system actually has a Romanian voice installed. */
const romanianVoice = (): SpeechSynthesisVoice | undefined =>
  window.speechSynthesis?.getVoices().find((v) => v.lang.toLowerCase().startsWith('ro'));

function refreshSpeak(): void {
  speakBtn.hidden = !romanianVoice();
}

if ('speechSynthesis' in window) {
  refreshSpeak();
  // Voices populate asynchronously, and often only after the first query.
  window.speechSynthesis.addEventListener('voiceschanged', refreshSpeak);
} else {
  speakBtn.hidden = true;
}

speakBtn.addEventListener('click', () => {
  const voice = romanianVoice();
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
let translated: { source: string; romanian: string } | undefined;

async function run(): Promise<void> {
  const text = source.value.trim();
  if (!text) return;
  go.disabled = true;
  meta.classList.remove('error');
  // The model is fetched once, then cached by the browser. Say so, because
  // ~113 MB downloading in silence looks like the app has hung.
  if (translated?.source !== text) {
    meta.textContent = isLoaded() ? 'Translating…' : 'Preparing the translator…';
  }
  try {
    if (translated?.source !== text) {
      // New text, new people: the Alex in this sentence need not be the Alex
      // in the last one, so nobody's choice survives the change.
      personChoices.clear();
      shownPeople = '';
      const [romanian] = await translate([text], ({ percent }) => {
        meta.textContent = `Downloading the translation model… ${Math.round(percent)}%`;
      });
      translated = { source: text, romanian: romanian ?? '' };
    }
    const speaker = targetOf('speaker') ?? 'M';
    const choices = { source: text, targets: Object.fromEntries(personChoices) };
    let result = applyGender(translated.romanian, speaker, targetOf('addressee'), choices);
    // Once the named rows replace "Anyone else", it must stop applying too: a
    // hidden control still forcing a gender is a trap. Re-running costs
    // nothing -- the model is not involved a second time.
    if (result.people.length >= GENERAL_ROW_LIMIT && targetOf('addressee')) {
      result = applyGender(translated.romanian, speaker, undefined, choices);
    }
    renderPeople(result.people);
    empty.hidden = true;
    spoken = result.variants.join('\n');
    tools.hidden = false;
    describe(render(result));
    // Re-trigger the enter animation on every new result.
    output.classList.remove('enter');
    void output.offsetWidth;
    output.classList.add('enter');
  } catch (err) {
    fail(err instanceof TranslationUnavailable
      ? 'The translation model could not be loaded. Check your connection and try again.'
      : `Translation failed: ${String(err)}`);
  } finally {
    go.disabled = false;
  }
}

form.addEventListener('submit', (e) => { e.preventDefault(); void run(); });

for (const radio of document.querySelectorAll('input[name="speaker"], input[name="addressee"]')) {
  radio.addEventListener('change', () => {
    saveProfile();
    if (source.value.trim()) void run();
  });
}

/**
 * The selected segment is a thumb that slides, as it does on iOS. CSS cannot
 * do this alone: the thumb has to be measured against whichever label is
 * currently checked, and re-measured when the font loads or the box resizes.
 */
function mountThumb(seg: HTMLElement): { observer: ResizeObserver; place: (animate: boolean) => void } {
  const thumb = document.createElement('div');
  thumb.className = 'seg-thumb';
  seg.prepend(thumb);

  const place = (animate: boolean) => {
    const label = seg.querySelector<HTMLInputElement>('input:checked')?.closest('label');
    if (!label) return;
    // Jump without animating on first paint and on resize; only a real
    // selection change should slide.
    if (!animate) thumb.style.transition = 'none';
    const track = seg.getBoundingClientRect();
    const box = label.getBoundingClientRect();
    thumb.style.setProperty('--seg-w', `${box.width}px`);
    thumb.style.setProperty('--seg-x', `${box.left - track.left}px`);
    if (!animate) { void thumb.offsetWidth; thumb.style.transition = ''; }
    thumb.classList.add('ready');
  };

  place(false);
  seg.addEventListener('change', () => place(true));
  const observer = new ResizeObserver(() => place(false));
  observer.observe(seg);
  // Inter loads after first paint and changes label widths.
  void document.fonts?.ready.then(() => place(false));
  return { observer, place };
}

/** The field grows with its content rather than reserving empty rows. */
function autoGrow(): void {
  source.style.height = 'auto';
  source.style.height = `${source.scrollHeight}px`;
}
source.addEventListener('input', autoGrow);

// Offline shell, so the app opens without a network once installed.
if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost')) {
  void navigator.serviceWorker.register(new URL('sw.js', location.href)).catch(() => {
    /* offline support is a bonus; the app works without it */
  });
}

loadProfile();
for (const seg of document.querySelectorAll<HTMLElement>('.seg')) mountThumb(seg);
autoGrow();
empty.hidden = false;
