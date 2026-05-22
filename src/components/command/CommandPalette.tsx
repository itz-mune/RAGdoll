/**
 * CommandPalette — Ctrl+K global command launcher
 * Groups: Navigation · Chat · Profile · Appearance · Recent conversations
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, LayoutDashboard, MessageSquare, Settings,
  Brain, Package, User, Sun, Plus,
  ChevronRight,
} from 'lucide-react';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { chatStore } from '@/store/chatStore';
import { profileStore } from '@/store/profileStore';
import { ACCENT_PRESETS, setAccentPreset, useAccentHexes } from '@/lib/accent';
import Grainient from '@/components/Grainient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Command {
  id: string;
  group: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  onNavigate: (view: 'dashboard' | 'settings' | 'marketplace' | 'memory') => void;
  onOpenConversation: (id: string) => void;
  onOpenMessage: (convId: string, messageId: string) => void;
  onNewChat: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette({ onNavigate, onOpenConversation, onOpenMessage, onNewChat }: CommandPaletteProps) {
  const { isOpen, close } = useCommandPalette();
  const { color1, color2, color3, isDark } = useAccentHexes();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const conversations = chatStore((s) => s.conversations);
  const profiles = profileStore((s) => s.profiles);

  // ── Close helpers ──────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    close();
    setQuery('');
    setSelectedIdx(0);
  }, [close]);

  // ── Focus input on open ────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIdx(0);
    }
  }, [isOpen]);

  // ── Static commands ────────────────────────────────────────────────────────

  const staticCommands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      {
        id: 'nav-dashboard',
        group: 'Navigation',
        label: 'Go to Dashboard',
        icon: <LayoutDashboard className="h-4 w-4" />,
        action: () => { onNavigate('dashboard'); handleClose(); },
        keywords: ['home', 'overview', 'stats'],
      },
      {
        id: 'nav-settings',
        group: 'Navigation',
        label: 'Open Settings',
        icon: <Settings className="h-4 w-4" />,
        action: () => { onNavigate('settings'); handleClose(); },
        keywords: ['preferences', 'config'],
      },
      {
        id: 'nav-marketplace',
        group: 'Navigation',
        label: 'Open Marketplace',
        icon: <Package className="h-4 w-4" />,
        action: () => { onNavigate('marketplace'); handleClose(); },
        keywords: ['plugins', 'skills', 'extensions'],
      },
      {
        id: 'nav-memory',
        group: 'Navigation',
        label: 'Open Memory Browser',
        icon: <Brain className="h-4 w-4" />,
        action: () => { onNavigate('memory'); handleClose(); },
        keywords: ['memories', 'documents', 'knowledge'],
      },
    ];

    const chat: Command[] = [
      {
        id: 'chat-new',
        group: 'Chat',
        label: 'New Conversation',
        description: 'Start a fresh chat',
        icon: <Plus className="h-4 w-4" />,
        action: () => { onNewChat(); handleClose(); },
        keywords: ['new', 'create', 'start', 'fresh'],
      },
    ];

    const profileCmds: Command[] = profiles.map((p) => ({
      id: `profile-${p.id}`,
      group: 'Profile',
      label: `Switch to ${p.displayName}`,
      description: `${p.provider} · ${p.modelName}`,
      icon: <User className="h-4 w-4" />,
      action: () => { profileStore.getState().setActiveProfile(p.id); handleClose(); },
      keywords: ['profile', 'switch', p.provider, p.modelName],
    }));

    const appearance: Command[] = [
      {
        id: 'appearance-theme-toggle',
        group: 'Appearance',
        label: 'Toggle Dark / Light Mode',
        icon: <Sun className="h-4 w-4" />,
        action: () => {
          document.documentElement.classList.toggle('dark');
          handleClose();
        },
        keywords: ['theme', 'dark', 'light', 'mode'],
      },
      ...ACCENT_PRESETS.map((preset) => ({
        id: `accent-${preset.name.toLowerCase()}`,
        group: 'Appearance',
        label: `Accent: ${preset.name}`,
        icon: (
          <span
            className="inline-block h-4 w-4 rounded-full"
            style={{ background: preset.hex }}
          />
        ),
        action: () => { setAccentPreset(preset); handleClose(); },
        keywords: ['accent', 'color', 'colour', 'theme', preset.name.toLowerCase()],
      })),
    ];

    return [...nav, ...chat, ...profileCmds, ...appearance];
  }, [profiles, handleClose, onNavigate, onNewChat]);

  // ── Recent conversations as commands ───────────────────────────────────────

  const recentCommands = useMemo<Command[]>(() =>
    [...conversations]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5)
      .map((c) => ({
        id: `conv-${c.id}`,
        group: 'Recent',
        label: c.title,
        description: `${c.messageCount} message${c.messageCount !== 1 ? 's' : ''}`,
        icon: <MessageSquare className="h-4 w-4" />,
        action: () => { onOpenConversation(c.id); handleClose(); },
        keywords: [c.title.toLowerCase()],
      })),
  [conversations, handleClose, onOpenConversation]);

  // ── Message content search (searches loaded messages only) ────────────────
  const messageCommands = useMemo<Command[]>(() => {
    const q = query.toLowerCase().trim();
    if (!q || q.length < 2) return [];
    const allMessages = chatStore.getState().messages;
    const convMap = new Map(conversations.map((c) => [c.id, c]));
    const results: Command[] = [];
    for (const [convId, msgs] of Object.entries(allMessages)) {
      const conv = convMap.get(convId);
      if (!conv) continue;
      for (const msg of msgs) {
        if (msg.isStreaming) continue;
        const text = (msg.displayContent ?? msg.content).toLowerCase();
        if (!text.includes(q)) continue;
        // Grab a snippet around the match
        const idx = text.indexOf(q);
        const start = Math.max(0, idx - 30);
        const raw = (msg.displayContent ?? msg.content).slice(start, idx + q.length + 40);
        const snippet = (start > 0 ? '…' : '') + raw + (raw.length < (msg.displayContent ?? msg.content).length - start ? '…' : '');
        results.push({
          id: `msg-${msg.id}`,
          group: 'Messages',
          label: conv.title,
          description: snippet.replace(/\n/g, ' '),
          icon: <MessageSquare className="h-4 w-4" />,
          action: () => { onOpenMessage(convId, msg.id); handleClose(); },
          keywords: [],
        });
        if (results.length >= 8) break; // cap at 8 message results
      }
      if (results.length >= 8) break;
    }
    return results;
  }, [query, conversations, handleClose, onOpenMessage]);

  const allCommands = useMemo(
    () => [...staticCommands, ...recentCommands, ...messageCommands],
    [staticCommands, recentCommands, messageCommands]
  );

  // ── Filtered + grouped commands ────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return allCommands;
    return allCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false) ||
        (c.keywords?.some((k) => k.includes(q)) ?? false),
    );
  }, [allCommands, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const cmd of filtered) {
      if (!map.has(cmd.group)) map.set(cmd.group, []);
      map.get(cmd.group)!.push(cmd);
    }
    return map;
  }, [filtered]);

  // Keep selectedIdx in bounds when filter changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  // ── Keyboard navigation ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        filtered[selectedIdx]?.action();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, filtered, selectedIdx, handleClose]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — kept light so app content shows through the panel's backdrop-filter */}
          <motion.div
            key="palette-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]"
            onClick={handleClose}
          />

          {/* Panel — no scale animation so Grainient canvas sizes correctly */}
          <motion.div
            key="palette-panel"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-[15vh] z-50 w-full max-w-xl -translate-x-1/2"
          >
            {/* ── Grainy frosted glass surface ── */}
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10"
              style={{ backdropFilter: 'blur(22px) saturate(180%)', WebkitBackdropFilter: 'blur(22px) saturate(180%)' }}
            >
              {/* Grainient background */}
              <div className={`absolute inset-0 pointer-events-none overflow-hidden ${isDark ? 'opacity-55' : 'opacity-70'}`}>
                <Grainient
                  color1={color1}
                  color2={color2}
                  color3={color3}
                  timeSpeed={0}
                  colorBalance={0}
                  warpStrength={0}
                  warpFrequency={9.9}
                  warpSpeed={0}
                  warpAmplitude={50}
                  blendAngle={45}
                  blendSoftness={1}
                  rotationAmount={0}
                  noiseScale={2.1}
                  grainAmount={0.17}
                  grainScale={2}
                  grainAnimated={false}
                  contrast={1.5}
                  gamma={1}
                  saturation={1}
                  centerX={0}
                  centerY={0}
                  zoom={1.4}
                />
              </div>
              {/* Scrim */}
              <div className={`absolute inset-0 pointer-events-none ${isDark ? 'bg-black/15' : 'bg-white/35'}`} />

              {/* ── All content above the glass ── */}
              <div className="relative z-10">
                {/* Search input */}
                <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search commands, conversations, profiles…"
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <kbd className="hidden rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground/60 sm:inline">
                    Esc
                  </kbd>
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
                  {filtered.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground/50 italic">
                      No commands found
                    </p>
                  ) : (() => {
                    let flatIdx = 0;
                    return Array.from(grouped.entries()).map(([group, cmds]) => (
                      <div key={group} className="mb-1">
                        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                          {group}
                        </p>
                        {cmds.map((cmd) => {
                          const idx = flatIdx++;
                          const isSelected = idx === selectedIdx;
                          return (
                            <button
                              key={cmd.id}
                              data-idx={idx}
                              onClick={cmd.action}
                              onMouseEnter={() => setSelectedIdx(idx)}
                              className={`flex w-full items-center gap-3 rounded-lg mx-1 px-3 py-2.5 text-left transition-all duration-100 ${
                                isSelected ? 'text-foreground' : 'text-foreground/80 hover:bg-muted/25'
                              }`}
                              style={isSelected ? {
                                width: 'calc(100% - 8px)',
                                background: 'linear-gradient(135deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.18) 0%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.10) 100%)',
                                border: '1px solid hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.30)',
                                boxShadow: '0 2px 10px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
                              } : {
                                // Always reserve border space so layout never shifts on hover
                                width: 'calc(100% - 8px)',
                                border: '1px solid transparent',
                              }}
                            >
                              <span className={`shrink-0 ${isSelected ? 'text-[var(--accent)]' : 'text-muted-foreground/60'}`}>
                                {cmd.icon}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">{cmd.label}</span>
                                {cmd.description && (
                                  <span className="block truncate text-[11px] text-muted-foreground/60">
                                    {cmd.description}
                                  </span>
                                )}
                              </span>
                              {isSelected && (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>

                {/* Footer hint */}
                <div className="flex items-center justify-between border-t border-border/40 px-4 py-2">
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
                    <span className="flex items-center gap-1">
                      <kbd className="rounded border border-border/60 bg-muted/40 px-1">↑↓</kbd> navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="rounded border border-border/60 bg-muted/40 px-1">↵</kbd> select
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="rounded border border-border/60 bg-muted/40 px-1">Esc</kbd> close
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/40">
                    {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
