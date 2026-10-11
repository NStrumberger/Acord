# R11 — A model screened the output. This is not a native-speaker review

## What this is, and what it is not

Every lexicon entry is still `reviewed: false`. This round was a **pre-screen**:
model agents wrote English test sentences, those ran through the real pipeline,
and other model agents judged the Romanian. It finds *candidates* for a native
speaker to confirm. It does not replace one, and it never sets `reviewed`. A
test (`test/ro-lexicon.test.ts`) enforces that.

Each lexicon entry now carries `modelReview: {date, result, ref: "R11"}`,
separate from `reviewed`. `scripts/build_lexicon.py` carries it over on a
rebuild.

## Method

```
generators (2)  ->  eval/cases-{a,b}.json     332 cases
review-run.ts   ->  eval/runs/2026-10-11.jsonl  model + applyGender, as main.ts run() does
checkers   (4)  ->  eval/sentence-review-*.json  every case judged twice, independently
review-merge.ts ->  eval/merged-review.json     agreement, quoted-token check
lexicon    (2)  ->  eval/lexicon-review-{1,2}.json  85 entries, cell by cell
auditor    (1)  ->  eval/findings.json          re-derived, clustered, ranked
```

- **Case sets.** A (210) covers every lexicon entry, adjective and noun. B (122)
  aims at the traps in `analyze`.
- **Harness check.** `review-run.ts --fixture` reproduces all 14 pairs in
  `test/fixtures/mt-en-ro.json`, so the harness runs the same model the app does.
- **Second derivation.** The auditor re-ran `applyGender` on every record's
  `mt` and got 332/332 byte for byte. Every post-editor finding has a minimal
  repro that a script re-runs and that fails if the bug does not reproduce.
- **Agreement.** The two sentence checkers agree on 323/332 cases. That is
  agreement between two models, not proof of correctness. No checker quoted a
  token that is not in the output.
- **dexonline.** The lexicon checkers fetched about 100 pages from dexonline.ro
  before it came up that dexonline's terms forbid automated scraping without
  written consent. The auditor fetched nothing and worked from the cached pages.
  Do not automate dexonline again without permission.

## Numbers

| | |
|---|---|
| Cases | 332 (235 judged ok by both checkers, 88 flagged by both, 9 split) |
| Post-editor bugs | 18 root causes, all reproduced (6 high, 9 medium, 3 low) |
| Lexicon issues | 46 (34 confirmed, 10 unconfirmed, 2 rejected) |
| Lexicon entries | 51 `ok`, 25 `flagged`, 9 `unconfirmed` |
| MT-only failures | 25 cases in 6 groups. Acord cannot fix these. |
| Coverage gaps | 19 candidate additions |

The post-editor accounts for most of what goes wrong; the lexicon comes second.
Several bugs break promises the README makes.

## Ranked improvements

Case ids refer to `eval/findings.json`. Locations are in `src/ro/postedit.ts`.

1. **P5: articles and adjectives flip although their noun cannot.** For example,
   `Ești un om bun.` with a female addressee gives `Ești o om bună.`, and the
   same bug produces `o a 17-lea` and `o Zorost`. This is half-correcting, which
   HANDOFF calls worse than not correcting. Flip a dependent only when its head
   noun flips (L62, L412–432). Cases: A153 A125 A156 A157 A011 A122 A150 A184–A186 A017.
2. **P1: explicit *he*/*she* and kinship subjects are overwritten.** "He is my
   best friend" becomes `E cea mai bună prietenă a mea`. The README promises
   that an explicit he/she *is evidence and is kept*. `analyze` and `targetFor`
   never consult `source` (L185, L363). Cases: B001 B002 B008 B059 B079 B088 B090.
3. **P4: a possessive that agrees with another noun gets flipped**, giving
   `familia meu` and `echipa nostru`. The span runs to the end of the clause
   (L219). Cases: B096–B098 B009 B079.
4. **P2: third-person plural `sunt` is read as "I am"**, giving `Părinții mei
   sunt obosite` (L196–201). Cases: B030 B031 A027 A100 B066.
5. **P6: `asistent medicală`.** The noun flips but its adjective is unknown, so
   *asistent(ă) medical(ă)* should be stored as one unit. Cases: A101 A103 B004 B036 B110.
6. **P7: only the first coordinated item is rewritten**, giving `obosită și
   fericit` (L129–132, L212–220). Cases: B025 B027 B091–B093 A210 B104 B121.
7. **Lexicon corruption.**
   - botanist: the masculine definite cells hold `botanista` and `botanistaui`.
   - lawyer: they hold `ul` and `ului`.
   - Missing paradigms leave `auditorul`, `procurorul` and `ministrul` unrewritable
     (P11, L49).
8. **F1: masculine `inginer` carries the feminine's `contested` flag.** HANDOFF
   says masculine is always `normative`. `addPair()` copies the status to both
   readings (L29–41); `lexicon.realize()` already gets it right.
9. **P8: the avoid-gender paraphrase drops the rest of the predicate**, as in
   `Predai.` for "a good teacher". When modifiers would be lost, fall back to
   both forms (L393–410). Cases: A171 B102 B105 B106 A068 B104.
10. **Group and subject agreement.**
    - P10: all-female named groups stay masculine.
    - P3: a mixed "we" follows the speaker alone.
    - P9: the subject before a copula is never rewritten (`Vecinul meu e grădinăreasă`).
11. **Lexicon forms and status** (confirmed from cached DOOM3 pages):
    - porter: should be `portăreasă`.
    - radiologist, psychologist, zoologist: the `-ogă` form is the headword, and
      radiologist needs the `variant` flag (A144, A145).
    - physician: DOOM3 has no noun `medică`.
    - Not attested: sailor `marinăreasă`, lecturer `lectoare`, banker `bancheră`.
    - veterinarian: `veterinară` is only an adjective in DOOM3.
    - producer: `pluralF` is missing.
12. **Word sense.** director is mapped to `regizor`, the film-and-theatre sense,
    and editor to `editor`, which is closer to "publisher".
13. **P17 (UI).** Once two people are named, unnamed third parties have no
    control (`main.ts` L400–406). This was known from HANDOFF §7.
14. **Low priority.** `de-al` is not re-agreed; `ca` + occupation only works
    after a name; `mi-a fost`; a name at a sentence end blocks the next `Sunt`;
    the `pe care-l` clitic.

## Coverage gaps (candidates to add, per R0: curated, never derived)

- **Nouns:** director/directoare (the manager sense), sportiv/sportivă,
  bucătar-șef, fizioterapeut, recepționist, șef/șefă, student/studentă.
- **Adjectives:** trist, ocupat, căsătorit, mândru, singur.
- **Kinship words that fix a gender** (soră, soție, frate, soț). These would
  give P1 something to check against.
- **Never flip:** `om de știință` and `ofițer` are used for women as they are.

## Fixes applied (same day)

Each fix has a failing test first in `test/ro-r11.test.ts`; the suite went
from 120 to 147 tests, all passing. A code review of the fixes found a
`care` clause not following its antecedent's person, a coordination cut short
by `al familiei`, `Fratele meu și cu mine suntem` following the speaker alone,
and prototype keys ("constructor") read as grammar; all four are fixed and
tested. Applying `lexicon-corrections.json` to the previous lexicon in Node,
with the same rules as `build_lexicon.py`, reproduces the new file exactly. `scripts/review-rediff.ts` re-runs the
post-editor on every recorded translation of the 332 cases and lists what
changed. Of the 97 cases the reviewers flagged:

| Outcome | Cases |
|---|---|
| **Fixed**: output now matches a reviewer's corrected sentence | 58 |
| **Changed by design**: <ul><li>11 untranslated or garbage words are now left alone rather than half-corrected</li><li>7 "avoid" requests now show both forms rather than drop words</li><li>2 differ from the reviewer only in model word choice or doublet format</li></ul> | 20 |
| **Unchanged**: <ul><li>10 MT errors</li><li>4 words still uncovered (unconfirmed)</li><li>2 coreference across sentences</li><li>3 ruled correct by the auditor</li></ul> | 19 |

Only 7 cases both reviewers had passed changed:
- **6 are deliberate lexicon corrections:** `lectoră`, and `psihologă`/`radiologă`
  as the DOOM3 headword.
- **1 is a wife now setting `doctoriță`.**

The first rediff also caught two regressions of mine, both fixed and tested:
- A sister as subject froze the model's masculine instead of making it feminine.
- A "și" before `eu` pulled the previous clause into the subject.

What changed, by finding:

- **P5, P4, P6, P18: dependents follow their own noun.** `headOf` in `edit()`
  finds the noun each article, possessive or adjective belongs to; if that noun
  cannot change (unknown, epicene, kinship, ordinal), neither do they.
- **P1: the subject before the copula is read.**
  - An explicit he or she in the English sets a dropped subject's gender
    (both in one input: left alone).
  - A kinship noun (`KINSHIP` in `words.ts`) sets it too.
  - A pronoun or unknown noun subject leaves the clause as translated.
- **P9:** an ordinary noun subject joins the span and changes with it.
- **P2:** a noun or pronoun before `sunt` makes it "they are". A dropped subject
  is resolved against "I am" / "they are" in the English, in order.
- **P3, P10:** groups (`Tu și cu mine`, `Maya și Ana`) agree jointly. A group is
  feminine only if everyone in it is; anyone unset leaves it as translated.
- **P7:** "și" and commas continue the predicate unless what follows contains a
  new subject or verb.
- **P8:** the paraphrase is used only for a bare `[un/o] noun`; otherwise both
  forms.
- **P11–P16:** missing paradigms filled; `de-al`/`de-a`; "lucrez ca";
  `mi-a fost`; sentence ends stop the subject search; `care-l` → `care o`.
- **P17 (UI):** from two names on, *Anyone else* stays visible while the
  sentence has someone unnamed, and covers only them (`namedFollowOthers:
  false`). Checked in Firefox at phone width; `check:people` passes.
- **F1:** the masculine of a pair always reads `normative`.
- **Lexicon:** the confirmed corrections live in `scripts/lexicon-corrections.json`.
  - `build_lexicon.py` applies them after merging sources, so a rebuild keeps them.
  - `normative` now also means "DOOM3 lists it", recorded as a `DOOM3` source.
  - chef and driver lost their verb paraphrase: *Gătesc* is "I cook", and
    *Conduc* is also "I lead".
  - `director` is now the manager sense (`directoare`); the film sense is
    `film director`.
- **New words:** trist, ocupat, căsătorit, mândru, singur, medical, sportiv,
  student, șef.

Not changed: the `unconfirmed` items below, because applying them would mean
guessing forms. The `build_lexicon.py` change could not be run here (no
Python); it was read, not executed.

## What a native speaker should look at first

Everything marked `unconfirmed` in `eval/findings.json`, because the cached
pages could not settle it: designeră, detectivă, coafeză, judecătoare,
barmaniță, astronomă vs astronoamă, the order of geologă and geoloagă,
tâmplăriță, arhivară. After that, the 25 `flagged` entries.
