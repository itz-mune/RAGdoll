import { useEffect, useRef, useState } from 'react';
import { MainLogo } from '@/components/ui/MainLogo';
import {
  ArrowLeft, Settings, Cpu, Brain, Palette, Keyboard, Info,
  Trash2, Download, Sun, Moon, Monitor, RefreshCw, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ModelProfilesSection } from './ModelProfilesSection';
import { MemoryBrowser } from '@/components/memory/MemoryBrowser';
import { chatStore } from '@/store/chatStore';
import { getAppSettings, setAppSettings, type AppSettings } from '@/lib/store';
import { tray } from '@/lib/tray';
import { profileStore } from '@/store/profileStore';
import { cn } from '@/lib/utils';
import { ACCENT_PRESETS, setAccentPreset, setAccentFromHex, getAccentColor, hslToHex } from '@/lib/accent';
import { toast } from '@/lib/toast';

const SIDECAR_URL = 'http://127.0.0.1:8765';

type Section = 'general' | 'profiles' | 'memory' | 'appearance' | 'shortcuts' | 'about';

const NAV_ITEMS: { id: Section; label: string; icon: typeof Settings }[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'profiles', label: 'Model Profiles', icon: Cpu },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
];

const SHORTCUTS = [
  { action: 'Command palette', keys: 'Ctrl+K' },
  { action: 'New chat', keys: 'Ctrl+N' },
  { action: 'Dashboard', keys: 'Ctrl+H' },
  { action: 'Open settings', keys: 'Ctrl+,' },
  { action: 'Marketplace', keys: 'Ctrl+M' },
  { action: 'Memory browser', keys: 'Ctrl+Shift+M' },
  { action: 'Focus chat input', keys: 'Ctrl+L' },
  { action: 'Switch profile', keys: 'Ctrl+P' },
  { action: 'Close / Back', keys: 'Escape' },
];

// ── Section content components ────────────────────────────────────────────────

function GeneralSection() {
  const profiles = profileStore((s) => s.profiles);
  const activeProfileId = profileStore((s) => s.activeProfileId);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(false);

  useEffect(() => {
    getAppSettings().then(setSettings);
    tray.getAutostartEnabled().then(setAutostart).catch(() => {});
  }, []);

  const save = async (updates: Partial<AppSettings>) => {
    await setAppSettings(updates);
    setSettings((s) => (s ? { ...s, ...updates } : null));
  };

  const handleClearAll = async () => {
    if (!confirm('Delete ALL conversations? This cannot be undone.')) return;
    setClearing(true);
    try {
      // Delete all from sidecar DB
      const convs = chatStore.getState().conversations;
      await Promise.allSettled(
        convs.map((c) =>
          fetch(`${SIDECAR_URL}/conversations/${c.id}`, { method: 'DELETE' })
        )
      );
      chatStore.getState().clearAll();
    } finally {
      setClearing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const conversations = chatStore.getState().conversations;
      const allMessages = chatStore.getState().messages;
      const payload = conversations.map((c) => ({
        ...c,
        messages: allMessages[c.id] ?? [],
      }));
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ragdoll-conversations-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (!settings) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-8 p-6">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">App-wide preferences</p>
      </div>

      {/* Default profile */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Default profile for new chats</label>
        <select
          value={activeProfileId ?? ''}
          onChange={(e) => profileStore.getState().setActiveProfile(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>

      {/* Send shortcut */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Send message shortcut</label>
        <div className="flex gap-2">
          {(['Enter', 'Ctrl+Enter'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => save({ sendOnEnter: opt === 'Enter' })}
              className={cn(
                'rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors',
                (opt === 'Enter') === settings.sendOnEnter
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80'
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Markdown preview */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Markdown preview in input</label>
        <p className="text-xs text-muted-foreground">
          When enabled, the message box renders markdown while you're not typing. Click to edit.
        </p>
        <button
          onClick={() => save({ mdPreview: !settings.mdPreview })}
          role="switch"
          aria-checked={settings.mdPreview}
          className={cn(
            'relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            settings.mdPreview ? 'bg-primary' : 'bg-muted-foreground/25',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
              settings.mdPreview ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>

      {/* Minimize to tray on close */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Minimize to tray on close</label>
        <p className="text-xs text-muted-foreground">
          Clicking × hides RAGdoll to the system tray instead of quitting.
        </p>
        <button
          onClick={async () => {
            if (!settings) return;
            const next = !settings.closeToTray;
            await setAppSettings({ closeToTray: next });
            setSettings((s) => s ? { ...s, closeToTray: next } : null);
            await tray.setCloseToTray(next);
            toast.success('Setting saved');
          }}
          role="switch"
          aria-checked={settings?.closeToTray ?? true}
          className={cn(
            'relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            (settings?.closeToTray ?? true) ? 'bg-primary' : 'bg-muted-foreground/25',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
              (settings?.closeToTray ?? true) ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>

      {/* Launch on startup */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Launch RAGdoll on system startup</label>
        <p className="text-xs text-muted-foreground">
          RAGdoll will start automatically when you log in.
        </p>
        <button
          onClick={async () => {
            if (autostartLoading) return;
            setAutostartLoading(true);
            try {
              const next = !autostart;
              await tray.setAutostartEnabled(next);
              setAutostart(next);
              toast.success(next ? 'RAGdoll will launch on startup' : 'Startup launch disabled');
            } catch {
              toast.error('Failed to update startup setting');
            } finally {
              setAutostartLoading(false);
            }
          }}
          role="switch"
          aria-checked={autostart}
          disabled={autostartLoading}
          className={cn(
            'relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            autostartLoading ? 'opacity-50 cursor-not-allowed' : '',
            autostart ? 'bg-primary' : 'bg-muted-foreground/25',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
              autostart ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>

      {/* Danger zone */}
      <div className="space-y-3 rounded-xl border border-destructive/30 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-destructive/70">Danger Zone</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearAll}
            disabled={clearing}
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {clearing ? 'Clearing…' : 'Clear all conversations'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Exporting…' : 'Export as JSON'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Memory Browser Modal ──────────────────────────────────────────────────────

function MemoryBrowserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="relative flex h-[680px] w-[760px] max-h-[90vh] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl"
      >
        {/* Modal header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Memory Browser</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Browser content fills the rest */}
        <div className="flex-1 overflow-hidden">
          <MemoryBrowser />
        </div>
      </motion.div>
    </div>
  );
}

function MemorySection({ onOpenMemoryBrowser }: { onOpenMemoryBrowser?: () => void }) {
  void onOpenMemoryBrowser; // kept for compat; modal is now self-contained
  const [memoryBrowserOpen, setMemoryBrowserOpen] = useState(false);
  const [stats, setStats] = useState<{
    semantic_count: number;
    document_count: number;
    total_size_mb: number;
  } | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [clearConfirm, setClearConfirm] = useState('');
  const [_clearDocsOpen, _setClearDocsOpen] = useState(false);

  useEffect(() => {
    fetch(`${SIDECAR_URL}/memory/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const handleCompact = async () => {
    setCompacting(true);
    try {
      await fetch(`${SIDECAR_URL}/memory/compact`, { method: 'POST' });
      const r = await fetch(`${SIDECAR_URL}/memory/stats`);
      if (r.ok) setStats(await r.json());
      toast.success('Memory optimised');
    } catch {
      toast.error('Failed to optimise memory');
    } finally { setCompacting(false); }
  };

  const handleClearAll = async () => {
    if (clearConfirm.toLowerCase() !== 'clear') return;
    try {
      await fetch(`${SIDECAR_URL}/memory/all`, { method: 'DELETE' });
      setClearConfirm('');
      const r = await fetch(`${SIDECAR_URL}/memory/stats`);
      if (r.ok) setStats(await r.json());
      toast.success('All memories cleared');
    } catch {
      toast.error('Failed to clear memories');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Memory</h2>
        <p className="text-sm text-muted-foreground">
          RAGdoll embeds your conversations and documents into a local vector database.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Memories stored', value: stats?.semantic_count ?? '—' },
          { label: 'Document chunks', value: stats?.document_count ?? '—' },
          { label: 'Storage used', value: stats ? `${stats.total_size_mb} MB` : '—' },
          { label: 'Embedding model', value: 'all-MiniLM-L6-v2' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* Memory browser link */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
        <p className="text-sm font-medium">Knowledge base</p>
        <p className="text-xs text-muted-foreground">
          Browse, search, and manage your stored memories and documents.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMemoryBrowserOpen(true)}
          className="gap-1.5"
        >
          <Brain className="h-3.5 w-3.5" />
          Open Memory Browser
        </Button>
      </div>

      <AnimatePresence>
        {memoryBrowserOpen && (
          <MemoryBrowserModal open={memoryBrowserOpen} onClose={() => setMemoryBrowserOpen(false)} />
        )}
      </AnimatePresence>

      {/* Maintenance */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Maintenance</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCompact}
            disabled={compacting}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', compacting && 'animate-spin')} />
            {compacting ? 'Optimising…' : 'Optimise memory'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Removes duplicate chunks and prunes low-value memories older than 30 days.
        </p>
      </div>

      {/* Danger zone */}
      <div className="space-y-3 rounded-xl border border-destructive/30 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-destructive/70">Danger Zone</p>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Type <strong>clear</strong> then click the button to erase all conversation memories.
            Stored documents are unaffected.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={clearConfirm}
              onChange={(e) => setClearConfirm(e.target.value)}
              placeholder="Type 'clear'"
              className="w-32 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-destructive/40"
            />
            <Button
              variant="destructive"
              size="sm"
              disabled={clearConfirm.toLowerCase() !== 'clear'}
              onClick={handleClearAll}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all memories
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppearanceSection() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // Track current accent as a hex string for the custom picker display
  const [customHex, setCustomHex] = useState<string>(() => {
    const { h, s, l } = getAccentColor();
    const sNum = parseInt(s);
    const lNum = parseInt(l);
    return hslToHex(h, sNum, lNum);
  });

  useEffect(() => {
    getAppSettings().then(setSettings);
  }, []);

  const save = async (updates: Partial<AppSettings>) => {
    await setAppSettings(updates);
    setSettings((s) => (s ? { ...s, ...updates } : null));
    if (updates.theme) applyTheme(updates.theme);
  };

  function applyTheme(theme: AppSettings['theme']) {
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }

  if (!settings) return null;

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">Visual preferences</p>
      </div>

      {/* Theme */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Theme</label>
        <div className="flex gap-2">
          {([['dark', Moon, 'Dark'], ['light', Sun, 'Light'], ['system', Monitor, 'System']] as const).map(
            ([val, Icon, label]) => (
              <button
                key={val}
                onClick={() => save({ theme: val })}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors',
                  settings.theme === val
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          )}
        </div>
      </div>

      {/* Accent color */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Accent color</label>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => { setAccentPreset(preset); setCustomHex(preset.hex); }}
              className="group relative h-7 w-7 rounded-full border-2 border-transparent transition-all hover:scale-110 focus:outline-none"
              style={{ background: preset.hex }}
              title={preset.name}
              aria-label={`Accent: ${preset.name}`}
            >
              <span className="absolute inset-0 rounded-full ring-2 ring-offset-2 ring-offset-background opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}

          {/* Custom colour picker */}
          <div className="relative h-7 w-7">
            <input
              type="color"
              value={customHex}
              onChange={(e) => {
                setCustomHex(e.target.value);
                setAccentFromHex(e.target.value);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer rounded-full border-0 opacity-0"
              title="Custom colour"
              aria-label="Custom accent colour"
            />
            <div
              className="h-7 w-7 rounded-full border-2 border-dashed border-border/60 flex items-center justify-center text-muted-foreground/60 hover:border-foreground/40 transition-colors"
              style={{ background: customHex }}
            >
              <Palette className="h-3 w-3 text-white drop-shadow" />
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Accent colour is applied to active states, buttons, and highlights throughout the app.
        </p>
      </div>

      {/* Font size */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Message font size</label>
        <div className="flex gap-2">
          {(['small', 'medium', 'large'] as const).map((size) => (
            <button
              key={size}
              onClick={() => save({ fontSize: size })}
              className={cn(
                'rounded-lg border-2 px-3 py-2 text-sm font-medium capitalize transition-colors',
                settings.fontSize === size
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80'
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Density */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Message density</label>
        <div className="flex gap-2">
          {(['comfortable', 'compact'] as const).map((density) => (
            <button
              key={density}
              onClick={() => save({ messageDensity: density })}
              className={cn(
                'rounded-lg border-2 px-3 py-2 text-sm font-medium capitalize transition-colors',
                settings.messageDensity === density
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80'
              )}
            >
              {density}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortcutsSection() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
        <p className="text-sm text-muted-foreground">Global keyboard shortcuts</p>
      </div>
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map(({ action, keys }, i) => (
              <tr key={action} className={i % 2 === 0 ? 'bg-muted/20' : ''}>
                <td className="px-4 py-2.5 text-foreground">{action}</td>
                <td className="px-4 py-2.5 text-right">
                  <kbd className="rounded border border-border/60 bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {keys}
                  </kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">About RAGdoll</h2>
        <p className="text-sm text-muted-foreground">Application information</p>
      </div>
      <div className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 border border-accent/20">
            <MainLogo size={28} style={{ color: 'var(--accent)' }} aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-foreground">RAGdoll</p>
            <p className="text-xs text-muted-foreground">Version 0.1.0 · Local-First RAG Intelligence</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Open-source, privacy-first AI chat with local retrieval-augmented generation.
          No telemetry. No cloud. Your data stays on your device.
        </p>

        <a
          href="https://github.com/itz-mune/RAGdoll"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          github.com/itz-mune/RAGdoll →
        </a>

        <div className="border-t border-border/50 pt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled className="gap-1.5 opacity-50">
            Check for updates (coming soon)
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main SettingsPage ─────────────────────────────────────────────────────────

interface SettingsPageProps {
  onBack: () => void;
  initialSection?: Section;
  onOpenMemoryBrowser?: () => void;
}

export function SettingsPage({ onBack, initialSection = 'general', onOpenMemoryBrowser }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<Section>(initialSection);

  const SECTION_CONTENT: Record<Section, React.ReactNode> = {
    general: <GeneralSection />,
    profiles: <ModelProfilesSection />,
    memory: <MemorySection onOpenMemoryBrowser={onOpenMemoryBrowser} />,
    appearance: <AppearanceSection />,
    shortcuts: <ShortcutsSection />,
    about: <AboutSection />,
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <div className="flex h-[53px] shrink-0 items-center gap-3 border-b border-border/50 px-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <span className="text-sm font-semibold text-foreground">Settings</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left nav */}
        <nav className="glass-subtle w-52 shrink-0 overflow-y-auto border-r border-border/50 p-2">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                activeSection === id
                  ? 'font-medium'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
              style={activeSection === id ? {
                background: 'linear-gradient(135deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.18) 0%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.10) 100%)',
                border: '1px solid hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.30)',
                boxShadow: '0 2px 10px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.13), inset 0 1px 0 rgba(255,255,255,0.07)',
                color: 'var(--accent)',
              } : {}}
              aria-current={activeSection === id ? 'page' : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.12 }}
              className="h-full"
            >
              {SECTION_CONTENT[activeSection]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
