/**
 * R12 spike: is there a Romanian -> English model good enough for the reverse
 * direction? Back-translates Acord's own gendered Romanian (the R11 run, whose
 * English we know) and records what a reviewer needs: the English that went
 * in, the Romanian, and what came back.
 *
 *   node scripts/spike-ro-en.ts [model] [run.jsonl] [out.jsonl]
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

env.cacheDir = './data/raw/hf-cache';

const [model = 'Xenova/opus-mt-ROMANCE-en', input = 'eval/runs/2026-10-11.jsonl',
  output = 'eval/runs/ro-en-spike.jsonl'] = process.argv.slice(2);

type Run = { id: string; en: string; intent: string; output: string };
type Translator = (input: string[], options?: object) => Promise<{ translation_text: string }[]>;
/** Many-to-many models must be told the pair; Marian models know theirs. */
const pair = /m2m100|nllb/i.test(model) ? { src_lang: 'ro', tgt_lang: 'en' } : undefined;

const PRONOUN = /\b(he|she|him|her|his|hers|himself|herself)\b/gi;
const pronouns = (s: string) => (s.match(PRONOUN) ?? []).map((p) => p.toLowerCase());
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z']+/g) ?? []);

/** Share of the original English words that came back: crude, but comparable across models. */
function overlap(a: string, b: string): number {
  const x = words(a), y = words(b);
  let hit = 0;
  for (const w of x) if (y.has(w)) hit++;
  return x.size ? hit / x.size : 1;
}

function sizeOf(dir: string): number {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? sizeOf(p) : statSync(p).size;
  }
  return total;
}

const started = Date.now();
const translator = await pipeline('translation', model, { dtype: 'q8' }) as unknown as Translator;
const loadMs = Date.now() - started;

const runs = readFileSync(input, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Run);
const lines: string[] = [];
let pronounCases = 0, pronounKept = 0, overlapSum = 0;
const t0 = Date.now();
for (const r of runs) {
  // One sentence per call, as mt.ts does: Marian drops sentences when batched.
  const back: string[] = [];
  for (const s of r.output.split(/(?<=[.!?…])\s+/).filter(Boolean)) {
    const [res] = await translator([s], pair);
    back.push(res?.translation_text.trim() ?? '');
  }
  const en2 = back.join(' ');
  const want = pronouns(r.en), got = pronouns(en2);
  if (want.length) {
    pronounCases++;
    if (want.join() === got.join()) pronounKept++;
  }
  const o = overlap(r.en, en2);
  overlapSum += o;
  lines.push(JSON.stringify({ id: r.id, en: r.en, intent: r.intent, ro: r.output, back: en2,
    overlap: Number(o.toFixed(2)), pronounsIn: want, pronounsOut: got }));
}
writeFileSync(output, lines.join('\n') + '\n', 'utf8');
const dir = join(env.cacheDir as string, ...model.split('/'));
console.log(JSON.stringify({
  model, cases: runs.length, loadMs, msPerCase: Math.round((Date.now() - t0) / runs.length),
  cacheMB: Number((sizeOf(dir) / 1e6).toFixed(1)),
  meanOverlap: Number((overlapSum / runs.length).toFixed(3)),
  pronounCases, pronounKept,
}, null, 1));
