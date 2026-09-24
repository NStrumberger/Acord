# R2 — Lexicon curation

85 curated entries in `src/ro/lexicon.occupations.json`, built from two
independent sources by `npm run data:build`. API in `src/ro/lexicon.ts`.
32 tests passing.

| status | count | meaning |
|---|---:|---|
| `normative` | 48 | EnRoGend and kaikki independently agree |
| `attested` | 29 | only one source has it |
| `variant` | 5 | sources differ; both forms current |
| `contested` | 3 | documented dispute in usage |

## Cross-validating two sources was the highest-value step

EnRoGend (a human-built parallel corpus) and kaikki.org (Wiktionary extracts)
were compared independently. Of 54 occupations where both record a feminine,
**49 agree and 5 disagree** — and the disagreements are not scattered:

| | EnRoGend | kaikki |
|---|---|---|
| astronomer | astronoamă | astronomă |
| geologist | geoloagă | geologă |
| psychologist | psiholoagă | psihologă |
| zoologist | zooloagă | zoologă |

**Every systematic disagreement is the `o → oa` breaking** — precisely the
alternation DOOM3 (2021) admits two spellings for, and the same one that
produces *filologă / filoloagă*. Two sources built by different people, from
different data, disagree in exactly one place, and it is the place the
Romanian Academy itself records as unsettled. That independently confirms the
`variant` flag R0 assigned on formal grounds alone.

The cross-check also caught a **source defect**: kaikki gives `arhivarka` as the
feminine of *arhivar*. That is not a Romanian formation (the `-ka` suffix is
Slavic), so kaikki is disregarded for that entry and the conflict is recorded in
the entry's note.

## Corpora record forms; they cannot record disagreement

`inginer → ingineră` is attested by **both** sources and so scored `normative` —
but in real usage *doamna inginer* remains widespread and the feminine is
contested. No amount of corpus evidence surfaces this, because a corpus records
what was written, not what is argued about.

So `contested` is a **hand-curated overlay**, each entry carrying its reasoning,
and it is the one part of the lexicon that cannot be generated. Currently three
entries (`engineer`, `physician`, `minister`); certainly incomplete.

One usable signal did emerge: **kaikki has no feminine at all for *ministru*,
*soldat* or *primar***. Absence from Wiktionary is weak evidence that a form is
not settled — worth mining systematically later.

## Plurals are now attested rather than derived

EnRoGend turned out to be **entirely singular** — zero plural evidence in 1,974
sentences. Plurals now come from kaikki's tagged paradigms (155 MB nouns-only
extract, gitignored), giving complete 8-cell paradigms for 82 masculine and 69
feminine lemmas. kaikki's cells independently reproduce every form
`buildParadigm` generates for *profesor*, which is a second confirmation of R1's
100% article-rule result.

## Neutral output

11 entries have a real neutral strategy: `cadru didactic` for *teacher*
(epicene, neuter), and 10 verb paraphrases (*predau*, *pictez*, *gătesc*…),
which carry no gender because the Romanian 1sg present does not agree.

Everything else falls back to a **doublet** (`avocat/avocată`) with an explicit
note that Romanian has no neutral form there. A test asserts no output ever
contains `@` or `*`, so invented non-forms like *prieten@* cannot ship.

## Limits

- **Nothing is speaker-reviewed.** Every entry is `reviewed: false`.
- 16 entries have no feminine paradigm (kaikki lacks the entry) — plural and
  gen-dat forms for those are unavailable, not guessed.
- The `contested` overlay is 3 entries curated from secondary literature.
- 85 occupations is still a seed. Coverage is the R3 problem.
