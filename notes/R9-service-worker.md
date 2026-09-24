# R9 — The service worker could never update the app

## The bug

`public/sw.js` v1 was cache-first with no revalidation and a fixed cache name:

```js
const cached = await caches.match(request);
if (cached) return cached;          // never refetched, never expired
```

Nothing ever deleted `gendered-translator-v1`. Hashed filenames made that
harmless for JS and CSS — a new build emits new URLs — but `./` and
`./index.html` were precached under **stable** URLs and therefore frozen for the
life of the browser profile. A returning visitor kept an old `index.html`
pointing at old hashed assets, so **a deploy never reached anyone who had
already opened the site**. Every deploy verified so far was verified in a fresh
browser context, which is why it never showed.

It surfaced accidentally: while testing R8, a reused Playwright profile kept
serving the previous run's JavaScript, and that read as an application bug for
two rounds before the worker was suspected.

## The policy now

| Request | Strategy | Why |
|---|---|---|
| `/assets/…` | cache-first, never re-checked | the filename carries a content hash, so a URL can never mean anything else |
| everything else | stale while revalidate | the page, manifest and icons live at stable URLs whose content *does* change |

Plus a versioned cache name, with `activate` deleting every other cache — so a
bad policy cannot outlive the fix for it, which is the failure v1 had.

## Why not network-first

Network-first for the page would make a deploy land on the very next open
instead of the one after. It would also block first paint on the network every
time, in an app whose point is that it works offline on a phone. One open behind
is a real cost and worth naming; frozen forever was not a cost, it was a defect.

Existing installs recover after one extra reload: the browser fetches `sw.js`
outside the worker's own fetch handler, so the new worker is picked up, and
`skipWaiting` plus `clients.claim` activate it immediately.

## Verification

`npm run check:update` serves `dist/` from its own server, installs the worker,
changes `index.html` underneath it, and asserts the change arrives — then that
the v1 cache is gone, and that an offline reload still gets the *new* shell.

The check was confirmed to fail against the old worker before being trusted:

```
with the OLD worker
  reload 2 (should be the new build): BEFORE
  Error: a deploy never reached the installed app: still "BEFORE"
```
