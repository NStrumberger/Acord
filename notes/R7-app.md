# R7 — From localhost page to installable app

The app was previously a Vite dev server plus a Python translation service, both
on one PC, reachable only from that machine. It is now a **static site with no
server at all**: translation runs in the browser.

## What changed

`Xenova/opus-mt-en-ro` is the same OPUS/Marian family Argos used, compiled to
ONNX for `transformers.js`. It runs client-side under WASM. The Python service,
`mt_server.py`, `translate.py` and `mt_setup.py` are deleted — nothing needs a
host any more.

| | before | after |
|---|---|---|
| translation | Python + ctranslate2 on localhost:8765 | in-browser ONNX |
| hosting | PC, local network only | any static host, free |
| offline | no | yes, after first load |
| install | no | home screen on iOS/iPadOS/Android |

Model download is ~113 MB quantized (encoder 50, decoder 57, tokenizer 6), once
per device, then cached by the browser. The library itself is code-split at
155 kB gzipped and only loads when someone actually presses Translate — the app
shell is 13 kB.

## The iOS risk, tested rather than assumed

WebKit is the engine Safari uses on iPhone and iPad, and it has tighter WASM
memory limits than Chromium. `npm run check:webkit` loads the built app in
Playwright's WebKit, translates, and asserts the result. It passes: a cold run
including the model download completes in 8–12s and produces correct gendered
output. Without this the whole plan was a guess.

`npm run check:offline` verifies the service worker takes control and the app
still opens with the network switched off.

## Two bugs found on the way

**Batched translation is broken.** Passing several sentences at once to this
model through transformers.js produces degenerate output — long runs of trailing
full stops. Both the fixture generator and `translate()` now go one sentence at
a time. The app only ever sent one line, so this never reached anyone, but it
would have the moment a paragraph was split.

**A literal backspace inside a regex.** A `\b` written through a Python patch
script became U+0008 rather than an escape, so `/obosit\b/` was really
`/obosit␈/` and could never match. It rendered as nothing in every editor and
every diff. Any test asserting on a regex built that way is worth a codepoint
check.

## Model change, and what it did to the tests

Output differs from Argos in wording — *I was tired yesterday* now gives
*Ieri eram obosită* rather than *Am fost obosit ieri* — so the committed fixture
was regenerated from the model that actually ships, and three tests were updated
to match reality rather than the old backend.

One of them had to change its premise: it demonstrated that MT picks gender
arbitrarily using *I am tired* vs *I am happy*, and this model is consistent on
that pair. It is still arbitrary across persons (*Sunt obosit* for the speaker,
*Ești obosită* for the addressee), so the test now uses that.

## Deploying

`npm run build` emits `dist/`, which is a plain static folder. `base` is `'./'`,
so it works from a domain root or a project subpath without reconfiguration.
HTTPS is required for the service worker and for installation.

## Names are a guess, not evidence

Reported: "Maya is my friend" always came out feminine and "Josh is my friend"
always masculine, whatever the user had selected. The post-editor was behaving
as designed — a third-person clause was deliberately left alone — but the effect
was that the model's guess about a name silently beat the user's explicit choice.

Measured, with nothing in the English to go on:

| name | model guessed |
|---|---|
| Alex | masculine |
| Sam | masculine |
| Jordan | masculine |
| Robin | feminine |
| Andrea | feminine |

**Every genuinely androgynous name came out masculine.** The model falls back to
the masculine default when it cannot tell, which is the exact bias this app
exists to correct. `Andrea` is worse still: it guessed feminine, and *Andrea* is
a male name in Romanian and Italian.

So the user's setting now governs third parties too, not only the speaker and
the person addressed. The second control is relabelled **Anyone else** to say so.

One distinction kept: **an explicit pronoun is never overridden.** If the
Romanian says *el* or *ea*, the English said *he* or *she*, and that is real
information — overriding it would produce `el este bună`, which is ungrammatical.
A name carries no such information. `GENDERED_PRONOUN` is the guard.

Leaving **Anyone else** unset keeps the previous behaviour: whatever the model
produced stands.
