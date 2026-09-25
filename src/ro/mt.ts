import { normalizeRomanian } from './normalize.ts';

/**
 * Translation runs in the browser: no server, and nothing pinned to one
 * machine. The model is fetched once (~113 MB quantized) and then cached by
 * the browser, so later visits and offline use are instant.
 */
const MODEL = 'Xenova/opus-mt-en-ro';

export class TranslationUnavailable extends Error {}

export type LoadProgress = { percent: number };

/** Only the shape we actually use; the library's own generics are unwieldy. */
type Translator = (input: string[]) => Promise<{ translation_text: string }[]>;

let ready: Promise<Translator> | undefined;
const files = new Map<string, { loaded: number; total: number }>();

export function isLoaded(): boolean {
  return ready !== undefined;
}

export function loadTranslator(onProgress?: (p: LoadProgress) => void): Promise<Translator> {
  // Loaded on demand: the library is ~500 kB and someone who never presses
  // Translate should not pay for it.
  ready ??= (import('@huggingface/transformers').then(({ pipeline, env }) => {
    env.allowLocalModels = false;
    return pipeline('translation', MODEL, {
      dtype: 'q8',
      // One overall percentage rather than per-file, which jumps about.
      progress_callback: (p: {
        status: string; file?: string; loaded?: number; total?: number;
      }) => {
        if (p.status !== 'progress' || !p.file || !onProgress) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        let loaded = 0, total = 0;
        for (const f of files.values()) { loaded += f.loaded; total += f.total; }
        onProgress({ percent: total > 0 ? (loaded / total) * 100 : 0 });
      },
    });
  }) as unknown as Promise<Translator>).catch((cause: unknown) => {
    ready = undefined;   // let a later attempt retry rather than stay broken
    throw new TranslationUnavailable(`could not load the translation model: ${String(cause)}`);
  });
  return ready;
}

/**
 * A full stop that ends an abbreviation rather than a sentence. Includes a
 * lone letter, so initials like "J. R. Tolkien" stay in one piece.
 */
const ABBREVIATION = /(?:^|[\s(])(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|approx|dept|fig|no|vol|[a-z])\.$/i;

/**
 * English sentences, one per entry.
 *
 * opus-mt is a sentence-level model: handed several sentences at once it
 * splices them together with commas and, past two, silently drops the rest --
 * "Hello. How are you? I am well." came back as "- Buna, ce mai faci?". So the
 * splitting happens here rather than being left to the model.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/(?<=[.!?…])\s+/)) {
    if (!part.trim()) continue;
    const previous = out.at(-1);
    // "Dr." did not end a sentence, so put the pieces back together.
    if (previous !== undefined && ABBREVIATION.test(previous)) out[out.length - 1] = `${previous} ${part}`;
    else out.push(part);
  }
  return out;
}

export async function translate(
  lines: string[],
  onProgress?: (p: LoadProgress) => void,
): Promise<string[]> {
  const translator = await loadTranslator(onProgress);
  // Sequential, not batched: batching this model through transformers.js
  // produces degenerate output (long runs of trailing full stops).
  const out: string[] = [];
  for (const line of lines) {
    const sentences: string[] = [];
    for (const sentence of splitSentences(line)) {
      const [result] = await translator([sentence]);
      sentences.push(normalizeRomanian(result?.translation_text ?? '').trim());
    }
    out.push(sentences.filter(Boolean).join(' '));
  }
  return out;
}
