import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelRight } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { MessageThread } from '@/components/chat/MessageThread';
import { ChatInput } from '@/components/chat/ChatInput';
import { ContextPanel } from '@/components/chat/ContextPanel';
import { DragDropZone } from '@/components/chat/DragDropZone';
import { profileStore } from '@/store/profileStore';
import { chatStore, type Conversation } from '@/store/chatStore';
import type { AttachedFile } from '@/types/chat';

const SIDECAR_URL = 'http://127.0.0.1:8765';

interface AppShellProps {
  onOpenSettings: () => void;
}

export function AppShell({ onOpenSettings }: AppShellProps) {
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<AttachedFile[]>([]);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const activeConversationId = chatStore((state) => state.activeConversationId);
  const conversations = chatStore((state) => state.conversations);
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activeProfile = profileStore((s) => s.getActiveProfile());

  // ── Bootstrap conversations ──────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`${SIDECAR_URL}/conversations`);
        const convs: Conversation[] = await res.json();
        chatStore.getState().setConversations(convs);

        if (convs.length === 0) {
          await createNewConversation();
        } else {
          chatStore.getState().setActiveConversation(convs[0].id);
        }
      } catch {
        await createNewConversation();
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
      .then((msgs) => chatStore.getState().setMessages(activeConversationId, msgs))
      .catch(console.error);
  }, [activeConversationId]);

  // ── Keyboard: Ctrl+M → toggle context panel ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        setContextPanelOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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

  // Stable callbacks — inline arrows here would get a new reference on every
  // render and cause ChatInput's droppedFiles effect to fire during streaming.
  const handleFilesAccepted = useCallback((files: AttachedFile[]) => {
    setPendingFiles((p) => [...p, ...files]);
  }, []);
  const handleDroppedFilesConsumed = useCallback(() => setPendingFiles([]), []);
  const handleDragError = useCallback((msg: string) => console.warn('[DragDrop]', msg), []);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <Sidebar onOpenSettings={onOpenSettings} />

      {/* Main chat column */}
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
            onClick={() => setContextPanelOpen((v) => !v)}
            aria-label="Toggle memory panel"
            className={`ml-3 flex h-7 w-7 items-center justify-center rounded transition-colors ${
              contextPanelOpen ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>

        {/* Messages + input wrapped in DragDropZone */}
        <DragDropZone
          onFilesAccepted={handleFilesAccepted}
          onError={handleDragError}
        >
          <MessageThread />
          <ChatInput
            onNavigateToSettings={onOpenSettings}
            droppedFiles={pendingFiles}
            onDroppedFilesConsumed={handleDroppedFilesConsumed}
          />
        </DragDropZone>
      </div>

      {/* Right context panel */}
      <ContextPanel isOpen={contextPanelOpen} onToggle={() => setContextPanelOpen((v) => !v)} />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createNewConversation() {
  const { getActiveProfile } = profileStore.getState();
  const profile = getActiveProfile();

  const provider = profile?.provider ?? 'openai';
  const model = profile?.modelName ?? 'gpt-4o';

  try {
    const res = await fetch(`${SIDECAR_URL}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New conversation', provider, model }),
    });
    const newConv: Conversation = await res.json();
    chatStore.getState().createConversation(newConv);
    chatStore.getState().setActiveConversation(newConv.id);
  } catch {
    const fallback: Conversation = {
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
  }
}
