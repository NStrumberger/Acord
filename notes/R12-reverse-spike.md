# R12 spike: a Romanian → English model for the reverse direction

Date: 2026-10-11. Script: `scripts/spike-ro-en.ts`. Output: `eval/runs/ro-en-spike.jsonl`.

## Which models exist
There is no `opus-mt-ro-en` in transformers.js (ONNX) form; `Xenova/opus-mt-ro-en`,
`Helsinki-NLP/opus-mt-ro-en` and `onnx-community/opus-mt-ro-en` all return 401 (absent).

| Model | Licence | q8 encoder + merged decoder | Notes |
|---|---|---|---|
| `Xenova/opus-mt-ROMANCE-en` | Apache-2.0 | 53 + 60 MB (cache 119 MB) | Marian, like en-ro; `ro` is one of its sources |
| `Xenova/m2m100_418M` | MIT | 288 + 344 MB | ~5x the download; too heavy for a phone |
| `Xenova/nllb-200-distilled-600M` | CC-BY-NC | larger still | excluded: non-commercial |

## Method
Acord's own post-edited Romanian from the R11 run (332 cases, `eval/runs/2026-10-11.jsonl`)
was translated back with `opus-mt-ROMANCE-en`, one sentence per call, as `mt.ts` does.
The English that went in is known, so the round trip can be compared to it.

- Load 7.6 s from cache (Node), about 0.1 s per case.
- Word overlap with the original English averaged 0.555. This number is crude and
  understates quality: contractions alone ("I am" → "I'm") cost overlap. It is only for
  comparing variants, not an accuracy figure.
- The original-English pronoun check (10 of 18 kept) is the wrong yardstick, because the
  Romanian was deliberately re-gendered. Read against the *Romanian*, the pronouns are
  mostly right ("Josh crede că e o cântăreață bună" → "Josh thinks she's a good singer").

## What fails
1. **Names are garbled or the sentence collapses.** "Maya e obosită" → "The K.I. is tired";
   "Maya este și prietena mea" → "The rink is my friend too"; "Maya i-a spus lui Josh că e
   obosită" → "- I'm sorry. - I'm sorry."; "Ioana e fericită" → "John is happy";
   "Andrei este profesor" → "I'll go to this teacher."
2. **Rare feminine occupation forms are mistranslated.** For example, "Sunt editoare" → "They're the senders",
   "Sunt actriță" → "I'm sore", "Sunt radioloagă" → "I'm a radio crew".
3. **A dropped subject is occasionally misread.** For example, "Predau." → "He taught."

## Two fixes tried
- **Name masking works.** Replacing each name with a common stand-in (Maria, Peter, …)
  before translation, then restoring it, fixed every name case tried:
  - "Maya i-a spus lui Josh că e obosită" → "Maria told Peter she was tired";
  - "Maya, care este colegul meu, este un inginer bun" → "Maria, who is my colleague, is a
    good engineer".

  The restore step must cope with "Maria's". The stand-in's own gender may sway the
  pronoun, which is one more reason for the pronoun fix.
- **Swapping feminine occupation forms to the masculine before translating is not a net
  win.** Of 149 changed cases, 23 got better and 14 got worse:
  - it turned "she's" into "he's";
  - "waitress" became "waiter";
  - "detectivă" became "lantern".

  Dropped.

## The large model, run on the same 332 cases
Run: `eval/runs/ro-en-spike-m2m100.jsonl`. Model: `Xenova/m2m100_418M`, q8, with `src_lang: 'ro', tgt_lang: 'en'`.

| | ROMANCE-en | m2m100_418M |
|---|---|---|
| Cache on disk | 119 MB | 640 MB |
| Load from cache (Node) | 7.6 s | 36.4 s |
| Per case | 0.11 s | 0.39 s |
| Mean word overlap | 0.555 | 0.836 |
| Better / worse, per case | | 230 better, 35 worse |

The overlap favours m2m100 a little, because it writes "I am" rather than "I'm". Read by
hand, though, the gap is real:
- **Names come through unmasked.** "Maya i-a spus lui Josh că e obosită" gives "Maya told
  Josh she was tired".
- **Most rare feminine occupation forms are right.** It handles actriță, astronoamă,
  editoare, radioloagă and geoloagă.
- **"Predau" is read correctly** as "I teach".

It still makes mistakes:
- "Maya și cu mine suntem obosite" gives "I and I are tired".
- "verișoara" gives "mother".
- "brutăreasă" gives "brutal".
- "Ioana a fost preot" gives "John was a priest".

**Not yet measured:** whether a phone browser can hold 640 MB. WebKit tabs have a tight
memory ceiling, and today's en-ro model would be loaded as well.

## How the big apps do it: small distilled models (Mozilla Bergamot)
Firefox's offline translation runs small "student" models, distilled from large teachers,
through a WebAssembly build of Marian. Each model covers one direction.
- **Model.** `mozilla/firefox-translations-models`, `models/tiny/roen` (MPL-2.0):
  - a 12.7 MB gz download, 17.1 MB unpacked, 16.9 M parameters;
  - an `enro` model exists too.
  - The repo is archived; newer models live on Mozilla's GCS registry
    (mozilla.github.io/translations/model-registry).
- **Mozilla's own COMET scores for ro-en** (`evaluation/comet-results.md`):

  | Test set | bergamot-tiny | Google | Microsoft | NLLB |
  |---|---|---|---|---|
  | flores-test | 87.75 | 89.54 | 89.66 | 81.34 |
  | wmt16 | 85.34 | 86.63 | 87.10 | 76.79 |

  These are Mozilla's figures, not re-measured here, and the opus-mt models were not
  scored on ro-en.
- **Runtime.** `@browsermt/bergamot-translator` 0.4.9 on npm: MPL-2.0, a WASM worker,
  5.3 MB unpacked, last published 2022. It still has to be shown to load the 2024 tiny
  model, since Firefox itself ships a newer engine. The Mozilla docs say it needs WASM
  SIMD; Safari has supported that since iOS 16.4.

## Bergamot, measured on our own cases (both directions)
**Setup.**
- The runtime is `@browsermt/bergamot-translator` 0.4.9, run by Playwright in Firefox
  (Chromium isn't installed here). It uses `LatencyOptimisedTranslator` with a local
  registry.
- The models are the spring-2024 `tiny` en-ro and ro-en. Their hashes match Mozilla's
  registry.
- The scratch harness has not been committed. It covers the page, the runner, the registry
  and the post-edit replay.

**Speed.** The model loads in about 0.25 s, then each case takes 4–5 ms. For comparison,
opus-mt takes 106 ms per case and m2m100 391 ms.

**ro→en, on the 332 R11 Romanian outputs.**
- **Overlap.** Mean word overlap with the original English (letters only):
  - ROMANCE-en 0.691;
  - m2m100 0.836;
  - Bergamot 0.835.
- **Bergamot vs m2m100.** Bergamot was better in 81 cases and worse in 81.
- **Names.** It keeps names ("Maya and I are tired"; m2m100 gave "I and I"), but it
  anglicises "Ioana" to "Joan".
- **Misses.** "radioloagă" → "radio", "geoloagă" → "geeorge", "Predau" → "I'm surrendering".

**en→ro, on the 332 R11 English cases, then Acord's post-editor with each case's settings.**
- **Overlap with today's pipeline.** The raw Romanian matched today's model in 108 of 332
  cases, and the final output in 86.
- **Blind review of the 246 cases whose final output differs:**
  - **Setup.** A and B were shuffled per case, and each half was judged by two Sonnet
    reviewers (`judge-1-y`, `judge-1-z`, `judge-2-x`, `judge-2-y`).
  - **Reviewers dropped.** The first half-1 reviewer was discarded: its file was truncated,
    and the counts it reported were those of `judge-2-y`, a file it was told not to open.
    `judge-1-z` gave a placeholder `why` for every case, but its verdicts agree with
    `judge-1-y` on 110 of 123 cases.
  - **Agreement.** Verdict agreement between the two reviewers of a half was 110/123
    (half 1) and 113/123 (half 2).

| Verdicts (246 cases × 2 reviewers) | ok | awkward | wrong |
|---|---|---|---|
| opus-mt (today) | 288 | 25 | 179 |
| Bergamot tiny | 208 | 232 | 52 |

  - **Preference.** Reviewers preferred opus 222 times, Bergamot 169 times, and called 101
    ties.
  - **Wrong for one system only, with both reviewers agreeing:**
    - opus only: 74 cases. Examples: "Sunt un al 17-lea" (plumber), "Ioana a fost preot"
      (minister), "Sunt librarian", "Ești asistent medicală".
    - Bergamot only: 13 cases. Examples: "anetist", "filog", "filist", "Ana este regie",
      "Iordania" (for Jordan), "Doamna. Smith".
  - **Why Bergamot reads as "awkward".** Of 149 such marks with a usable reason, 119 name a
    needless subject pronoun ("Eu sunt …") and 88 a needless article ("… un contabil").
    It is one mechanical pattern.

**Method flaw found on 2026-10-12. The comparison above is biased toward Bergamot.**
The opus-mt side used the stored R11 `output`, which was produced *before* the R11
post-editor fixes (8c0031d). The Bergamot side went through the current post-editor.
Re-running the current post-editor on the opus-mt `mt` changes 83 of the 246 judged cases.
The "wrong" counts and the 74-vs-13 split therefore overstate Bergamot's lead. The fair
re-run (A5) puts both systems through the same, current post-editor.

**Fair re-run (2026-10-12).**
- **Re-running today's output.** The current post-editor was applied to the stored opus-mt
  `mt` for the 83 affected cases:
  - 41 now match Bergamot's output exactly, and count as ties;
  - 42 were re-judged blind by two new Sonnet reviewers (`judge-3-p`, `judge-3-q`), who
    agree on 39 of 42 verdicts.
- **The other 163 cases** keep their earlier verdicts.

| Verdicts (205 differing cases × 2) | ok | awkward | wrong |
|---|---|---|---|
| opus-mt + current post-editor | 329 | 29 | 52 |
| Bergamot + current post-editor | 125 | 239 | 46 |

- **Preference:** opus 246, Bergamot 52, ties 194 (the 41 identical cases included as ties).
- **Wrong for one system only:** opus 16 cases, Bergamot 13.
- **Corrected reading.** For en→ro, Bergamot is roughly level with opus-mt on errors and
  much stiffer. Its case rests on size (14 MB against 113 MB), speed, and having one engine
  for both directions, and on whether the Romanian clean-up (A3) removes the stiffness.
  For ro→en it is still the clear choice.

**After the Romanian clean-up (`src/ro/tidy.ts`): the deciding review (2026-10-12).**
- **What was compared.**
  - The new side: Bergamot through the app's own `mt.ts` (`prepareEnglish`, dash removal,
    `normalizeRomanian`, `tidyRomanian`), then the current post-editor.
    Runs: `eval/runs/2026-10-12-bergamot-tidy-{a,b}.jsonl`.
  - The old side: opus-mt `mt` through the same current post-editor.
- **What was judged.** 206 of 332 final outputs are identical. The other 126 were judged
  blind by 4 Sonnet reviewers, two per half (scratch `fair-judge-*`).
- **Checks.** Every file parsed and covers all items, with per-item reasons. The two
  reviewers of a half agreed on 61/63 verdicts (half 1) and 53/63 (half 2).

| Verdicts (126 cases × 2) | ok | awkward | wrong |
|---|---|---|---|
| opus-mt + post-editor | 159 | 47 | 46 |
| Bergamot + tidy + post-editor | 173 | 34 | 45 |

- **Preference:** Bergamot 78, opus-mt 69, ties 105. Where both reviewers agree: Bergamot
  37, opus-mt 30.
- **Wrong for one system only:** opus-mt 15, Bergamot 13.
  - opus-mt: "Sunt un al 17-lea" (plumber), "un al XVII-lea" (sculptor), "un Zorost"
    (zoologist), "un sai" (sailor), "Ioana a fost preot" (minister), "Sunt librarian".
  - Bergamot: "anetist", "filog", "filist", "Ana este regie", and "Iordania" for the name
    Jordan.
  - Bergamot also has "Ei sunt barmani/muzicieni/vecinii noștri", where women were meant.
    It writes the masculine pronoun "Ei" for "they", and the post-editor treats an
    explicit pronoun as fixed.
  - Bergamot also wrote "Prof. Ionescu".
- **Verdict.** With the clean-up, Bergamot is at least level with opus-mt on English →
  Romanian (slightly ahead on every count), at 14 MB instead of 113 MB and about 20×
  faster. That meets the agreed rule ("switch if it matches or beats").
- **Fixable Bergamot errors**, to address before shipping:
  - "Ei" for an ungendered "they";
  - "Prof.";
  - names translated as words (Jordan → Iordania).

## Engine swap: what shipped, and what is still open (2026-10-12)
- **Shipped (uncommitted).**
  - `src/ro/mt.ts` runs Bergamot through a subclassed `TranslatorBacking`: a local
    registry, plus gzip download, sniffing and sha256 check.
  - `src/ro/tidy.ts`.
  - The models live under `public/models/<pair>/<release>/`.
  - The runtime is vendored to `public/bergamot/<version>/`, with its MPL text and a
    source link.
  - `sw.js` v3 serves `/bergamot/` and `/models/` cache-first.
  - The browser harness is `scripts/browser-mt.ts`.
- **Checks.**
  - 162 unit tests.
  - `check:people` passes.
  - A built app translates offline after one visit in Chromium and Firefox.
  - In WebKit, translation works and the service worker caches all seven engine files.
    The offline reload itself crashes Playwright's WebKit on Windows, so offline use on
    iOS is still to be confirmed on a real device.
- **Code review (Sonnet), every finding re-checked against the code. Fixed:**
  - a worker that fails to start no longer leaves `translate()` hanging (the translator
    now awaits `translator.worker`);
  - a download that sends nothing for 30 s is abandoned;
  - calls are queued, so a settings change during the first download can no longer
    cancel a translation and tear the engine down;
  - tidy keeps the article after "acesta/ce/cine …" ("Acesta este un medic");
  - a dash the user typed is kept;
  - the inner error cause is reported;
  - `sw.js` deletes only `acord-*` caches and the old opus-mt entries inside
    transformers.js's shared cache. Other sites on the same github.io origin may keep
    their own caches there.
- **Not fixed.** "Eu sunt profesoară, nu Maria" loses its contrastive "Eu". Contrast with
  a name isn't detected.
- **Known gaps:**
  - "Jordan" is translated as the country (1 of 332 cases). Name masking isn't worth it
    for this.
  - "I am ready" becomes "Sunt pregătită". "pregătit" is not in the word list, so a man
    gets the feminine. opus-mt happened to say "gata". The model now sometimes guesses
    feminine, so adjectives outside the word list can be wrong for men where before they
    were wrong for women. The bigger attested adjective list (Part B) should feed the
    post-editor too, not only detection.
  - Rare job titles still come out garbled ("anetist", "filog").

**Reading (superseded, from the flawed comparison).**
- Bergamot makes about a third as many real errors as opus-mt.
- Its weakness is a stiff style, which the reviewers penalised even when everything was
  correct. That style is regular enough for a deterministic Romanian clean-up to remove,
  which is the kind of editing Acord already does.
- Bergamot also already guesses gender on its own (e.g. "Sunt obosită"), and Acord's
  corrections still apply on top.

**Browsers.** Playwright WebKit and Chromium were run on Windows, 332 cases in each
direction. Their output is byte-identical to Firefox's.

| Browser | Per case | First call, including model load |
|---|---|---|
| Firefox | 4–5 ms | about 0.25 s |
| Chromium | 6 ms | 0.25 s |
| WebKit | 47 ms | 0.5–0.6 s |

Playwright's WebKit is not iOS Safari, so a check on a real iPhone remains.

**Decision (Nils, 2026-10-12).** Use the Bergamot models in both directions.

## Recommendation (before the m2m100 run)
Use `Xenova/opus-mt-ROMANCE-en` with name masking. Rare feminine occupation forms remain a
known weakness. The detection panel still reports the right gender for them, because
detection reads the Romanian, not the English.

The masking step finds the names in the Romanian. That list can replace the English-based
name check (`namesIn`) in detection, so detection no longer depends on the English for
names.
