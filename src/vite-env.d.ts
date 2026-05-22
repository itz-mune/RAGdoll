/// <reference types="vite/client" />

// Build-time constants injected by vite.config.ts `define`
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

// nspell has no bundled types
declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string): this;
    remove(word: string): this;
  }
  function nspell(aff: string | Uint8Array, dic?: string | Uint8Array): NSpell;
  export = nspell;
}
