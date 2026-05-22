import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { PanelRight, X, ArrowLeft } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { PageTransition } from './PageTransition';
import { CommandPalette } from '@/components/command/CommandPalette';
import { MessageThread } from '@/components/chat/MessageThread';
import { ChatInput } from '@/components/chat/ChatInput';
import { ContextPanel } from '@/components/chat/ContextPanel';
import { DragDropZone } from '@/components/chat/DragDropZone';
import { MemoryBrowser } from '@/components/memory/MemoryBrowser';
import { MarketplacePage } from '@/components/marketplace/MarketplacePage';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { usePluginUpdateCount } from '@/hooks/usePluginUpdateCount';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { profileStore } from '@/store/profileStore';
import { chatStore, type Conversation } from '@/store/chatStore';
import { uiStore } from '@/store/uiStore';
import type { AttachedFile } from '@/types/chat';

const SIDECAR_URL = 'http://127.0.0.1:8765';

interface AppShellProps {
  onOpenSettings: () => void;
  defaultMemoryBrowserOpen?: boolean;
  onMemoryBrowserOpened?: () => void;
}

export function AppShell({ onOpenSettings, defaultMemoryBrowserOpen, onMemoryBrowserOpened }: AppShellProps) {
  const contextPanelOpen = uiStore((s) => s.contextPanelOpen);
  const setContextPanelOpen = uiStore((s) => s.setContextPanelOpen);
  const [memoryBrowserOpen, setMemoryBrowserOpen] = useState(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  // Start on dashboard unless the user had a conversation open last time
  const [showDashboard, setShowDashboard] = useState(
    () => !chatStore.getState().activeConversationId,
  );
  const pluginUpdateCount = usePluginUpdateCount();
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<AttachedFile[]>([]);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const activeConversationId = chatStore((state) => state.activeConversationId);
  const conversations = chatStore((state) => state.conversations);
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activeProfile = profileStore((s) => s.getActiveProfile());
  // ChatInput manages its own internal textarea ref and already handles Ctrl+L

  // ── Bootstrap conversations ──────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`${SIDECAR_URL}/conversations`);
        const convs: Conversation[] = await res.json();

        // Defer these state updates — they're non-urgent and trigger large
        // re-render cascades. startTransition lets React paint the shell first.
        const lastId = chatStore.getState().activeConversationId;
        startTransition(() => {
          chatStore.getState().setConversations(convs);
          if (lastId && convs.some((c) => c.id === lastId)) {
            setShowDashboard(false);
          } else {
            chatStore.getState().setActiveConversation(null);
            setShowDashboard(true);
          }
        });
      } catch {
        // non-fatal — still show dashboard
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load messages when conversation changes ──────────────────────────────
  useEffect(() => {
    if (!activeConversationId) return;
    const existing = chatStore.getState().messages[activeConversationId];
    if (existing && existing.length > 0) return;

    fetch(`${SIDECAR_URL}/conversations/${activeConversationId}/messages`)
      .then((r) => r.json())
      .then((msgs) => {
        const mapped = msgs.map((m: Record<string, unknown>) => ({
          ...m,
          toolCallsUsed: (m.toolCallsMade as string[] | null) ?? undefined,
        }));
        // Defer message hydration — non-urgent, large re-render cascade
        startTransition(() => {
          chatStore.getState().setMessages(activeConversationId, mapped);
        });
      })
      .catch(console.error);
  }, [activeConversationId]);

  // ── New chat helper ──────────────────────────────────────────────────────
  const handleNewChat = useCallback(async () => {
    const p = profileStore.getState().getActiveProfile();
    const provider = p?.provider ?? 'openai';
    const model = p?.modelName ?? 'gpt-4o';
    try {
      const res = await fetch(`${SIDECAR_URL}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New conversation', provider, model }),
      });
      const conv = await res.json();
      chatStore.getState().createConversation(conv);
      chatStore.getState().setActiveConversation(conv.id);
      setShowDashboard(false);
    } catch {
      const fallback = {
        id: `conv_${Date.now()}`,
        title: 'New conversation',
        provider,
        model,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
      };
      chatStore.getState().createConversation(fallback);
      chatStore.getState().setActiveConversation(fallback.id);
      setShowDashboard(false);
    }
  }, []);

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useKeyboardShortcuts({
    onNewChat: handleNewChat,
    onOpenSettings,
    onOpenDashboard: () => setShowDashboard(true),
    onOpenMarketplace: () => setMarketplaceOpen(true),
    onOpenMemory: () => setMemoryBrowserOpen(true),
    onEscape: () => {
      if (memoryBrowserOpen) setMemoryBrowserOpen(false);
      else if (marketplaceOpen) setMarketplaceOpen(false);
      else profileStore.getState().closeSwitcher();
    },
  });

  // ── Open memory browser when navigated back from settings ────────────────
  useEffect(() => {
    if (defaultMemoryBrowserOpen) {
      setMemoryBrowserOpen(true);
      onMemoryBrowserOpened?.();
    }
  }, [defaultMemoryBrowserOpen, onMemoryBrowserOpened]);

  // ── Sync title draft ─────────────────────────────────────────────────────
  useEffect(() => {
    setTitleDraft(activeConversation?.title ?? '');
    setTitleEditing(false);
  }, [activeConversation?.title]);

  useEffect(() => {
    if (titleEditing) titleInputRef.current?.focus();
  }, [titleEditing]);

  // ── Title save ───────────────────────────────────────────────────────────
  const handleTitleSave = async () => {
    if (!activeConversationId || !titleDraft.trim()) { setTitleEditing(false); return; }
    const trimmed = titleDraft.trim();
    chatStore.getState().updateConversationTitle(activeConversationId, trimmed);
    setTitleEditing(false);
    try {
      await fetch(`${SIDECAR_URL}/conversations/${activeConversationId}/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
    } catch { /* non-fatal */ }
  };

  // ── Open conversation (from dashboard or sidebar) ─────────────────────────
  const handleOpenConversation = useCallback((id: string) => {
    chatStore.getState().setActiveConversation(id);
    setShowDashboard(false);
  }, []);

  const handleFilesAccepted = useCallback((files: AttachedFile[]) => {
    setPendingFiles((p) => [...p, ...files]);
  }, []);
  const handleDroppedFilesConsumed = useCallback(() => setPendingFiles([]), []);
  const handleDragError = useCallback((msg: string) => console.warn('[DragDrop]', msg), []);

  const handleCommandPaletteNavigate = useCallback((view: 'dashboard' | 'settings' | 'marketplace' | 'memory') => {
    if (view === 'dashboard') setShowDashboard(true);
    else if (view === 'settings') onOpenSettings();
    else if (view === 'marketplace') setMarketplaceOpen(true);
    else if (view === 'memory') setMemoryBrowserOpen(true);
  }, [onOpenSettings]);

  const handleOpenMessage = useCallback((convId: string, messageId: string) => {
    chatStore.getState().setActiveConversation(convId);
    chatStore.getState().setTargetMessageId(messageId);
    setShowDashboard(false);
  }, []);

  return (
    <div className="relative flex h-screen bg-background text-foreground overflow-hidden">
      {/* Command Palette — portal-like, sits above everything */}
      <CommandPalette
        onNavigate={handleCommandPaletteNavigate}
        onOpenConversation={handleOpenConversation}
        onOpenMessage={handleOpenMessage}
        onNewChat={handleNewChat}
      />

      {/* Sidebar — always visible */}
      <Sidebar
        onOpenSettings={onOpenSettings}
        onOpenMemory={() => setMemoryBrowserOpen(true)}
        onOpenMarketplace={() => setMarketplaceOpen(true)}
        onOpenDashboard={() => setShowDashboard(true)}
        onOpenConversation={handleOpenConversation}
        pluginUpdateCount={pluginUpdateCount}
        showDashboard={showDashboard}
      />

      {/* Main content area — dashboard OR chat */}
      {showDashboard ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <PageTransition pageKey="dashboard">
            <DashboardPage
              onOpenConversation={handleOpenConversation}
              hasConversations={conversations.length > 0}
            />
          </PageTransition>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <div className="flex h-[53px] shrink-0 items-center justify-between border-b border-border/50 px-4">
            <div className="min-w-0 flex-1">
              {titleEditing ? (
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTitleSave();
                    if (e.key === 'Escape') { setTitleEditing(false); setTitleDraft(activeConversation?.title ?? ''); }
                  }}
                  className="w-full rounded bg-transparent px-1 py-0.5 text-base font-semibold outline-none ring-1 ring-primary/50 focus:ring-primary"
                />
              ) : (
                <button
                  onClick={() => setTitleEditing(true)}
                  className="max-w-sm truncate rounded px-1 py-0.5 text-base font-semibold hover:bg-muted/40 transition-colors"
                  title="Click to rename"
                >
                  {activeConversation?.title ?? 'New conversation'}
                </button>
              )}
              {activeProfile && (
                <p className="px-1 text-[11px] text-muted-foreground leading-none mt-0.5">
                  {activeProfile.displayName} · {activeProfile.provider} · {activeProfile.modelName}
                </p>
              )}
            </div>

            {/* Context panel toggle */}
            <button
              onClick={() => setContextPanelOpen(!contextPanelOpen)}
              aria-label="Toggle memory panel"
              className={`ml-3 flex h-7 w-7 items-center justify-center rounded transition-colors ${
                contextPanelOpen ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>

          {/* Messages scroll freely; ChatInput floats over the bottom */}
          <DragDropZone
            onFilesAccepted={handleFilesAccepted}
            onError={handleDragError}
          >
            <MessageThread />
            {/* Absolutely-positioned so messages scroll physically behind it,
                enabling the frosted-glass backdrop-filter to have content to blur */}
            <div className="absolute bottom-0 left-0 right-0 z-20">
              <ChatInput
                onNavigateToSettings={onOpenSettings}
                droppedFiles={pendingFiles}
                onDroppedFilesConsumed={handleDroppedFilesConsumed}
              />
            </div>
          </DragDropZone>
        </div>
      )}

      {/* Right context panel */}
      {!showDashboard && (
        <ContextPanel isOpen={contextPanelOpen} onToggle={() => setContextPanelOpen(!contextPanelOpen)} />
      )}

      {/* Marketplace full-page overlay */}
      {marketplaceOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-background">
          <div className="flex h-[53px] shrink-0 items-center gap-3 border-b border-border/50 px-4">
            <button
              onClick={() => setMarketplaceOpen(false)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <MarketplacePage />
          </div>
        </div>
      )}

      {/* Memory browser overlay */}
      {memoryBrowserOpen && (
        <div className="absolute inset-0 z-50 flex items-stretch bg-background/80 backdrop-blur-sm">
          <div className="relative flex w-full max-w-2xl flex-col rounded-r-xl border-r border-y border-border/60 bg-background shadow-2xl">
            <div className="flex h-[53px] shrink-0 items-center justify-between border-b border-border/50 px-4">
              <span className="text-sm font-semibold">Memory Browser</span>
              <button
                onClick={() => setMemoryBrowserOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MemoryBrowser />
            </div>
          </div>
          <div className="flex-1" onClick={() => setMemoryBrowserOpen(false)} />
        </div>
      )}
    </div>
  );
}
