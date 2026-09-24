/**
 * Validate the enclitic-article rules against attested corpus forms.
 *
 * buildParadigm's singular definite needs only the lemma, so it can be checked
 * directly against every form EnRoGend actually contains. This measures the
 * engine against 1,974 real sentences rather than against our assumptions.
 */
import { readFileSync } from 'node:fs';
import { buildParadigm } from '../src/ro/noun.ts';

const url = (p: string) => new URL(p, import.meta.url);
const lexicon = JSON.parse(readFileSync(url('../src/ro/lexicon.occupations.json'), 'utf8'));
const attested: Record<string, { m: string[]; f: string[] }> =
  JSON.parse(readFileSync(url('../data/raw/attested_forms.json'), 'utf8'));

let hit = 0, miss = 0, absent = 0;
const failures: string[] = [];

for (const e of lexicon.entries as { en: string; m: string; f: string }[]) {
  const seen = attested[e.en];
  if (!seen) continue;
  for (const [gender, lemma, forms] of [
    ['m', e.m, seen.m], ['f', e.f, seen.f],
  ] as const) {
    // plural is unknown here; singular definite does not depend on it
    const predicted = buildParadigm(lemma, gender, lemma).forms['sg.na.def'];
    const pool = new Set(forms);
    if (pool.has(predicted)) hit++;
    else if (![...pool].some((w) => w.startsWith(lemma.slice(0, -1)))) absent++;
    else { miss++; failures.push(`${e.en} [${gender}] ${lemma} -> predicted ${predicted}`); }
  }
}

const checked = hit + miss;
console.log(`checked ${checked} definite singulars against the corpus`);
console.log(`  matched an attested form : ${hit} (${Math.round((100 * hit) / checked)}%)`);
console.log(`  mismatched               : ${miss}`);
console.log(`  no comparable form in corpus: ${absent}`);
if (failures.length) console.log('\n' + failures.join('\n'));
