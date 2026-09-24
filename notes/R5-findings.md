# R5 — User interface

`index.html`, `src/ui/`, `src/ro/mt.ts`. Built with Vite; 59 kB JS
(10.5 kB gzipped) including the entire lexicon.

## Design direction

Chosen before any markup, because the default would have been a generic
SaaS-looking page.

- **Purpose** — a tool used repeatedly by someone writing Romanian, not a demo.
- **Tone** — editorial reference apparatus. Warm paper, ink, hairline rules. No
  gradients, no blobs, no cards inside cards, no oversized hero.
- **Typography** — system sans for chrome, a serif for the Romanian output. The
  output is the thing being produced, so it gets the reading face and the size.
- **Palette** — paper/ink plus exactly two functional accents: deep teal for
  "you can change this", rust for "this is disputed". Nothing decorative.

## The christmas-tree problem

The hard part was showing which words carry gender without turning every
sentence into highlighter soup. A translated sentence is mostly ordinary words;
marking three of them loudly destroys it as prose.

The answer: gendered words stay **inline prose** with a **1px dotted underline**
— the way a dictionary marks a cross-reference you can follow. Disputed forms
get a **wavy underline** instead, which is the signal every spellchecker already
uses for "check this one". Two marks, both quiet, both meaning something
different. No background fills except transiently on hover, focus, and for half
a second after a word changes.

Each gendered word is a real `<button>`, so it is keyboard-reachable and
announces what it will switch to. The profile is a `radiogroup`. Motion is one
half-second fade on change, disabled under `prefers-reduced-motion`.

## The engine had to become browser-safe

`lexicon.ts` read its JSON with `node:fs`, which does not exist in a browser. It
now uses `import … with { type: 'json' }`, which works unchanged in Node and
under a bundler. Vite was added as a dev dependency because browsers cannot load
`.ts` — the **runtime** dependency count is still zero.

## An honest compromise in the MT path

R3 established that overrides must **re-realize** from the IR, because gender
can change word order (`L-am văzut` / `Am văzut-o`). The UI's MT path cannot do
that: there is no IR, the machine-translated string *is* the source.

Clicking a word there is therefore a token substitution. That is acceptable only
because the form index contains nouns and adjectives and **not clitics** — so
the app never offers a flip it cannot perform correctly. Word order is fixed by
the model and left alone. If clitic flipping is ever wanted, it needs the IR
path, not a bigger index.

## Verified

End-to-end through the real service:

    EN  I am tired and my friend is a teacher.
    MT  Sunt obosit și prietenul meu e profesor.
      M   Sunt obosit  și prietenul meu e profesor.   (0 of 3 changed)
      F   Sunt obosită și prietenul meu e profesor.   (1 of 3 changed)

    I am a geologist. -> geolog  [variant]
    I am an engineer. -> inginer [contested]

Three gendered words are recognised in the first sentence; only the speaker's
own is rewritten.

## Identity and grammar are separate controls

The first cut offered three radio buttons (a woman / a man / unspecified), which
is a fixed list standing in for how someone describes themselves. Replaced with
two controls that answer two genuinely different questions:

    I am   [ free text ]

    Romanian forms for me   ( ) feminine  ( ) masculine  (•) show both

This matters because **Romanian has only two agreement classes**. No identity
label can produce a third set of word forms, and the invented ones
(`prieten@`, `obosit*ă`) are non-normative — they read as broken software. So
the app does not pretend: `show both` prints `obosit/obosită`, masculine first
for consistency, and respects exactly the same first-person scope as a gendered
profile:

    MT      Sunt fericită și prietenul meu e obosit.
    both    Sunt fericit/fericită și prietenul meu e obosit.

The friend is still untouched.

The free-text field is not decorative, which would be worse than having no
field: it is persisted to `localStorage`, and it pre-selects the grammatical
choice for terms that map confidently (English, German and Romanian spellings of
woman/man/non-binary). It stops suggesting the moment the user picks a form
themselves, so it never overrides a deliberate choice. Storage access is
wrapped — the app works with it blocked.

## Six labels, three behaviours - a control that lied

The identity list offered *non-binary*, *agender*, *genderfluid* and *prefer not
to say* as separate options. All four mapped to `both`, so all four produced
identical output. The list implied a distinction the software did not make.

Replaced with four options that genuinely differ:

| option | "I am a teacher" |
|---|---|
| masculine | Sunt profesor. |
| feminine | Sunt profesoară. |
| both forms | Sunt profesor/profesoară. |
| avoid gender | **Predau.** |

**Avoiding gender is a clause-level rewrite, not a word swap.** A Romanian
present-tense verb carries no gender at all, so `Sunt profesor` becomes
`Predau` -- the choice is sidestepped rather than doubled. That required the
post-editor to work on spans rather than tokens: the copula and its whole
predicate are replaced together.

It only works where the lexicon has a paraphrase (11 occupations) and not for
adjectives, since `Sunt obosit` has no gender-free equivalent that keeps the
meaning. When no paraphrase exists it degrades to both forms and **says so** in
the status line rather than silently doing nothing.

Verb paraphrase now also outranks the epicene noun: `predau` beats `cadru
didactic`, because the epicene noun is still lexically neuter and any adjective
in the clause would have to agree with it, whereas the verb has no agreement at
all. Second-person forms (`predai`) were added so the option works for the
person being addressed too, not only the speaker.

## A build script that read its own output

`build_lexicon.py` took its input from `src/ro/lexicon.occupations.json` -- the
file it writes. The hand-curated `EXTRA` entries were therefore appended again
on every run (85 entries became 88). It now reads `data/raw/occupation_pairs.json`,
the actual source, and running it twice is a no-op.

## Not verified

**No visual check was performed.** Browser automation is unavailable in this
session, so contrast, text fit, responsive behaviour at ~400px and the actual
feel of the two underline marks have not been seen by anyone yet. That is the
first thing to look at.
