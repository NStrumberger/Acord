# R8 — A control per person named in the sentence

Until now the post-editor knew three roles: the speaker, the addressee, and
*everyone else lumped together*. "Josh is my friend and Maya is also my friend"
therefore had one dial for both of them, which is useless precisely when a
sentence names more than one person.

This adds a row per named person. The general **Anyone else** row still governs
anybody without their own row, and a person's own row overrides it.

## What made it tractable

Full coreference — deciding which referent every gendered word belongs to — is
still out of reach, and `R0` said so. What this feature needs is much smaller:
**the subject of a copula, when that subject is a name sitting immediately in
front of it.** That covers the case people actually type.

Checked against the real model output rather than assumed
(`Xenova/opus-mt-en-ro`, q8, the build that runs in the browser):

| English | Romanian |
|---|---|
| Josh is my friend and Maya is also my friend | `Josh este prietenul meu și Maya este și prietena mea.` |
| Alex is tired and Sam is happy. | `Alex e obosită și Sam e fericit.` |
| My friend Maya is a doctor. | `Prietena mea Maya e doctor.` |
| I told Josh that Maya is tired. | `I-am spus lui Josh că Maya e obosită.` |
| Josh and Maya are my friends. | `Josh și Maya sunt prietenii mei.` |

Every name that governs something sits directly before its copula. That is the
whole rule: no parser, no coreference.

Note row 2 — the model called Alex feminine here, having called Alex masculine
in the `R7` name probe. The guess is not even stable across sentences, which is
the argument for the user's choice leading.

## Telling a name from a Romanian word

A capitalised word is read as a name only when the same word also appears in the
**English that produced the Romanian**. That single check does the work:

- `Prietena` at the start of a sentence — a Romanian word, and not in the
  English. Rejected. (Also in the form index, so it is rejected twice over.)
- `Cel din '17`, the model's rendering of "the plumber" — `Cel` is capitalised
  and unknown, but no `cel` appears in "The plumber is tired". Rejected.
- `Josh`, `Maya` — present verbatim in both. Accepted.

It works because names are exactly the words machine translation carries through
unchanged. The failure mode is benign: a name the model *does* translate
(`John` → `Ioan`) gets no row, and the general setting still applies.

## Only offering what we can act on

A detected name earns a row only when something in the output actually agrees
with it. In "I told Josh that Maya is tired", Josh is an indirect object — no
Romanian word follows his gender — so only Maya gets a row. A control that
changes nothing is worse than no control, and `R0`'s refusal principle applies
to controls as much as to vocabulary.

## Two bugs this turned up

**`și` straight after a copula is "also", not a conjunction.** The model writes
"Maya este **și** prietena mea" for "Maya is *also* my friend". `și` was in the
clause-boundary set, so the span closed one token in and the entire predicate
went uncorrected. A conjunction cannot coordinate a predicate that has not
started yet, so a boundary word directly after the copula that opened the span
is not a boundary.

**`sunt` is "I am" and "they are".** "Josh și Maya sunt prietenii mei" was being
read as first person, so the *speaker's* setting rewrote a predicate about two
other people. A name immediately in front settles it. The predicate there agrees
with both people jointly, so no per-person row is offered for it — joint
agreement over a group is a separate problem and is not solved here.

## Avoiding gender for a third person

`avoid` replaces a copula clause with a gender-free verb (`Sunt profesor` →
`Predau`). The lexicon stores that verb in the 1st and 2nd singular only. A
third person would need a 3rd singular we do not hold, and conjugation class is
not safely derivable, so `avoid` on a third person degrades to showing both
forms and says so. Previously it silently used the 2nd-person form, which would
have produced "Maya Predai".

## Two people both shown "both"

Doubling several words in one sentence used to collapse to two whole sentences,
because `cel/cea mai bun/buna prieten/prietena al/a meu/mea` is unreadable. That
is faithful while every doubled word belongs to one person. Two people each set
to **Both** have *four* readings, and printing two of them silently asserts that
Josh and Maya share a gender. So the collapse now happens only when all the
doubled words have the same owner; otherwise they stay inline.

## The choice is per sentence and is never remembered

The first version stored each person's choice in `localStorage`, keyed by the
lowercased name, on the reasoning that the same people recur. That is wrong: a
name is not a person. Knowing two people called Alex of different genders is
ordinary, and a remembered choice would then be applied silently to the wrong
one — the exact failure this whole app exists to prevent, just moved one level
up. So `personChoices` is cleared whenever the text changes and is not persisted
at all. Only the general **Me** and **Anyone else** rows are remembered, because
those describe a fixed pair of roles rather than a guess about identity.

## Found while testing: the service worker never updated the shell

The reused Playwright profile kept serving the previous run's JavaScript, which
read as an application bug for two rounds before the worker was suspected. That
turned out to be a real defect in the deployed app, fixed separately — see
[`R9-service-worker.md`](R9-service-worker.md). `scripts/people-check.mjs`
unregisters the worker and drops its shell cache, leaving the transformers model
cache alone, so a reused profile cannot serve stale code again.

## Also changed

Translation is now cached per input, so changing anybody's gender re-runs the
post-editor alone. Gender is decided after translation, so the model has nothing
to add the second time; before this, every click re-ran the model.

`npm run check:people` drives the whole flow in Firefox, because the rows are
DOM wiring that unit tests cannot reach.
