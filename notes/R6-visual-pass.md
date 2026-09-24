# Visual pass — seeing the page in Firefox

`npm run shots` drives Playwright's Firefox build headlessly, screenshots the app
at 390 / 768 / 1440 in both colour schemes, checks for console errors, and prints
what the engine actually supports. Output lands in `shots/` (gitignored).

This matters because the extension route is Chrome-only and Firefox is the
browser in use. Testing the wrong engine would have missed the first finding
below entirely.

## What Firefox actually supports

    text-wrap: pretty    false      <-- every one of ours is inert here
    text-wrap: balance   true
    backdrop-filter      true
    underline wavy       true
    100dvh               true

`text-wrap: pretty` is used in several places for widow control. It works in
Chrome and Safari and does nothing in Firefox. Left in place as progressive
enhancement, but it is not doing anything for the person using this app.

## Found by looking, not by testing

- **Six dotted underlines in a row read as "everything is misspelled."** The
  marks were `border-bottom` at full accent strength. Now a 50%-opacity dotted
  `text-decoration` sitting `.24em` clear of the baseline.
- **Segmented controls stretched the full page width**, which made four short
  labels look like a stretched toolbar. Sized to content now.
- **The dark-mode selected thumb was invisible** — `#2c2c2e` on a
  `rgba(118,118,128,.24)` track is almost no contrast. Raised to `#5a5a5e`.
- **The textarea showed a resize grabber** in the corner of the panel. Removed.
- **The mark covered trailing punctuation**, so `mea.` underlined the full stop
  and looked like a typo. Only the word carries the mark now.
- **At phone width the segmented control wrapped** into ragged rows and stopped
  reading as one control. It scrolls horizontally instead, as iOS does.

## Two "bugs" that were the harness, not the app

The first run showed a blank Romanian pane and a washed-out Translate button.
Both were the screenshot firing too early: the 350ms enter animation had not
played, and the button was still `disabled` for the in-flight request. The
script now waits for the request to finish, the button to re-enable and the
animation to settle before capturing.

Worth remembering: a screenshot taken mid-transition looks exactly like a
rendering bug.

## Second pass: what "not Apple yet" actually consisted of

The first Apple-ish attempt was Apple-flavoured, not Apple-structured. Named
concretely, the gap was:

1. **Web form idiom instead of grouped lists.** Labels sat above their controls.
   Apple puts them in an *inset grouped list*: label left, control right,
   separator inset to the label's edge. This was the single biggest tell and the
   largest structural change.
2. **An invented type ramp.** Sizes had been chosen by eye. Apple's is specific
   and the base is **17px, not 15** — the app now uses Title 1 28, Body 17,
   Subhead 15, Footnote 13, Caption 12, with size-appropriate negative tracking.
3. **Ad-hoc spacing.** Now a 4pt grid (`--s1` … `--s10`).
4. **A facsimile segmented control.** Real iOS has hairline separators between
   unselected segments, those hairlines vanish either side of the selection, and
   the thumb **slides**. The slide cannot be done in CSS alone: the thumb has to
   be measured against whichever label is checked, re-measured when Inter
   finishes loading (label widths change) and on resize. That is
   `mountSegmentedThumbs()`.
5. **A flat material.** Apple surfaces carry a 1px inner highlight along the top
   edge plus a *pair* of shadows — one tight contact shadow, one wide ambient.
6. **A fixed-height input** reserving empty rows. It now grows with its content.

## What cannot be reproduced, and why

- **SF Pro.** Apple's licence does not permit web use. Inter is the standard
  substitute; `cv11` gives the single-storey `a` that reads closest to SF.
- **Squircle corners.** Apple's rounding is a superellipse; CSS `border-radius`
  is a circular arc. Approximated with a slightly larger radius. A true squircle
  needs an SVG or Houdini path and is not worth the complexity here.

Both are stated rather than quietly faked.

## Third pass: Apple Translate's own idiom

Worth stating plainly: the app itself could not be opened or screenshotted from
here, so this was built from knowledge of its design language rather than from
looking at it. The elements adopted:

- **A language bar at the top of the card** (`English → Romanian`) instead of
  per-pane labels. In Translate this is the card's header and it carries the
  direction; here the direction is fixed, so it is a static pair rather than a
  swap control. No dead affordance.
- **The translation is the hero.** Source at 22px, translation at 30px. They
  were previously near-equal, which made the card read as a form rather than a
  translation.
- **An action row beneath the translation.** Both actions are real:
  - **Copy** writes the translation to the clipboard, and reports it if the
    browser refuses.
  - **Speak** uses `speechSynthesis` with a Romanian voice — and **only appears
    when the system actually has one installed**. Voices populate
    asynchronously, so it re-checks on `voiceschanged`. On a machine with no
    Romanian TTS the button is simply absent rather than present and broken.

When the output is two variants, copy takes both lines and speech reads the
first.

## Still not reproduced

Beyond SF Pro and squircles: Translate's source text collapses to a smaller
secondary line once a translation exists, and has swap/fullscreen/favourite
affordances. Those belong to a two-way translator with history; this one is
one-way and stateless, so adding them would be decoration rather than function.
