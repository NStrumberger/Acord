/**
 * Translate every Romanian output of the round-trip check back into English
 * with the real engine, so scripts/review-roundtrip.ts sees what the app sees
 * ("Ioana" may come back as "Joan").
 *
 *   node scripts/roundtrip-english.ts <english.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { applyGender, type Target } from '../src/ro/postedit.ts';
import { openTranslator } from './browser-mt.ts';

type Run = { en: string; mt: string; settings: { speaker: Target; addressee: Target | null; targets: Record<string, Target> } };
const RUNS = ['eval/runs/2026-10-12-bergamot-tidy-a.jsonl', 'eval/runs/2026-10-12-bergamot-tidy-b.jsonl'];

const romanian = new Set<string>();
for (const file of RUNS) {
  for (const r of readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Run)) {
    const { speaker, addressee, targets } = r.settings;
    const choices = { source: r.en, targets };
    let res = applyGender(r.mt, speaker, addressee ?? undefined, choices);
    if (res.people.length >= 2) {
      res = applyGender(r.mt, speaker, res.othersPresent ? addressee ?? undefined : undefined,
        { ...choices, namedFollowOthers: false });
    }
    romanian.add(res.variants[0]!);
  }
}

const mt = await openTranslator();
try {
  const lines = [...romanian];
  const english = await mt.translate(lines, 'ro-en');
  writeFileSync(process.argv[2] ?? 'roundtrip-english.json',
    JSON.stringify(Object.fromEntries(lines.map((ro, i) => [ro, english[i]])), null, 1));
  console.log(`translated ${lines.length}`);
} finally {
  await mt.close();
}
