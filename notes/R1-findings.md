# R1 — Romanian agreement core

Modules: `src/core/types.ts`, `src/ro/gender.ts`, `src/ro/adjective.ts`,
`src/ro/noun.ts`. 22 tests, zero dependencies, no build step.

## The neuter chokepoint works — and it pays for itself twice

`resolveAgreement(gender, number)` is the single place Romanian neuter is
resolved (`n` + sg → `M`, `n` + pl → `F`). Inflection functions accept only
`Agreement` (`'M' | 'F'`), never `LexicalGender`, so neuter is *physically
unpassable* to an agreement site.

The design paid off in an unplanned way: the **enclitic definite article obeys
the same split**. A neuter noun takes the masculine article in the singular and
the feminine one in the plural — *scaun → scaunul*, but *scaune → scaunele*. So
`definiteSingular` and `definitePlural` branch on the same resolved `Agreement`
that adjectives use. One function, two consumers, no duplicated neuter logic.

## Article rules validate at 100% against the corpus

`npm run data:validate` checks every generated definite singular against the
surface forms EnRoGend actually contains:

    checked 164 definite singulars against the corpus
      matched an attested form : 164 (100%)
      mismatched               : 0

**This is the finding that draws the rules-vs-table line.** Compare with R0:

| subsystem | rule accuracy | decision |
|---|---:|---|
| enclitic definite article | **100%** (164/164) | derive it |
| feminine occupation derivation | 78% (64/82) | curate it |

Romanian inflection is regular; Romanian *word formation* is not. The engine
may generate forms of a known word, but must never invent the word itself.

Caveat on the method: the check confirms each predicted form **occurs** in the
corpus, not that it is contextually correct in every sentence. Given how
distinctive these strings are, coincidental matches are implausible, but this is
evidence rather than proof.

## Rules encoded

- **Definite singular** — M: `-u → +l`, `-e → +le`, else `+ul`.
  F: `-ă → -a`, `-ie → -ia`, `-e → -ea`, `-a → +ua`.
- **Feminine gen-dat is built on the plural stem**, not the singular:
  *fete → fetei*, *cărți → cărții*, *profesoare → profesoarei*. The corpus forms
  `auditoarei` and `topografei` pin this in a test.
- **Feminine singular gen-dat adjectives take the feminine plural form** —
  *unei fete bune*, never *\*unei fete bună*.
- **Definite plural** — M `+i`, F `+le`; gen-dat plural is `+lor` for both.

## Not yet done

- Plural formation is **not** derived. `buildParadigm` takes the plural as an
  argument, because Romanian plural stem alternations (*fată→fete*,
  *carte→cărți*) are only ~70% predictable — the same trap as R0.
- No vocative, no clitics, no possessive article `al/a/ai/ale`. Those belong to
  R3 linearization.
