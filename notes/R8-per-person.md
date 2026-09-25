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

## Listing everyone, and saying who cannot be set

The first version listed only people something in the output agreed with, on the
grounds that a control which changes nothing is worse than no control. That was
wrong, and reported as a bug within a day:

```
Maya is my friend and so is Steve, so is Rose and Henry
  -> Maya e prietena mea și la fel și Steve, la fel și Rose și Henry.
```

All four names are found. Only Maya governs anything: Romanian states
`prietena mea` once and elides it afterwards, so there is no second slot to
inflect — an accurate reading of the sentence, and one no amount of analysis
changes. But three missing rows do not say "Romanian cannot mark them here";
they say "this app did not see them". **Silence is the more misleading of the
two.** So everyone named is listed, and anyone with nothing to set is shown as
*not marked in Romanian*.

`PostEdit.people` is therefore `{ name, governs }[]` rather than `string[]`.

## From two people, the names replace the catch-all

With two or more named people, those people *are* the other people, so the
general **Anyone else** row is hidden rather than left sitting there silently
outranking them. Its value stops applying at the same moment — a hidden control
that still forces a gender is a trap — and the blank option on each named row
relabels from *Same* to *Not set*, because what it falls back to has changed.

One consequence worth naming: a sentence with two names *and* an unnamed third
party ("Maya is my friend, Steve is my friend, and my brother is tired") leaves
that unnamed person with no control at all. Rarer than the case this fixes.

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

## "Works as a teacher" is an agreement site too

Reported: "Maya is my friend, although Steve is tired, Rose works as a teacher"
gave only two settable people.

```
Rose lucrează ca profesoară.
```

`lucrează` is a lexical verb, not a copula, and only copulas opened a span — so
`profesoară` had no owner. The fix is narrow: **`ca` opens a span when the token
two back is a name.** That is exactly the "X works as a Y" frame, and `ca` is
what marks the role off, which is why it is a clause boundary everywhere else.

The obvious wider rule — let any third-person verb with a name subject open a
span — was considered and rejected. It is close enough to real coreference to
start claiming words that belong to somebody else: in "Rose a cunoscut-o pe
prietena mea", `prietena mea` is the *speaker's* friend, not Rose's.

The comparative use of the same word is unaffected, because the name is the
thing compared to rather than the subject:

```
Maya e la fel de obosită ca Steve.   ->  Steve governs nothing
```

## How many rows fit before a phone runs out

Measured, not guessed. A name row costs about 88px once the layout stacks. The
number of names whose controls are all reachable without scrolling from the top
of the page:

| Device | Names |
|---|---|
| iPhone SE, Safari (375x579 visible) | 3 |
| iPhone 14, Safari (390x756 visible) | 5 |
| iPhone 14, installed (390x844) | 6 |
| iPad mini, Safari | 12+ |

`MAX_VISIBLE_PEOPLE = 5`: the most a current phone in Safari carries, and safe
in an installed app. Anyone past it folds behind a **Show N more people**
toggle, collapsed to begin with, because the names a sentence opens with are
the ones most likely to be meant. Nothing is unreachable.

Worth recording separately: the page has **never** fit a phone in one screen,
with or without name rows — the Translate button sits at ~925px on an iPhone 14
whose visible viewport is 756px. The cap is about keeping the *control block*
usable, not about making the page fit.

A row revealed from `display:none` has never been measured, so its sliding
thumb would be zero-width for a frame. The toggle re-places every thumb
explicitly rather than waiting for the `ResizeObserver` to notice.

## The name's guess is the default, not the decision

The feature began by refusing to let a name influence anything, because the
model's name-to-gender mapping is unreliable: `R7` measured Alex, Sam and Jordan
all coming back masculine. Every named row therefore started blank.

That threw away a real signal. Most names do carry a strong convention, and a
row that starts blank makes the user set something the translator had already
got right. The resolution is not which one wins but **where the guess is
allowed to act**: as a visible starting value in a control, never as a silent
decision. So every named row now starts on the gender the translator itself
chose, and moving the control overrules it.

Two consequences fall out of this:

- The blank option disappears from a named row. There is nothing for it to mean
  once the row shows a real value — selecting the guessed gender *is* leaving
  the translation alone. Named rows are four segments now, matching **Me**.
- The guess is read off the translation **before** any rewriting. Reading it
  after would make it echo whatever the user last chose, and the control would
  have no default left to overrule. There is a test for exactly that.

The marks in the output still separate the two: a word the user set is marked,
a word the translator chose is not. The key says so.

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
