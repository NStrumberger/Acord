/**
 * Round-trip check for the gender detector. Every review case says who is a
 * man and who a woman; the forward pipeline writes that into the Romanian, and
 * detecting it again must give back the same, or "not shown" -- never the
 * other gender. Each disagreement is listed, since it is a bug on one side or
 * the other: the detector misreading, or the post-editor having missed a word.
 *
 *   node scripts/review-roundtrip.ts [out.txt] [english.json]
 *
 * english.json, optional, maps each Romanian output to its translation back
 * into English (from scripts/browser-mt.ts); without it the original English
 * stands in, which is kinder to names than the real path is.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { applyGender, type Target } from '../src/ro/postedit.ts';
import { detectGender, type Finding } from '../src/ro/detect.ts';
import { KINSHIP } from '../src/ro/words.ts';

type Run = {
  id: string; en: string; mt: string;
  settings: { speaker: Target; addressee: Target | null; targets: Record<string, Target> };
};
const RUNS = ['eval/runs/2026-10-12-bergamot-tidy-a.jsonl', 'eval/runs/2026-10-12-bergamot-tidy-b.jsonl'];
const [out = 'eval/roundtrip.txt', englishFile] = process.argv.slice(2);
const english: Record<string, string> = englishFile ? JSON.parse(readFileSync(englishFile, 'utf8')) : {};

/** Words whose gender is their own, whatever the settings: a sister, "ea". */
const NATURAL = new Set([...KINSHIP.keys(), 'el', 'ea', 'ele', 'lui', 'dânsul', 'dânsa', 'dumnealui', 'dumneaei']);

const tally = { agree: 0, notShown: 0, disagree: 0, conflict: 0 };
/** The same per role, to see where "not shown" comes from. */
const byRole = new Map<string, Record<string, number>>();
const count = (role: string, outcome: string) => {
  const t = byRole.get(role) ?? {};
  t[outcome] = (t[outcome] ?? 0) + 1;
  byRole.set(role, t);
};
const lines: string[] = [];

function check(id: string, who: string, expected: Target | null | undefined, f: Finding | undefined,
               context: string): void {
  if (expected !== 'M' && expected !== 'F') return;   // both, avoid or unset: nothing to compare
  const role = who === 'them' || who === 'you' || who === 'others' ? who : 'named';
  if (!f || f.status === 'notShown') { tally.notShown++; count(role, 'notShown'); return; }
  // Only words the settings decide; a sister is a woman whatever they say.
  const set = f.evidence.filter((e) => !NATURAL.has(e.word.toLowerCase()));
  if (!set.length) { tally.notShown++; count(role, 'notShown'); return; }
  const wrong = set.filter((e) => e.gender !== expected);
  if (!wrong.length) { tally.agree++; count(role, 'agree'); return; }
  if (f.status === 'conflict') tally.conflict++; else tally.disagree++;
  count(role, f.status === 'conflict' ? 'conflict' : 'disagree');
  lines.push(`${id} ${who}: set ${expected}, read ${wrong.map((e) => `${e.word}=${e.gender}`).join(' ')}\n  ${context}`);
}

for (const file of RUNS) {
  for (const r of readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Run)) {
    const { speaker, addressee, targets } = r.settings;
    const choices = { source: r.en, targets };
    // Same as main.ts run(): from two named people "anyone else" is only the unnamed.
    let res = applyGender(r.mt, speaker, addressee ?? undefined, choices);
    const namedFollowOthers = res.people.length < 2;
    if (!namedFollowOthers) {
      res = applyGender(r.mt, speaker, res.othersPresent ? addressee ?? undefined : undefined,
        { ...choices, namedFollowOthers: false });
    }
    // A doublet ("obosit/obosită") is both on purpose; read the first reading.
    const ro = res.variants[0]!;
    const d = detectGender(ro, english[ro] ?? r.en);
    const context = `${r.en}  ->  ${ro}`;
    check(r.id, 'them', speaker, d.them, context);
    check(r.id, 'you', addressee, d.you, context);
    // A "he", "she" or a sister fixes a third person's gender whatever the
    // settings say, and the post-editor rightly leaves it: nothing to compare.
    const pinned = /\b(he|she|him|his|her)\b/i.test(r.en) || ro.split(/\s+/).some((t) =>
      KINSHIP.has(t.replace(/^\P{L}+|\P{L}+$/gu, '').toLowerCase()));
    if (!pinned) check(r.id, 'others', addressee, d.others, context);
    for (const p of d.people) {
      const key = p.name.toLowerCase();
      const own = Object.hasOwn(targets, key) ? targets[key] : undefined;
      check(r.id, p.name, own ?? (namedFollowOthers ? addressee : undefined), p, context);
    }
  }
}

const summary = [`agree ${tally.agree}, not shown ${tally.notShown}, disagree ${tally.disagree}, conflict ${tally.conflict}`,
  ...[...byRole].map(([role, t]) => `  ${role}: ${JSON.stringify(t)}`)].join('\n');
writeFileSync(out, `${summary}\n\n${lines.join('\n')}\n`);
console.log(summary);
