# Data licence

The code in this repository is MIT (see `LICENSE`). The **lexicon is not**, and
cannot be, because it is derived from ShareAlike sources.

## `src/ro/lexicon.occupations.json` — CC BY-SA 4.0

This file is a derived database built from two sources:

| Source | Licence | Used for |
|---|---|---|
| [EnRoGend](https://huggingface.co/datasets/yona12345/EnRoGend) | CC BY 4.0 | English–Romanian occupation pairs |
| [kaikki.org](https://kaikki.org/) Wiktionary extracts | CC BY-SA 4.0 | noun paradigms, feminine equivalents |

kaikki's ShareAlike term attaches to the result, so the lexicon is distributed
under **CC BY-SA 4.0**. Anyone redistributing it, modified or not, must keep the
attribution and license their version the same way.

This is why the app carries visible attribution in its footer: under CC BY that
is an obligation, not a courtesy.

## `src/ro/adjectives.json`, `src/ro/detect.names.json` — CC BY-SA 4.0

Adjective forms and given names extracted from [kaikki.org](https://kaikki.org/)'s
Wiktionary extracts by `scripts/extract_kaikki_detect.py`, used to set gender in
Romanian and to read it back out. Derived from a ShareAlike source, so distributed under **CC BY-SA 4.0**, same
as the lexicon.

## Other components

- **Translation models and engine** — Mozilla's [Firefox Translations models](https://github.com/mozilla/firefox-translations-models)
  (en-ro, ro-en) and the [Bergamot translator](https://github.com/browsermt/bergamot-translator),
  MPL 2.0. Redistributed here unmodified: the models under `public/models/` with the
  licence text beside them, the engine copied into `public/bergamot/<version>/` at build
  time with its licence and a link to its source.
- **Inter** — SIL Open Font License 1.1, bundled via `@fontsource-variable/inter`.
- Hand-written vocabulary in `src/ro/words.ts` and the curated `EXTRA` entries in
  `scripts/build_lexicon.py` are original work and MIT, though they ship inside
  the CC BY-SA lexicon file.

## Not reviewed by a lawyer

This reflects a careful reading of the source licences, nothing more. If this is
ever used commercially, get it checked — particularly the ShareAlike reach over
the combined lexicon file.
