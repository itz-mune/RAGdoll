/**
 * useKeyboardShortcuts — registers global keyboard shortcuts.
 * Call once at the AppShell level; the hook wires everything up and tears down on unmount.
 */
import { useEffect } from 'react';
import { useCommandPalette } from './useCommandPalette';

type ShortcutHandlers = {
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenDashboard: () => void;
  onOpenMarketplace: () => void;
  onOpenMemory: () => void;
  onEscape: () => void;
};

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const { toggle: togglePalette } = useCommandPalette();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in inputs / textareas
      const tag = (e.target as HTMLElement).tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      // Ctrl/Cmd + K — command palette (always, even in inputs)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        togglePalette();
        return;
      }

      // Escape — context-dependent
      if (e.key === 'Escape' && !isEditable) {
        handlers.onEscape();
        return;
      }

      // Shortcuts that should NOT fire while typing
      if (isEditable) return;

      // Ctrl+N — new chat
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handlers.onNewChat();
        return;
      }

      // Ctrl+, — settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        handlers.onOpenSettings();
        return;
      }

      // Ctrl+H — dashboard (H = Home)
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        handlers.onOpenDashboard();
        return;
      }

      // Ctrl+Shift+M — memory browser
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        handlers.onOpenMemory();
        return;
      }

      // Ctrl+M — marketplace
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        handlers.onOpenMarketplace();
        return;
      }

    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePalette, handlers]);
}
