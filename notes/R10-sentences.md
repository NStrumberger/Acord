# R10 — A full stop was ending the translation

## The bug

Reported: text after a full stop was not translated. Measured against the model
the app actually runs (`Xenova/opus-mt-en-ro`, q8):

| English | Romanian |
|---|---|
| `I am tired. My friend is happy.` | `Sunt obosit, prietenul meu e fericit.` |
| `Maya is my friend. Steve is tired. Rose works as a teacher.` | `Maya e prietena mea, Steve e obosit, Rose lucrează ca profesoară.` |
| `Hello. How are you? I am well.` | `- Bună, ce mai faci?` |

Worse than truncation. Two sentences are spliced together with a comma — the
full stop is *lost*, not respected — and the third sentence is **dropped
silently**. Nothing in the output says anything is missing.

opus-mt is a sentence-level model. It was never given a paragraph to translate;
it was being handed one and doing something arbitrary with it.

## The fix

`splitSentences()` in `src/ro/mt.ts` splits the English on terminal punctuation
followed by whitespace, and `translate()` runs the model once per sentence,
rejoining with a space. Each sentence keeps its own punctuation, because each
one is translated as a sentence.

```
Hello. How are you? I am well.   ->   Bună. Ce mai faci? Sunt bine.
```

This is the same finding as `R4`'s batching note, one level up: this model is
happiest given exactly one sentence, and anything else is the caller's job to
arrange.

## Abbreviations

A full stop is not always a sentence end, so a chunk whose previous piece ends
in a known abbreviation is joined back on. A lone letter counts, which keeps
initials together:

```
Dr. Popescu is my friend.        ->  one sentence
I saw Mr. Ionescu. He is tired.  ->  two
J. R. Tolkien is a writer.       ->  one
```

The list is short and deliberately so — `mr mrs ms dr prof sr jr st vs etc
approx dept fig no vol` plus any single letter. A missed abbreviation costs one
badly split sentence, which is what happened before this change for *every*
sentence, so the downside is bounded.

## Cost

One model call per sentence instead of one per input. A paragraph of five
sentences takes five passes. The model is already resident after the first
translation, so this is noticeable only on very long input, and the alternative
was losing sentences without saying so.
