import { useEffect, useState } from 'react';
import { useSidecarHealth } from './hooks/useSidecarHealth';
import { hasValidSetup } from './lib/store';
import { FirstRunSetup } from './components/settings/FirstRunSetup';
import { AppShell } from './components/layout/AppShell';
import { SettingsPage } from './components/settings/SettingsPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { profileStore } from './store/profileStore';
import { chatStore } from './store/chatStore';
import './App.css';

type AppView = 'chat' | 'settings';

// ── Screens ──────────────────────────────────────────────────────────────────

function SplashScreen({ attempt }: { attempt: number }) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">
        {attempt > 0 ? `Connecting to sidecar (${attempt})…` : 'Starting sidecar…'}
      </p>
    </div>
  );
}

function ErrorScreen() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
      <p className="font-medium text-destructive">Sidecar failed to start</p>
      <p className="max-w-xs text-center text-sm text-muted-foreground">
        Make sure <code className="rounded bg-muted px-1 py-0.5 text-xs">uv</code> is installed and
        the Python environment is set up in{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">sidecar/</code>.
      </p>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { status, attempt } = useSidecarHealth();
  const [setupComplete, setSetupComplete] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [view, setView] = useState<AppView>('chat');
  const [openMemoryOnChat, setOpenMemoryOnChat] = useState(false);

  // ── Check for existing setup after sidecar is ready ──────────────────────
  useEffect(() => {
    if (status !== 'ready') return;
    (async () => {
      try {
        await profileStore.getState().loadProfiles();
        const ok = await hasValidSetup();
        setSetupComplete(ok);
      } catch (err) {
        console.error('[App] Setup check failed:', err);
        setSetupComplete(false);
      } finally {
        setCheckingSetup(false);
      }
    })();
  }, [status]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    if (!setupComplete) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === ',') {
        e.preventDefault();
        setView((v) => (v === 'settings' ? 'chat' : 'settings'));
      }

      if (mod && e.key === 'n') {
        e.preventDefault();
        // Delegate new-chat creation to Sidebar's handler via programmatic click,
        // or recreate the logic here using the store.
        const profile = profileStore.getState().getActiveProfile();
        const provider = profile?.provider ?? 'openai';
        const model = profile?.modelName ?? 'gpt-4o';
        fetch('http://127.0.0.1:8765/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'New conversation', provider, model }),
        })
          .then((r) => r.json())
          .then((conv) => {
            chatStore.getState().createConversation(conv);
            chatStore.getState().setActiveConversation(conv.id);
            if (view === 'settings') setView('chat');
          })
          .catch(console.error);
      }

      if (mod && e.key === 'p') {
        e.preventDefault();
        if (view === 'chat') profileStore.getState().openSwitcher();
      }

      if (e.key === 'Escape') {
        profileStore.getState().closeSwitcher();
        if (view === 'settings') setView('chat');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setupComplete, view]);

  // ── Guard states ─────────────────────────────────────────────────────────
  if (status === 'connecting') return <SplashScreen attempt={attempt} />;
  if (status === 'error') return <ErrorScreen />;
  if (checkingSetup) return <SplashScreen attempt={attempt} />;

  if (!setupComplete) {
    return (
      <ErrorBoundary>
        <FirstRunSetup
          onComplete={() => {
            setSetupComplete(true);
            setView('chat');
          }}
        />
      </ErrorBoundary>
    );
  }

  if (view === 'settings') {
    return (
      <ErrorBoundary>
        <SettingsPage
          onBack={() => setView('chat')}
          onOpenMemoryBrowser={() => { setOpenMemoryOnChat(true); setView('chat'); }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell
        onOpenSettings={() => setView('settings')}
        defaultMemoryBrowserOpen={openMemoryOnChat}
        onMemoryBrowserOpened={() => setOpenMemoryOnChat(false)}
      />
    </ErrorBoundary>
  );
}
