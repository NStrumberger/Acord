import '@fontsource-variable/inter';
import './styles.css';
import { applyGender, type Target } from '../ro/postedit.ts';
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

const STORE = 'gendered-translator.profile';
const TARGETS = new Set<Target>(['M', 'F', 'both', 'avoid']);

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
    if (saved.speaker) setChoice('speaker', saved.speaker);
    if (saved.addressee !== undefined) setChoice('addressee', saved.addressee);
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

async function run(): Promise<void> {
  const text = source.value.trim();
  if (!text) return;
  go.disabled = true;
  meta.classList.remove('error');
  // The model is fetched once, then cached by the browser. Say so, because
  // ~113 MB downloading in silence looks like the app has hung.
  meta.textContent = isLoaded() ? 'Translating…' : 'Preparing the translator…';
  try {
    const [translated] = await translate([text], ({ percent }) => {
      meta.textContent = `Downloading the translation model… ${Math.round(percent)}%`;
    });
    const result = applyGender(translated ?? '', targetOf('speaker') ?? 'M', targetOf('addressee'));
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
function mountSegmentedThumbs(): void {
  for (const seg of document.querySelectorAll<HTMLElement>('.seg')) {
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
    new ResizeObserver(() => place(false)).observe(seg);
    // Inter loads after first paint and changes label widths.
    void document.fonts?.ready.then(() => place(false));
  }
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
mountSegmentedThumbs();
autoGrow();
empty.hidden = false;
