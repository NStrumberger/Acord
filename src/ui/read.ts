import type { Detection, Finding } from '../ro/detect.ts';
import { mountThumb } from './seg.ts';

/**
 * The people rows, turned round: reading someone else's Romanian, they show
 * what it reveals instead of asking. Same rows, same controls, same place --
 * but read-only, each with the word that proves it, and a plain "not shown"
 * where the Romanian does not say. Everyone is listed: a missing row would
 * read as a person the app failed to see.
 */

const GENDERS = [['M', 'Masculine'], ['F', 'Feminine']] as const;

/** One ResizeObserver per row; disconnected when the rows are rebuilt. */
let observers: ResizeObserver[] = [];

function label(text: string, id: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'row-label';
  span.id = id;
  span.textContent = text;
  return span;
}

/** "from obosită" or "from obosit, fericită": the Romanian words themselves. */
function evidence(f: Finding, id: string): HTMLElement {
  const p = document.createElement('span');
  p.className = 'row-evidence';
  p.id = id;
  p.append('from ');
  f.evidence.forEach((e, i) => {
    if (i > 0) p.append(', ');
    const word = document.createElement('i');
    word.lang = 'ro';
    word.textContent = e.word;
    p.append(word);
  });
  if (f.gender === 'M' && f.plural) p.append(' · all men, or a mixed group');
  return p;
}

function note(text: string, kind = ''): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = `row-note ${kind}`.trim();
  span.textContent = text;
  return span;
}

function row(name: string, f: Finding, id: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'row row-read';
  const head = document.createElement('div');
  head.className = 'row-head';
  head.append(label(name, `${id}-label`));

  if (f.status === 'notShown') {
    div.classList.add('row-inert');
    div.append(head, note('not shown in the Romanian'));
    return div;
  }
  head.append(evidence(f, `${id}-proof`));
  if (f.status === 'conflict') {
    div.classList.add('row-inert');
    div.append(head, note('the words disagree', 'conflict'));
    return div;
  }
  if (f.gender === 'mixed') {
    div.classList.add('row-inert');
    div.append(head, note('several people, men and women'));
    return div;
  }

  // The control people already know, showing the answer and taking no input.
  const seg = document.createElement('div');
  seg.className = 'seg seg-read';
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-labelledby', `${id}-label`);
  seg.setAttribute('aria-readonly', 'true');
  // A screen reader should hear the proof with the answer, not only in browse mode.
  seg.setAttribute('aria-describedby', `${id}-proof`);
  for (const [value, text] of GENDERS) {
    const option = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = id;
    input.value = value;
    input.disabled = true;
    input.checked = f.gender === value;
    const caption = document.createElement('span');
    caption.textContent = text;
    option.append(input, caption);
    seg.append(option);
  }
  div.append(head, seg);
  return div;
}

export function renderFindings(group: HTMLElement, d: Detection): void {
  for (const observer of observers) observer.disconnect();
  observers = [];
  const rows = [
    row('Them', d.them, 'read-them'),
    row('You', d.you, 'read-you'),
    ...d.people.map((p, i) => row(p.name, p, `read-person-${i}`)),
    ...(d.others ? [row('Anyone else', d.others, 'read-others')] : []),
  ];
  group.replaceChildren(...rows);
  // Thumbs are measured, so only once the rows are in the document.
  for (const seg of group.querySelectorAll<HTMLElement>('.seg')) observers.push(mountThumb(seg).observer);
}

/** How many rows show a gender, for the line under the panel. */
export function countShown(d: Detection): { shown: number; notShown: number } {
  const all = [d.them, d.you, ...d.people, ...(d.others ? [d.others] : [])];
  const shown = all.filter((f) => f.status === 'shown').length;
  return { shown, notShown: all.length - shown };
}
