/**
 * Join the two independent sentence reviews per case and sort out what needs
 * a human (or an auditor) from what both reviewers already agree on. Purely
 * mechanical: no judgement happens here.
 *
 *   node scripts/review-merge.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';

type Problem = { token: string; issue: string; fix: string };
type Review = {
  id: string; verdict: 'ok' | 'wrong' | 'awkward'; problems: Problem[];
  corrected: string | null; source: string; flag: string;
};
type Run = { id: string; en: string; intent: string; mt: string; output: string };

const RUN = 'eval/runs/2026-10-11.jsonl';
const REVIEWS = { x: ['eval/sentence-review-1-x.json', 'eval/sentence-review-2-x.json'],
                  y: ['eval/sentence-review-1-y.json', 'eval/sentence-review-2-y.json'] };

const runs = readFileSync(RUN, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Run);
const byId = (files: string[]) => new Map(files
  .flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as Review[])
  .map((r) => [r.id, r] as const));
const x = byId(REVIEWS.x);
const y = byId(REVIEWS.y);

/** A quoted token that is not in the output is the reviewer's error, not Acord's. */
const badTokens = (r: Review | undefined, output: string) =>
  (r?.problems ?? []).filter((p) => p.token && !output.includes(p.token)).map((p) => p.token);

function agreement(a?: Review, b?: Review): string {
  if (!a || !b) return 'missing-review';
  const bad = (v: string) => v !== 'ok';
  if (!bad(a.verdict) && !bad(b.verdict)) return 'both-ok';
  if (bad(a.verdict) && bad(b.verdict)) return a.source === b.source ? 'both-flag-same-source' : 'both-flag';
  return 'disagree';
}

const merged = runs.map((r) => {
  const a = x.get(r.id), b = y.get(r.id);
  return { id: r.id, en: r.en, intent: r.intent, mt: r.mt, output: r.output,
           agreement: agreement(a, b), x: a ?? null, y: b ?? null,
           badTokens: [...badTokens(a, r.output), ...badTokens(b, r.output)] };
});
writeFileSync('eval/merged-review.json', JSON.stringify(merged, null, 1) + '\n', 'utf8');

const count = (key: (m: typeof merged[number]) => string) =>
  merged.reduce<Record<string, number>>((acc, m) => ({ ...acc, [key(m)]: (acc[key(m)] ?? 0) + 1 }), {});
console.log('cases', merged.length);
console.log('agreement', count((m) => m.agreement));
console.log('reviews quoting tokens absent from output', merged.filter((m) => m.badTokens.length).map((m) => m.id));
