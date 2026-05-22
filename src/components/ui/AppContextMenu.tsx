/**
 * AppContextMenu — replaces the browser's native right-click menu.
 *
 * • Non-editable elements  → right-click suppressed, no menu shown
 * • input / textarea / contenteditable → custom styled menu:
 *     – Spell suggestions at top (if cursor is on a misspelled word)
 *     – Cut / Copy / Paste / Select All
 *     – Spellcheck toggle
 *
 * Spell checking uses nspell (same Hunspell engine as browsers) loaded lazily.
 * The dictionary is pre-warmed at idle time so suggestions appear instantly.
 */
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Scissors, Copy, Clipboard, CheckSquare, SpellCheck2, WandSparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSpellSuggestions } from '@/lib/spellcheck';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  isSuggestion?: boolean;
  action: () => void;
}

interface MenuState {
  rawX: number;
  rawY: number;
  items: MenuItem[];
  /** Extra items appended asynchronously (spell suggestions) */
  suggestionSlot: 'loading' | MenuItem[] | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fire React's synthetic onChange after programmatically updating a value. */
function reactSet(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Find the word and its span in the value around the cursor. */
function wordAtCursor(
  el: HTMLInputElement | HTMLTextAreaElement,
): { word: string; start: number; end: number } | null {
  const text = el.value;
  const cursor = el.selectionStart ?? 0;
  let start = cursor;
  let end = cursor;
  while (start > 0 && /[\w']/.test(text[start - 1])) start--;
  while (end < text.length && /[\w']/.test(text[end])) end++;
  // Trim leading/trailing apostrophes
  while (start < end && text[start] === "'") start++;
  while (end > start && text[end - 1] === "'") end--;
  const word = text.slice(start, end);
  return word.length >= 2 ? { word, start, end } : null;
}

/** For contenteditable: get the word at the click point via caret range. */
function wordAtPoint(x: number, y: number): { word: string } | null {
  const range = document.caretRangeFromPoint?.(x, y);
  if (!range) return null;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? '';
  let start = range.startOffset;
  let end = range.startOffset;
  while (start > 0 && /[\w']/.test(text[start - 1])) start--;
  while (end < text.length && /[\w']/.test(text[end])) end++;
  const word = text.slice(start, end).replace(/^'|'$/g, '');
  return word.length >= 2 ? { word } : null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AppContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setMenu(null);
    setVisible(false);
  }, []);

  // ── Global contextmenu handler ──────────────────────────────────────────────
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      // If something else (e.g. Radix ContextMenu) already handled this event,
      // leave it alone — only intercept events that reach us unhandled.
      if (e.defaultPrevented) return;

      const el = e.target as HTMLElement;
      const isInput =
        el.tagName === 'INPUT' &&
        !['checkbox', 'radio', 'range', 'color', 'file'].includes(
          (el as HTMLInputElement).type,
        );
      const isTextarea = el.tagName === 'TEXTAREA';
      const isCE = el.isContentEditable;

      if (!isInput && !isTextarea && !isCE) {
        // Suppress the native browser menu for non-editable areas that have
        // no custom handler, but don't show our menu either.
        e.preventDefault();
        setMenu(null);
        return;
      }

      // Text input / textarea / contenteditable — show our custom menu.
      e.preventDefault();

      const inp = el as HTMLInputElement | HTMLTextAreaElement;
      const selStart = isCE ? 0 : (inp.selectionStart ?? 0);
      const selEnd = isCE ? 0 : (inp.selectionEnd ?? 0);
      const hasSelection = isCE
        ? (window.getSelection()?.toString().length ?? 0) > 0
        : selStart !== selEnd;

      // ── Build static items ──────────────────────────────────────────────
      const items: MenuItem[] = [
        {
          label: 'Cut',
          icon: <Scissors className="h-3.5 w-3.5" />,
          shortcut: 'Ctrl+X',
          disabled: !hasSelection,
          action: () => { document.execCommand('cut'); close(); },
        },
        {
          label: 'Copy',
          icon: <Copy className="h-3.5 w-3.5" />,
          shortcut: 'Ctrl+C',
          disabled: !hasSelection,
          action: () => { document.execCommand('copy'); close(); },
        },
        {
          label: 'Paste',
          icon: <Clipboard className="h-3.5 w-3.5" />,
          shortcut: 'Ctrl+V',
          action: async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (isCE) {
                document.execCommand('insertText', false, text);
              } else {
                const before = inp.value.slice(0, selStart);
                const after = inp.value.slice(selEnd);
                reactSet(inp, before + text + after);
                requestAnimationFrame(() => {
                  inp.selectionStart = inp.selectionEnd = selStart + text.length;
                });
              }
            } catch { /* clipboard denied */ }
            close();
          },
        },
        {
          label: 'Select All',
          icon: <CheckSquare className="h-3.5 w-3.5" />,
          shortcut: 'Ctrl+A',
          action: () => {
            if (isCE) document.execCommand('selectAll');
            else inp.select();
            close();
          },
        },
        {
          label: inp.spellcheck ? 'Disable spellcheck' : 'Enable spellcheck',
          icon: <SpellCheck2 className="h-3.5 w-3.5" />,
          action: () => { inp.spellcheck = !inp.spellcheck; close(); },
        },
      ];

      setMenu({ rawX: e.clientX, rawY: e.clientY, items, suggestionSlot: 'loading' });

      // ── Async spell check ───────────────────────────────────────────────
      const wordInfo = isCE
        ? wordAtPoint(e.clientX, e.clientY)
        : wordAtCursor(inp);

      if (!wordInfo) {
        setMenu((m) => m ? { ...m, suggestionSlot: null } : m);
        return;
      }

      getSpellSuggestions(wordInfo.word).then((suggestions) => {
        if (suggestions.length === 0) {
          setMenu((m) => m ? { ...m, suggestionSlot: null } : m);
          return;
        }

        const suggestionItems: MenuItem[] = suggestions.map((s) => ({
          label: s,
          icon: <WandSparkles className="h-3.5 w-3.5" />,
          isSuggestion: true,
          action: () => {
            if (isCE) {
              // Re-select the word and replace it
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                const r = sel.getRangeAt(0);
                r.selectNodeContents(r.startContainer);
                document.execCommand('insertText', false, s);
              }
            } else {
              if (!('start' in wordInfo)) return;
              const { start, end } = wordInfo as { word: string; start: number; end: number };
              const before = inp.value.slice(0, start);
              const after = inp.value.slice(end);
              reactSet(inp, before + s + after);
              requestAnimationFrame(() => {
                inp.selectionStart = inp.selectionEnd = start + s.length;
              });
            }
            close();
          },
        }));

        setMenu((m) => m ? { ...m, suggestionSlot: suggestionItems } : m);
      });
    };

    // Bubbling phase: Radix (and similar) fire first on the target element;
    // by the time we run, e.defaultPrevented tells us whether they handled it.
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [close]);

  // ── Dismiss on outside click or Escape ────────────────────────────────────
  useEffect(() => {
    if (!menu) return;
    const onMouse = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu, close]);

  // ── Clamp to viewport after render ───────────────────────────────────────
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const { width, height } = menuRef.current.getBoundingClientRect();
    setPos({
      x: Math.min(menu.rawX, window.innerWidth - width - 8),
      y: Math.min(menu.rawY, window.innerHeight - height - 8),
    });
    setVisible(true);
  }, [menu]);

  if (!menu) return null;

  const hasSuggestions =
    Array.isArray(menu.suggestionSlot) && menu.suggestionSlot.length > 0;

  return createPortal(
    <div
      ref={menuRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.x, top: pos.y, visibility: visible ? 'visible' : 'hidden' }}
      className="fixed z-[9999] min-w-[192px] overflow-hidden rounded-xl border border-border/60 bg-popover py-1 shadow-2xl"
    >
      {/* ── Spell suggestions (top section) ─────────────────────────────── */}
      {menu.suggestionSlot === 'loading' && (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground/50 italic">
            <WandSparkles className="h-3 w-3 animate-pulse" />
            Checking spelling…
          </div>
          <div className="my-1 border-t border-border/40" />
        </>
      )}

      {hasSuggestions && (
        <>
          <div className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Suggestions
          </div>
          {(menu.suggestionSlot as MenuItem[]).map((item, i) => (
            <MenuRow key={`sug-${i}`} item={item} />
          ))}
          <div className="my-1 border-t border-border/40" />
        </>
      )}

      {/* ── Standard edit actions ────────────────────────────────────────── */}
      {menu.items.slice(0, 4).map((item, i) => (
        <MenuRow key={`edit-${i}`} item={item} />
      ))}

      {/* ── Spellcheck toggle ─────────────────────────────────────────────── */}
      <div className="my-1 border-t border-border/40" />
      <MenuRow item={menu.items[4]} />
    </div>,
    document.body,
  );
}

// ── Row sub-component ─────────────────────────────────────────────────────────

function MenuRow({ item }: { item: MenuItem }) {
  return (
    <button
      disabled={item.disabled}
      onMouseDown={(e) => {
        e.preventDefault(); // keep focus on the input
        if (!item.disabled) item.action();
      }}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors',
        item.disabled
          ? 'cursor-not-allowed text-muted-foreground/35'
          : item.isSuggestion
          ? 'cursor-default font-medium text-primary hover:bg-primary/10'
          : 'cursor-default text-foreground hover:bg-muted/80',
      )}
    >
      <span className={cn(
        'shrink-0',
        item.disabled
          ? 'text-muted-foreground/35'
          : item.isSuggestion
          ? 'text-primary/70'
          : 'text-muted-foreground',
      )}>
        {item.icon}
      </span>
      <span className="flex-1">{item.label}</span>
      {item.shortcut && (
        <kbd className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground/60">
          {item.shortcut}
        </kbd>
      )}
    </button>
  );
}
