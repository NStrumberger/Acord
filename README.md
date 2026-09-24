# gendered-translator

English → Romanian (then German) translation that gets **grammatical gender** right.

English under-specifies gender; Romanian and German require it. Most translators
resolve this silently, defaulting to masculine. This one asks who is speaking, and
tells you when the "correct" form is genuinely disputed.

    I am tired.   →   Sunt obosit.   (male speaker)
                      Sunt obosită.  (female speaker)

## Status

R0–R7 complete: data audit, agreement core, curated lexicon, frame realizer,
gender post-editing, the web UI, and an installable offline app that translates
entirely in the browser.
See `notes/`. Run `npm run demo` to see it work:

    "I am a teacher"     male    Sunt profesor
                         female  Sunt profesoară
    "I am tired"         male    Sunt obosit
                         female  Sunt obosită
    "I saw them"         male    L-am văzut
                         female  Am văzut-o          <- word ORDER changes
    "I am a geologist"   female  Sunt geoloagă  [variant]
                                 DOOM3 admits both spellings

## Install it on your phone or iPad

The built app is a plain static folder with **no server**: translation runs in
the browser. Host `dist/` anywhere that serves HTTPS — Cloudflare Pages, GitHub
Pages, Netlify — then open it on the device and use *Share → Add to Home Screen*.
It installs with its own icon, runs full-screen, and works offline.

    npm run build          # emits dist/, ready to upload
    npm run preview        # serve the build locally to check it

First translation on a device downloads the model (~113 MB, quantised) and is
slow; it is cached afterwards and everything from then on is local and offline.
HTTPS is required — the service worker and installation both depend on it.

## Requirements

Node >= 22.6 (runs TypeScript natively, no build step for the engine) and
Python 3 for the build-time lexicon scripts. The shipped app has one runtime
dependency, `@huggingface/transformers`, loaded on demand.

## Commands

    npm run dev            # the app on http://localhost:5173
    npm run build          # static build into dist/
    npm test               # typecheck + node --test (no test framework)
    npm run shots          # screenshot Firefox at 3 breakpoints, both themes
    npm run check:webkit   # translate in WebKit (the iOS engine)
    npm run check:offline  # service worker + offline shell
    npm run demo           # showcase translations in both genders

Lexicon pipeline, in dependency order (needs Python 3):

    npm run data:extract   # occupation pairs from EnRoGend
    npm run data:kaikki    # paradigms + feminine equivalents from kaikki.org
    npm run data:build     # merge both sources -> curated lexicon
    npm run data:spike     # re-measure rule-derivability (R0)
    npm run data:validate  # check article rules against the corpus (R1)
    npm run mt:fixture     # regenerate the committed MT test fixture

## Attribution

Occupation lexicon derived from **EnRoGend** (CC BY 4.0). German paradigms will
come from **UniMorph** (CC BY-SA 3.0) and **kaikki.org** Wiktionary extracts
(CC BY-SA 4.0); ShareAlike attaches to the derived lexicon.
