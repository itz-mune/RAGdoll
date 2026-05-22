/**
 * Lazy-loaded Hunspell spell checker using nspell + dictionary-en.
 * Dictionary files are fetched as static assets (Vite copies them to dist/).
 * The checker is pre-warmed via requestIdleCallback so it's ready by first use.
 */
import nspell from 'nspell';

// Served from public/dictionaries/ — copied there from node_modules/dictionary-en
const affUrl = '/dictionaries/en.aff';
const dicUrl = '/dictionaries/en.dic';

type Speller = ReturnType<typeof nspell>;

let speller: Speller | null = null;
let promise: Promise<Speller> | null = null;

async function load(): Promise<Speller> {
  if (speller) return speller;
  if (promise) return promise;

  promise = (async () => {
    const [aff, dic] = await Promise.all([
      fetch(affUrl).then((r) => r.text()),
      fetch(dicUrl).then((r) => r.text()),
    ]);
    speller = nspell(aff, dic);
    return speller;
  })();

  return promise;
}

// Pre-warm during idle time — dictionary is ready before the first right-click
if (typeof window !== 'undefined') {
  const warm = () => load().catch(() => {});
  'requestIdleCallback' in window
    ? (window as any).requestIdleCallback(warm, { timeout: 5000 })
    : setTimeout(warm, 2000);
}

/** Returns up to `limit` replacement suggestions, or [] if the word is correct. */
export async function getSpellSuggestions(word: string, limit = 5): Promise<string[]> {
  if (!word || word.length < 2) return [];
  try {
    const s = await load();
    if (s.correct(word)) return [];
    return s.suggest(word).slice(0, limit);
  } catch {
    return [];
  }
}
