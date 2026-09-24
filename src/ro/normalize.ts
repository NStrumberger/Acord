/**
 * Marian/OPUS models emit the legacy cedilla forms of the Romanian letters;
 * correct Romanian, and this project's entire lexicon, use the comma-below
 * ones. Left unnormalised, every index lookup on a word containing s or t
 * misses silently -- no error, just no gender correction.
 */
const CEDILLA_TO_COMMA: Record<string, string> = {
  '\u015F': '\u0219', // ş -> ș
  '\u015E': '\u0218', // Ş -> Ș
  '\u0163': '\u021B', // ţ -> ț
  '\u0162': '\u021A', // Ţ -> Ț
};

export function normalizeRomanian(text: string): string {
  return text.replace(/[\u015E\u015F\u0162\u0163]/g, (c) => CEDILLA_TO_COMMA[c] ?? c);
}
