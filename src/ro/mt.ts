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

export async function translate(
  lines: string[],
  onProgress?: (p: LoadProgress) => void,
): Promise<string[]> {
  const translator = await loadTranslator(onProgress);
  // Sequential, not batched: batching this model through transformers.js
  // produces degenerate output (long runs of trailing full stops).
  const out: string[] = [];
  for (const line of lines) {
    const [result] = await translator([line]);
    out.push(normalizeRomanian(result?.translation_text ?? ''));
  }
  return out;
}
