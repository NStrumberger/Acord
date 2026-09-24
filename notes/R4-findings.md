# R4 — Machine-translation fallback and gender post-editor

`src/ro/postedit.ts`, `scripts/translate.py`, `scripts/mt_server.py`.
62 tests passing. Engine still has zero runtime dependencies; MT lives in a
gitignored project venv.

## The dependency trap

`pip install argostranslate` pulls `stanza` → **torch 2.14 (124 MB wheel)** plus
spacy, thinc and a pydantic upgrade — roughly 2 GB installed, all of it for
sentence splitting. The install also failed outright on a Windows file lock over
a shared `Scripts/*.exe`, and it was targeting the **global** Python.

An `.argosmodel` is just a zip: a CTranslate2 model, a SentencePiece tokenizer,
and a `stanza/` folder used only for sentence boundaries. So we load
`ctranslate2` + `sentencepiece` directly and split sentences ourselves:

| | download | installed |
|---|---:|---:|
| `argostranslate` | ~400 MB | ~2 GB |
| ctranslate2 + sentencepiece + model | ~90 MB | ~250 MB |

Cost: about 30 lines of glue. Everything lives in `.venv/`, so nothing touches
the global interpreter.

## Machine translation picks gender arbitrarily

The measured behaviour, from the committed fixture:

    I am tired.      ->  Sunt obosită.     (feminine)
    I am happy.      ->  Sunt fericit.     (masculine)
    I am a teacher.  ->  Sunt profesor.    (masculine)

Identical English pattern, same implied speaker, opposite genders out. The model
is not defaulting to masculine — it is guessing per sentence. That is precisely
what the post-editor normalises, and it is a sharper demonstration of the
product's value than the "always masculine" story the plan assumed.

The model does get clitic word order right in both directions
(`Am văzut-o` / `L-am văzut`), so post-editing must be careful not to disturb it.

## Two encoding traps that would have failed silently

1. **Cedilla vs comma-below.** The model emits legacy `ş` (U+015F) and `ţ`
   (U+0163); correct Romanian and our whole lexicon use `ș` (U+0219) and `ț`
   (U+021B). Unnormalised, every index lookup on a word containing those letters
   silently misses — no error, just no gender correction. Normalised at the
   translation boundary.
2. **SentencePiece markers.** Both `decode` and `decode_pieces` left the U+2581
   space marker in output for this model. Pieces are now joined manually.

Neither would have raised an exception. Both would have quietly degraded
correctness.

## Avoiding coreference rather than solving it

The plan flagged this as the research-grade risk: correcting gender on arbitrary
MT output needs to know **which referent each gendered word belongs to**.

We do not attempt it. Instead:

1. A **reverse form index** is built from paradigms we already have — every
   known gendered form mapped to its counterpart in the *same paradigm cell*
   (`profesorul` ↔ `profesoara`, not `profesorul` ↔ `profesoară`). Invariable
   forms (`mare`, `gata`) are excluded so they are never offered as flippable.
2. **Auto-apply only where the agreement target is unambiguous**: a predicate
   directly after a first-person copula (`sunt`, `eram`, `am fost`), with no
   third-person subject in front of it.
3. **Report everything else** as a candidate for the user to decide about.

The test that matters:

    MT:   Sunt fericită și prietenul meu e obosit.
    -> M: Sunt fericit  și prietenul meu e obosit.

The speaker is normalised; the friend is untouched. Guessing here would rewrite
a sentence about someone else, which is worse than leaving it alone. Rewritten
words also carry their lexicon `status`, so a machine-translated `geoloagă` is
flagged `variant` exactly as the frame path would flag it.

## The browser cannot spawn Python

Consequence for the architecture: the MT path needs an HTTP hop. `mt_server.py`
is stdlib `http.server` — no Flask, no FastAPI — bound to loopback, with a body
size cap and input validation. CORS is restricted to local origins rather than
`*`, since a wildcard would let any site you happen to visit drive the service.

## Limits

- Auto-apply scope is **narrow by design**: first-person predicates only.
  "My friend is a teacher" is left entirely alone, correctly but unhelpfully.
- The index only knows curated vocabulary. Unknown gendered words in MT output
  are invisible — not wrong, just unhandled.
- Argos en→ro quality is inherited wholesale. We fix gender, nothing else.
- No integration test against the live service; tests run off a committed
  fixture so they need neither the venv nor the 68 MB model.
