/**
 * Run English review cases through the whole pipeline -- model, then
 * post-editor -- exactly as the UI's run() does, and record everything a
 * reviewer needs to tell a model error from an Acord error.
 *
 *   node scripts/review-run.ts eval/cases.json eval/runs/out.jsonl
 *   node scripts/review-run.ts --fixture      # proves MT matches the fixture
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '@huggingface/transformers';
import { translate } from '../src/ro/mt.ts';
import { applyGender, type Target, type PostEdit, type Candidate } from '../src/ro/postedit.ts';

// Same module instance mt.ts imports, so the model is downloaded once to here.
env.cacheDir = './data/raw/hf-cache';

/** main.ts: from this many named people the catch-all row stops applying. */
const GENERAL_ROW_LIMIT = 2;

type Case = {
  id: string;
  en: string;
  speaker?: Target;
  /** The "anyone else" row: second person and unnamed third parties. */
  addressee?: Target;
  /** Per-person choices, keyed by lowercased name. */
  targets?: Record<string, Target>;
  intent: string;
  covers?: string[];
};

function summarise(c: Candidate) {
  const top = c.options[0];
  return {
    token: c.token, index: c.index, role: c.role, person: c.person,
    doubled: c.doubled ?? false, autoApplied: c.autoApplied ?? false,
    lemma: top?.lemma, kind: top?.kind, status: top?.status, note: top?.note ?? null,
  };
}

function record(k: Case, mt: string, result: PostEdit) {
  return {
    id: k.id, en: k.en, intent: k.intent, covers: k.covers ?? [],
    settings: { speaker: k.speaker ?? 'M', addressee: k.addressee ?? null, targets: k.targets ?? {} },
    mt,
    output: result.variants.join('\n'),
    variants: result.variants,
    changed: result.changed.map(summarise),
    disputed: result.candidates
      .filter((c) => c.options[0]?.status === 'variant' || c.options[0]?.status === 'contested')
      .map(summarise),
    people: result.people,
    othersGuess: result.othersGuess ?? null,
    fellBack: result.fellBack,
  };
}

/** The post-editing half of main.ts run(). Keep it, review-rediff.ts and main.ts in step. */
function postEdit(k: Case, mt: string): PostEdit {
  const speaker = k.speaker ?? 'M';
  const choices = { source: k.en, targets: k.targets ?? {} };
  let result = applyGender(mt, speaker, k.addressee, choices);
  if (result.people.length >= GENERAL_ROW_LIMIT) {
    result = applyGender(mt, speaker, result.othersPresent ? k.addressee : undefined,
      { ...choices, namedFollowOthers: false });
  }
  return result;
}

async function checkFixture(): Promise<void> {
  const { pairs } = JSON.parse(readFileSync('test/fixtures/mt-en-ro.json', 'utf8')) as
    { pairs: Record<string, string> };
  let mismatches = 0;
  for (const [en, expected] of Object.entries(pairs)) {
    const [got] = await translate([en]);
    const ok = got === expected;
    if (!ok) mismatches++;
    console.log(`${ok ? 'ok  ' : 'DIFF'} ${en.padEnd(36)} ${got}${ok ? '' : `   (fixture: ${expected})`}`);
  }
  console.log(`${Object.keys(pairs).length - mismatches}/${Object.keys(pairs).length} match the fixture`);
  if (mismatches) process.exitCode = 1;
}

async function main(): Promise<void> {
  if (process.argv[2] === '--fixture') return checkFixture();
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('usage: review-run.ts <cases.json> <out.jsonl>');
  const cases = JSON.parse(readFileSync(input, 'utf8')) as Case[];
  mkdirSync(dirname(output), { recursive: true });
  const lines: string[] = [];
  for (const [i, k] of cases.entries()) {
    const [mt = ''] = await translate([k.en.trim()]);
    lines.push(JSON.stringify(record(k, mt, postEdit(k, mt))));
    if ((i + 1) % 25 === 0) console.log(`${i + 1}/${cases.length}`);
  }
  writeFileSync(output, lines.join('\n') + '\n', 'utf8');
  console.log(`${cases.length} cases -> ${output}`);
}

await main();
