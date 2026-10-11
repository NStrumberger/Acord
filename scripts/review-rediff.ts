/**
 * Re-run the post-editor on every recorded translation of a review run and
 * list each output that changed, marking the ones both reviewers had judged
 * ok -- those are the likeliest regressions. No model needed: the MT is in
 * the run file.
 *
 *   node scripts/review-rediff.ts <out.txt>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { applyGender, type Target } from '../src/ro/postedit.ts';

type Run = {
  id: string; en: string; mt: string; variants: string[];
  settings: { speaker: Target; addressee: Target | null; targets: Record<string, Target> };
};
type Review = { corrected: string | null } | null;
type Merged = { id: string; agreement: string; x: Review; y: Review };

const RUN = 'eval/runs/2026-10-11.jsonl';
const runs = readFileSync(RUN, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Run);
const merged = new Map((JSON.parse(readFileSync('eval/merged-review.json', 'utf8')) as Merged[])
  .map((m) => [m.id, m]));

const lines: string[] = [];
let changed = 0, wasOk = 0;
for (const r of runs) {
  const { speaker, addressee, targets } = r.settings;
  const choices = { source: r.en, targets };
  // Same as main.ts run(): from two named people the catch-all row covers only
  // the people the sentence does not name.
  let res = applyGender(r.mt, speaker, addressee ?? undefined, choices);
  if (res.people.length >= 2) {
    res = applyGender(r.mt, speaker, res.othersPresent ? addressee ?? undefined : undefined,
      { ...choices, namedFollowOthers: false });
  }
  const now = res.variants.join(' || ');
  const before = r.variants.join(' || ');
  if (now === before) continue;
  changed++;
  const m = merged.get(r.id);
  const ok = m?.agreement === 'both-ok';
  if (ok) wasOk++;
  const fix = m?.x?.corrected ?? m?.y?.corrected ?? '';
  lines.push(`${ok ? 'WAS-OK ' : 'flagged'} ${r.id} ${JSON.stringify(r.settings)}\n` +
    `  en:     ${r.en}\n  before: ${before}\n  now:    ${now}\n  review: ${fix}`);
}
const out = process.argv[2];
if (!out) throw new Error('usage: review-rediff.ts <out.txt>');
writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`changed ${changed}, of which both reviewers had judged ok: ${wasOk}`);
