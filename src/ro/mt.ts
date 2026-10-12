import { normalizeRomanian } from './normalize.ts';
import { tidyRomanian } from './tidy.ts';
import models from './models.json' with { type: 'json' };

/**
 * Translation runs in the browser with Mozilla's Firefox Translations engine
 * (Bergamot, MPL-2.0): small distilled models, one per direction, served from
 * this site and kept by the service worker for offline use. Chosen over the
 * opus-mt and m2m100 models by measurement; see notes/R12-reverse-spike.md.
 */
export type Pair = 'en-ro' | 'ro-en';

/** Copied into public/ by scripts/vendor-bergamot.mjs; keep the version in step. */
const RUNTIME = 'bergamot/0.4.9/translator.js';

export class TranslationUnavailable extends Error {}

export type LoadProgress = { percent: number };

type Part = 'model' | 'lex' | 'vocab';
type ModelFile = { name: string; size: number; gzSize: number; sha256: string };
const REGISTRY = models as unknown as Record<Pair, Record<Part, ModelFile>>;

/** Only the parts of the runtime's API that we use. */
type Request = { from: string; to: string; text: string; html: boolean };
interface Translator {
  translate(request: Request): Promise<{ target: { text: string } }>;
  delete(): Promise<void>;
  /** Settles once the WebAssembly worker has started, or rejects if it cannot. */
  worker: Promise<unknown>;
}

/** A download with no bytes for this long is given up on. */
const STALL_MS = 30_000;
interface Backing {
  loadModelRegistery(): Promise<unknown>;
  fetch(url: string, checksum?: string): Promise<ArrayBuffer>;
}
interface Runtime {
  TranslatorBacking: new (options: object) => Backing;
  LatencyOptimisedTranslator: new (options: object, backing: Backing) => Translator;
}

let ready: Promise<Translator> | undefined;
const loaded = new Set<Pair>();
/** Bytes received per file of the current download, for one overall percentage. */
const received = new Map<string, number>();
let listener: { pair: Pair; onProgress: (p: LoadProgress) => void } | undefined;

export function isLoaded(pair: Pair = 'en-ro'): boolean {
  return loaded.has(pair);
}

const fileUrl = (pair: Pair, name: string) => new URL(`models/${pair}/${name}`, document.baseURI).href;

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

function report(url: string, bytes: number): void {
  received.set(url, bytes);
  if (!listener) return;
  const files = Object.values(REGISTRY[listener.pair]);
  const total = files.reduce((sum, f) => sum + f.gzSize, 0);
  let done = 0;
  for (const f of files) done += received.get(fileUrl(listener.pair, f.name)) ?? 0;
  listener.onProgress({ percent: Math.min(100, (done / total) * 100) });
}

/**
 * Servers disagree about .gz files: some send them as they are, others (Vite's
 * dev server among them) label them Content-Encoding: gzip, and the browser
 * unpacks them before we see them. So look at the bytes rather than trust the
 * name: a gzip stream always starts 1f 8b.
 */
function isGzip(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  return head[0] === 0x1f && head[1] === 0x8b;
}

function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

/**
 * Downloads a gzipped model file, unpacks it, and checks it against the hash
 * pinned in models.json. Replaces the runtime's own fetch, which expects
 * unpacked files.
 */
async function download(url: string, checksum?: string): Promise<ArrayBuffer> {
  // Give up when nothing arrives for a while, not after a fixed total: a slow
  // line can take minutes over 15 MB and still be making progress.
  const stalled = new AbortController();
  let timer = setTimeout(() => stalled.abort(), STALL_MS);
  const alive = () => { clearTimeout(timer); timer = setTimeout(() => stalled.abort(), STALL_MS); };
  try {
    const response = await fetch(url, { signal: stalled.signal });
    if (!response.ok || !response.body) throw new TranslationUnavailable(`${url}: HTTP ${response.status}`);
    let bytes = 0;
    const counted = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        alive();
        bytes += chunk.byteLength;
        report(url, bytes);
        controller.enqueue(chunk);
      },
    }));
    const body = await new Response(counted).arrayBuffer();
    const buffer = isGzip(body) ? await gunzip(body) : body;
    if (checksum && hex(await crypto.subtle.digest('SHA-256', buffer)) !== checksum) {
      throw new TranslationUnavailable(`${url}: checksum mismatch`);
    }
    return buffer;
  } catch (cause) {
    if (stalled.signal.aborted) throw new TranslationUnavailable(`${url}: no data for ${STALL_MS / 1000} s`);
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

/** The runtime wraps failures ("Could not fetch …", {cause}); keep the inner reason too. */
const describe = (e: unknown): string =>
  e instanceof Error ? [e.message, e.cause === undefined ? '' : describe(e.cause)].filter(Boolean).join(': ') : String(e);

export function loadTranslator(): Promise<Translator> {
  // Loaded on demand: someone who never presses Translate should not pay for
  // the runtime or the models.
  ready ??= (async () => {
    const runtime = await import(/* @vite-ignore */ new URL(RUNTIME, document.baseURI).href) as Runtime;
    class Backing extends runtime.TranslatorBacking {
      async loadModelRegistery() {
        return (Object.keys(REGISTRY) as Pair[]).map((pair) => {
          const [from, to] = pair.split('-');
          const files = Object.fromEntries(Object.entries(REGISTRY[pair]).map(([part, f]) =>
            [part, { name: fileUrl(pair, f.name), size: f.size, expectedSha256Hash: f.sha256 }]));
          return { from, to, files };
        });
      }
      fetch(url: string, checksum?: string) {
        return download(url, checksum);
      }
    }
    // No pivoting: a missing pair must fail loudly, not go via a third language.
    const backing = new Backing({ pivotLanguage: null, downloadTimeout: 0 });
    const translator = new runtime.LatencyOptimisedTranslator({}, backing);
    // The worker starts in the background, and if it fails to (a missing
    // .wasm, an old cached worker) the runtime only logs it: a translation
    // waiting on it would never settle. Wait here so the failure surfaces.
    await translator.worker;
    return translator;
  })().catch((cause: unknown) => {
    ready = undefined;   // let a later attempt retry rather than stay broken
    throw new TranslationUnavailable(`could not load the translator: ${describe(cause)}`);
  });
  return ready;
}

/**
 * English titles with a full stop ("Mrs. Smith") come back as "Doamna. Smith":
 * the model reads the stop as the end of a sentence. Without it ("Mrs Smith",
 * British style) they translate cleanly. Measured in notes/R12.
 */
export function prepareEnglish(text: string): string {
  return text.replace(/\b(Mr|Mrs|Ms|Dr|Prof)\.(?=\s+\p{Lu})/gu, '$1');
}

const DASH = /^[-–—]\s/u;

/**
 * The models learnt partly from subtitles, where a new speaker's line starts
 * with a dash, and now and then put one before a sentence ("- Cum ești?").
 * A dash the source itself starts with (a list item) is the user's, and stays.
 */
export function dropDialogueDashes(text: string, source = ''): string {
  const keepFirst = DASH.test(source.trimStart());
  return text.replace(/(^|[.!?…]\s+)[-–—]\s+/gu, (match, before: string, at: number) =>
    at === 0 && before === '' && keepFirst ? match : before);
}

/**
 * Calls run one after another. The runtime cancels a pending request when a
 * newer one arrives, which is right for a type-ahead box but not here: the
 * page re-runs on every settings change, and a cancelled call must not look
 * like a broken engine.
 */
let queue: Promise<unknown> = Promise.resolve();

export function translate(
  lines: string[],
  onProgress?: (p: LoadProgress) => void,
  pair: Pair = 'en-ro',
): Promise<string[]> {
  const run = queue.then(() => translateNow(lines, onProgress, pair));
  queue = run.catch(() => undefined);
  return run;
}

async function translateNow(
  lines: string[],
  onProgress: ((p: LoadProgress) => void) | undefined,
  pair: Pair,
): Promise<string[]> {
  const translator = await loadTranslator();
  const [from = '', to = ''] = pair.split('-');
  listener = onProgress && { pair, onProgress };
  const out: string[] = [];
  try {
    // One request per line: the engine splits sentences itself, unlike
    // opus-mt, which dropped sentences when handed several at once.
    for (const line of lines) {
      if (!line.trim()) { out.push(''); continue; }
      const text = pair === 'en-ro' ? prepareEnglish(line) : normalizeRomanian(line);
      const { target } = await translator.translate({ from, to, text, html: false });
      const result = dropDialogueDashes(target.text.trim(), line);
      out.push(pair === 'en-ro' ? tidyRomanian(normalizeRomanian(result)) : result);
    }
  } catch (cause) {
    // A failed download stays cached inside the runtime, so start afresh next time.
    if (ready) {
      ready = undefined;
      void translator.delete().catch(() => undefined);
    }
    throw cause instanceof TranslationUnavailable ? cause : new TranslationUnavailable(describe(cause));
  } finally {
    listener = undefined;
  }
  loaded.add(pair);
  return out;
}
