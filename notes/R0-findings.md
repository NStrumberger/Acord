# R0 — Romanian feminine derivation: measured findings

**Question the spike had to answer:** how much of Romanian feminine occupation
formation is rule-derivable, and how much must be a curated table?

**Answer: derive nothing at runtime.** Rules reach 78% on attested data, but the
22% they miss fail in the worst possible way, and the single most common suffix is
the least predictable.

## Method (and one correction)

Source: [EnRoGend](https://huggingface.co/datasets/yona12345/EnRoGend), 1,974
English–Romanian pairs over 82 occupations, CC BY 4.0. The dataset repo's own
metadata says `cc-by-4.0`; the paper says CC BY-NC 4.0. Repo metadata is treated as
operative, but the lexicon stays isolated in case that has to be revisited.

Rows come in masculine/feminine pairs. Several Romanian tokens differ between a
pair (the occupation *and* every agreeing adjective), so the occupation cannot be
read off a single sentence. We diff each pair and take, per occupation, the most
frequent differing token.

**First attempt was wrong and had to be fixed.** Voting on raw surface forms split
one occupation across its case forms — `auditor` surfaced as genitive-dative
`auditorului/auditoarei`, and `surveyor` produced the spurious `topografe`. Manual
inspection against the corpus showed the true form is `topografă`. Fix: normalise
every candidate to a lemma (strip the enclitic definite article) *before* voting, so
case variants aggregate instead of competing. Only one entry (`sailor`) now rests on
fewer than four votes.

## Results

82 occupations, rules ordered most-specific-first:

| rule | fired | correct |
|---|---:|---:|
| `C → C+ă` (*student→studentă*) | 49 | 39 |
| `-or → -oare` | 19 | 12 |
| `-ător/-itor → -toare` | 8 | 7 |
| `o → oa + ă` (*geolog→geoloagă*) | 5 | 5 |
| `-eț → -eață` (*cântăreț→cântăreață*) | 1 | 1 |

**64 correct (78%), 18 irregular (22%).**

Two rules were discovered by inspecting failures, not assumed up front: the
`o → oa` vowel breaking (*astronom→astronoamă*, *geolog→geoloagă*) and the
`-eț → -eață` alternation. Both are exceptionless in this sample. Note the breaking
rule must **not** be generalised to `e`: *arhitect→arhitectă* does not break, and
*bancher→bancheră* does not either.

## The `-or` trap — the finding that decides the architecture

`-or` is the most common Romanian occupational suffix and splits at least five ways:

| | |
|---|---|
| `-or → -oare` | director → directoare, ambasador → ambasadoare |
| `-or → -oară` | **profesor → profesoară** |
| `-or → -iță` | doctor → doctoriță, pictor → pictoriță, sculptor → sculptoriță, sudor → sudoriță |
| `-or → -iță` + stem change | actor → actriță |
| `-or → -eză` | coafor → coafeză |

The rule fired 19 times and was **wrong 7 times — a 37% error rate on the commonest
suffix.** There is no formal property of the stem that predicts which branch applies.

Worse, every error is a *well-formed Romanian word that is simply the wrong one*:
`*profesoare`, `*doctoare`, `*actoare`. Nothing downstream can detect this — it does
not look like a failure, it looks like an answer. For a product whose entire claim is
correctness, confidently-wrong output is strictly worse than no output.

The `-ar` suffix splits the same way: *arhivar→arhivară* but
*brutar/bucătar/grădinar/marinar → -ăreasă*.

## Decision

1. **The app never derives a feminine at runtime.** `src/ro/lexicon.occupations.json`
   is the source of truth; an unknown lemma is a miss, not a guess.
2. **Rules survive only as a curation aid** — they pre-fill a candidate for a human
   to accept or correct. `ruleDerivable` is recorded per entry as informational.
3. **The 18 irregulars and 4 variant-spelling entries are the human review queue.**
   The `-log` family (*geolog → geologă / geoloagă*) is flagged `variant`: this is
   exactly the case DOOM3 admits two spellings for, so it needs a status call rather
   than a silent pick.

## Caveats

- 82 occupations is a **seed, not a lexicon**. It covers the EnRoGend domain only.
- All forms are singular. Plural paradigms are not yet extracted.
- `sailor` rests on 3 votes; verify before trusting.
- No native-speaker review yet. `reviewed: false` on every entry.
