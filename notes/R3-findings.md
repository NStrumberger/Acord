# R3 — Intermediate representation and Romanian realizer

`src/ro/frames.ts` (+ `src/ro/words.ts`). 40 tests passing, still zero runtime
dependencies and no build step.

## The IR came out smaller than planned

The plan specified a generic clause type:

    Clause { pred, tense, polarity, mood, register, args: {subj, obj?, iobj?, predComp?} }
    NP     { headLex, mods[], definiteness, number, possessor? }

Built instead as a **discriminated union of four frames**, each with exactly the
slots it needs:

    | { frame: 'predicate-noun';  subject; noun }    Sunt profesor
    | { frame: 'predicate-adj';   subject; adj }     Sunt obosit
    | { frame: 'possessed-noun';  possessor; noun }  prietenul meu
    | { frame: 'past-transitive'; subject; object; verb }  L-am văzut

This is both smaller and *safer*: a new frame is a compile error until its
realizer exists, whereas optional slots on one wide type fail silently. The
anti-explosion property the plan wanted is unchanged, because gender lives on
the `Referent`, not in the frame — adding a frame costs one realizer and never
multiplies with the feature set.

**Skipped:** tense, polarity, mood, register, `iobj`, `NP.mods[]`, and the
three-stage `lexicalize → inflect → linearize` pipeline. Add each when a frame
actually needs it. A separate linearize stage buys nothing while exactly one
frame has non-trivial word order.

## Word order really does depend on gender

The case the whole provenance design exists for now runs:

    L-am văzut.   (masculine object: proclitic, hyphenated onto the auxiliary)
    Am văzut-o.   (feminine object: enclitic, hyphenated onto the participle)

Two tokens vs two tokens, but the clitic changes **side of the verb**. A test
flips only the object's gender and asserts both outputs, which pins the rule
that overrides must **re-realize** rather than substitute strings. Any
token-level find-and-replace design would have had to be torn out here.

## Politeness confirmed the two-number design

`Dumneavoastră sunteți obosită` realizes correctly: the verb takes 2nd person
**plural** while the adjective takes **singular feminine**. `Referent` carries
`number` (semantic, drives agreement) and optional `verbNumber` (syntactic,
drives the verb). A single number field cannot express this, so the plan's
insistence on splitting them was right and costs two fields.

## A distinction that only surfaced in implementation

Capitalizing the first token broke `possessed-noun`, because that frame yields
a noun **phrase**, not a sentence. Sentence-initial capitalization is a property
of clauses, not of realization. Handled explicitly rather than by capitalizing
everything and letting callers fix it up.

## Neutral output

An adjective with an `unspecified` referent emits a doublet (`obosit/obosită`)
with a note, matching R2's lexicon behaviour. Romanian has no neutral adjective,
so this is the honest floor until R6 adds the dative-experiencer constructions
(`Mi-e frig`) that avoid agreement entirely.

## Bug found by the demo, not by the tests (fixed)

`npm run demo` prints `Sunt inginer [contested]` for a male speaker. The
masculine *inginer* is not contested at all — the dispute is entirely about the
feminine *ingineră*. `realize()` returns `entry.status` for every gender, but
that status describes the **feminine form's** standing.

Worth recording how this was caught: 40 passing tests did not, because every
status assertion was written against the feminine branch. Printing real output
for both genders side by side exposed it immediately. A demo is a cheap test of
the things you did not think to assert.

Fixed in `realize()`: the masculine is the unmarked citation form and returns
`normative`. A regression test now asserts all three of `entry.status`,
`realize(…, 'female').status` and `realize(…, 'male').status` for *engineer*.

## Code review outcome

The `typescript-reviewer` agent blocked on two HIGH findings. Both were real
and both are fixed.

**1. Silent masculine defaulting — the project's own cardinal sin.**
`possessedNoun` had `agreementOf(owner) ?? 'M'`, and `pastTransitive`'s `else`
branch caught unspecified gender along with masculine. An unspecified referent
therefore got masculine output with no note and no flag. Nothing in the test
suite covered an unspecified referent in either frame, so CI was blind to it.

The fix follows a principle now stated in the code: **if the alternatives
occupy the same slot, emit a doublet; if gender changes word ORDER, refuse.**
`prietenul meu/prietena mea` is expressible in one slot. `L-am văzut` vs
`Am văzut-o` is not, so that frame now throws a message naming why, rather than
guessing.

**2. Four non-null assertions over partial paradigms.** The grammatical tables
were `Record<string, string>`, so `noUncheckedIndexedAccess` widened every
lookup to `string | undefined` and four `!` assertions papered over it. Safe by
manual reasoning, but a typo or a change to `Referent.person` would have put the
literal text `undefined` into generated Romanian. Tables now use exact literal
key types (`PersonNumber` = `${1|2|3}${'sg'|'pl'}`) and `verbKey` returns that
type, so totality is compiler-enforced and all four assertions are gone.

Also fixed: the capitalize-vs-phrase decision is now a `kind: 'clause' |
'phrase'` field each realizer must set, rather than an ad hoc `frame ===` string
check a new frame could silently get wrong.

## A modelling bug the review did not catch

Fixing the first finding exposed something worse. `possessed-noun` chose the
noun's gender from the **possessor**:

    const a = agreementOf(owner) ?? 'M';
    const lemma = a === 'M' ? noun.m : noun.f;

In *my friend*, it is the friend's gender that selects `prieten` / `prietenă` —
not the speaker's. The original test passed only because it made both referents
male. The frame was under-specified: it now carries a separate `possessed`
referent, and a regression test asserts a male speaker with a female friend
gets `prietena mea`.

Two lessons worth keeping. A passing test suite said nothing here because the
test embodied the same misunderstanding as the code. And an automated reviewer
checks the code against its stated intent — it cannot tell you the intent itself
was wrong.

## Limits

- Six adjectives, three common nouns, four verbs. Vocabulary is the ceiling.
- Present tense and compound past only; 1st person possessive only.
- `pe`-marking and clitic doubling (`O văd pe Maria`) not implemented.
- No `al/a/ai/ale` possessive article (`un prieten al meu`).
