import { useEffect, useState } from 'react';
import {
  ArrowLeft, Settings, Cpu, Brain, Palette, Keyboard, Info,
  Trash2, Download, Sun, Moon, Monitor,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ModelProfilesSection } from './ModelProfilesSection';
import { chatStore } from '@/store/chatStore';
import { getAppSettings, setAppSettings, type AppSettings } from '@/lib/store';
import { profileStore } from '@/store/profileStore';
import { cn } from '@/lib/utils';

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
  { action: 'New chat', keys: 'Ctrl+N' },
  { action: 'Open settings', keys: 'Ctrl+,' },
  { action: 'Focus input', keys: 'Ctrl+L' },
  { action: 'Toggle memory panel', keys: 'Ctrl+M' },
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

  useEffect(() => {
    getAppSettings().then(setSettings);
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

function MemorySection() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Memory</h2>
        <p className="text-sm text-muted-foreground">Semantic memory engine — coming in Task 5</p>
      </div>
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 py-14 text-center">
        <Brain className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="font-semibold text-foreground">Memory Engine — Coming Soon</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
          RAGdoll will automatically embed every conversation turn into a local vector database and surface relevant context in future chats.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          Total memories stored: <strong className="text-foreground">0</strong>
        </div>
      </div>
    </div>
  );
}

function AppearanceSection() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <span className="text-xs font-bold text-primary-foreground">RD</span>
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
          href="https://github.com/ragdoll-app/ragdoll"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          github.com/ragdoll-app/ragdoll →
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
}

export function SettingsPage({ onBack, initialSection = 'general' }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<Section>(initialSection);

  const SECTION_CONTENT: Record<Section, React.ReactNode> = {
    general: <GeneralSection />,
    profiles: <ModelProfilesSection />,
    memory: <MemorySection />,
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
        <nav className="w-52 shrink-0 overflow-y-auto border-r border-border/50 bg-sidebar p-2">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                activeSection === id
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
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
