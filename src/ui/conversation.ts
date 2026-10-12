import type { Agreement } from '../ro/gender.ts';
import type { Detection } from '../ro/detect.ts';

/**
 * Conversation mode: write, copy it into the messaging app, paste their reply
 * back, read it, reply. The transcript lives in memory only -- a private
 * conversation has no business in storage -- and goes when the page does.
 */

export type Turn = { who: 'you' | 'them'; original: string; translation: string };

/** What their last message showed, offered for your reply. */
export type Carried = { them?: Agreement; people: Map<string, Agreement> };

const ENABLED = 'acord.conversation';
let turns: Turn[] = [];

export function isEnabled(): boolean {
  try { return localStorage.getItem(ENABLED) === 'on'; } catch { return false; }
}

export function setEnabled(on: boolean): void {
  try { localStorage.setItem(ENABLED, on ? 'on' : 'off'); } catch { /* the app works without it */ }
}

export function record(turn: Turn): void {
  const last = turns.at(-1);
  if (last && last.who === turn.who && last.original === turn.original) return;
  turns = [...turns, turn];
}

export function clear(): void {
  turns = [];
}

export const count = () => turns.length;

/**
 * A gender their message shows plainly, about the writer or someone named, to
 * start your reply on. Masculine plurals and conflicts are no answer, so they
 * carry nothing.
 */
export function carryFrom(d: Detection): Carried {
  const single = (status: string, gender: string | undefined) =>
    status === 'shown' && (gender === 'M' || gender === 'F') ? gender : undefined;
  const people = new Map<string, Agreement>();
  for (const p of d.people) {
    const g = single(p.status, p.gender);
    if (g) people.set(p.name.toLowerCase(), g);
  }
  const them = single(d.them.status, d.them.gender);
  return them ? { them, people } : { people };
}

export function renderTranscript(list: HTMLElement): void {
  list.replaceChildren(...turns.map((t) => {
    const item = document.createElement('div');
    item.className = `turn turn-${t.who}`;
    const who = document.createElement('span');
    who.className = 'turn-who';
    who.textContent = t.who === 'you' ? 'You' : 'Them';
    // Their words are Romanian first; yours are English first.
    const original = document.createElement('p');
    original.className = 'turn-original';
    original.lang = t.who === 'you' ? 'en' : 'ro';
    original.textContent = t.original;
    const translation = document.createElement('p');
    translation.className = 'turn-translation';
    translation.lang = t.who === 'you' ? 'ro' : 'en';
    translation.textContent = t.translation;
    item.append(who, original, translation);
    return item;
  }));
}
