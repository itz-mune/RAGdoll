import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import { useSidecarHealth } from './hooks/useSidecarHealth';
import { useTauriOverrides } from './hooks/useTauriOverrides';
import { useUpdater } from './hooks/useUpdater';
import { AppContextMenu } from './components/ui/AppContextMenu';
import { UpdateBanner } from './components/updater/UpdateBanner';
import { hasValidSetup } from './lib/store';
import { FirstRunSetup } from './components/settings/FirstRunSetup';
import { AppShell } from './components/layout/AppShell';
import { SettingsPage } from './components/settings/SettingsPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { profileStore } from './store/profileStore';
import { chatStore } from './store/chatStore';
import { tray } from './lib/tray';
import './App.css';

type AppView = 'shell' | 'settings';

// ── Screens ──────────────────────────────────────────────────────────────────

function SplashScreen({ attempt, stageLabel }: { attempt: number; stageLabel: string }) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">
        {stageLabel !== 'Starting…' ? stageLabel : attempt > 0 ? `Connecting (${attempt})…` : 'Starting sidecar…'}
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
  useTauriOverrides();
  const { status, attempt, stageLabel } = useSidecarHealth();
  const updater = useUpdater();

  // ── Tray event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      tray.onNewChat(() => {
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
            setView('shell');
          })
          .catch(console.error);
      }),
      // tray:quit is handled by std::process::exit on the Rust side;
      // this handler exists for any frontend cleanup if needed in future.
      tray.onQuit(() => {}),
    ];
    return () => {
      unsubs.forEach((p) => p.then((u) => u()));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [setupComplete, setSetupComplete] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [view, setView] = useState<AppView>('shell');
  const [openMemoryOnChat, setOpenMemoryOnChat] = useState(false);

  // ── Check for existing setup after sidecar is ready ──────────────────────
  useEffect(() => {
    if (status !== 'ready') return;
    (async () => {
      try {
        await profileStore.getState().loadProfiles();
        const ok = await hasValidSetup();
        setSetupComplete(ok);

        // Sync persisted tray/profile settings into Rust state
        const { getAppSettings } = await import('./lib/store');
        const appSettings = await getAppSettings();
        tray.setCloseToTray(appSettings.closeToTray).catch(() => {});

        const activeProfile = profileStore.getState().getActiveProfile();
        if (activeProfile) {
          tray.updateTrayProfile(activeProfile.displayName).catch(() => {});
        }
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
        setView((v) => (v === 'settings' ? 'shell' : 'settings'));
      }

      if (mod && e.key === 'n') {
        e.preventDefault();
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
            setView('shell');
          })
          .catch(console.error);
      }

      if (mod && e.key === 'p') {
        e.preventDefault();
        if (view === 'shell') profileStore.getState().openSwitcher();
      }

      if (e.key === 'Escape') {
        profileStore.getState().closeSwitcher();
        if (view === 'settings') setView('shell');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setupComplete, view]);

  // ── Guard states ─────────────────────────────────────────────────────────
  if (status === 'connecting') return <SplashScreen attempt={attempt} stageLabel={stageLabel} />;
  if (status === 'error') return <ErrorScreen />;
  if (checkingSetup) return <SplashScreen attempt={attempt} stageLabel={stageLabel} />;

  if (!setupComplete) {
    return (
      <ErrorBoundary>
        <FirstRunSetup
          onComplete={() => {
            setSetupComplete(true);
            setView('shell');
          }}
        />
      </ErrorBoundary>
    );
  }

  if (view === 'settings') {
    return (
      <ErrorBoundary>
        <SettingsPage
          onBack={() => setView('shell')}
          onOpenMemoryBrowser={() => { setOpenMemoryOnChat(true); setView('shell'); }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <>
      <AppContextMenu />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          classNames: {
            toast: 'glass border border-border/60 text-foreground text-sm',
            title: 'font-medium',
            description: 'text-muted-foreground text-xs',
          },
        }}
      />
      {/* Update banner — fixed top overlay, slides in when a new version is ready */}
      <AnimatePresence>
        {updater.available && <UpdateBanner key="update-banner" updater={updater} />}
      </AnimatePresence>
      <ErrorBoundary>
        <AppShell
          onOpenSettings={() => setView('settings')}
          defaultMemoryBrowserOpen={openMemoryOnChat}
          onMemoryBrowserOpened={() => setOpenMemoryOnChat(false)}
        />
      </ErrorBoundary>
    </>
  );
}
