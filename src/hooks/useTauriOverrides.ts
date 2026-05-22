/**
 * Tauri webview hardening:
 *  1. Block browser-default keyboard shortcuts that make no sense in a desktop app
 *     (reload, find-in-page, view-source, devtools in prod, etc.)
 *  2. Intercept <a href> clicks — external URLs open in the system browser via
 *     tauri-plugin-opener; internal/hash links are left alone.
 */
import { useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';

// Keys to suppress regardless of modifiers
const BARE_BLOCKED: Set<string> = new Set(['F5']);

// Ctrl/Cmd combos to suppress (key.toLowerCase())
const CTRL_BLOCKED: Set<string> = new Set([
  'r',          // Reload
  'f',          // Find in page
  'g',          // Find next
  'u',          // View source
]);

// Ctrl+Shift combos to suppress
const CTRL_SHIFT_BLOCKED: Set<string> = new Set([
  'r',          // Hard reload
  'g',          // Find previous
  'i',          // DevTools (Elements)
  'j',          // DevTools (Console)
  'c',          // DevTools (Inspector shortcut on some platforms)
]);

// F-keys to suppress when no modifier
const F_KEY_BLOCKED: Set<string> = new Set(['F12']);

function handleKeyDown(e: KeyboardEvent) {
  const key = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;

  if (BARE_BLOCKED.has(e.key)) { e.preventDefault(); return; }
  if (F_KEY_BLOCKED.has(e.key)) { e.preventDefault(); return; }
  if (ctrl && !shift && CTRL_BLOCKED.has(key)) { e.preventDefault(); return; }
  if (ctrl && shift && CTRL_SHIFT_BLOCKED.has(key)) { e.preventDefault(); return; }
}

function handleClick(e: MouseEvent) {
  // Walk up from the click target to find an <a> element
  let el = e.target as HTMLElement | null;
  while (el && el.tagName !== 'A') el = el.parentElement;
  if (!el) return;

  const href = (el as HTMLAnchorElement).href;
  if (!href) return;

  // Only intercept absolute external URLs
  if (href.startsWith('http://') || href.startsWith('https://')) {
    // Don't intercept localhost (sidecar) links if any exist
    const url = new URL(href);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return;

    e.preventDefault();
    openUrl(href).catch(console.error);
  }
}

export function useTauriOverrides() {
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('click', handleClick, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('click', handleClick, { capture: true });
    };
  }, []);
}
