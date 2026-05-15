import { useCallback, useState } from 'react';
import { Brain, Plus, Trash2, Settings, Puzzle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { chatStore, type Conversation } from '@/store/chatStore';
import { profileStore } from '@/store/profileStore';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const SIDECAR_URL = 'http://127.0.0.1:8765';

const ONE_DAY = 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * ONE_DAY;

interface SidebarProps {
  onOpenSettings: () => void;
  onOpenMemory?: () => void;
  onOpenMarketplace?: () => void;
  pluginUpdateCount?: number;
}

export function Sidebar({ onOpenSettings, onOpenMemory, onOpenMarketplace, pluginUpdateCount = 0 }: SidebarProps) {
  const conversations = chatStore((state) => state.conversations);
  const activeConversationId = chatStore((state) => state.activeConversationId);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleNewChat = useCallback(async () => {
    const profile = profileStore.getState().getActiveProfile();
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
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    chatStore.getState().setActiveConversation(id);
  }, []);

  const requestDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;

    try {
      await fetch(`${SIDECAR_URL}/conversations/${id}`, { method: 'DELETE' });
    } catch { /* non-fatal */ }

    chatStore.getState().deleteConversation(id);

    if (activeConversationId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      chatStore.getState().setActiveConversation(remaining[0]?.id ?? null);
    }
  }, [pendingDeleteId, activeConversationId, conversations]);

  const now = Date.now();
  const grouped = {
    today: conversations.filter((c) => now - c.updatedAt < ONE_DAY),
    yesterday: conversations.filter((c) => now - c.updatedAt >= ONE_DAY && now - c.updatedAt < 2 * ONE_DAY),
    week: conversations.filter((c) => now - c.updatedAt >= 2 * ONE_DAY && now - c.updatedAt < SEVEN_DAYS),
    older: conversations.filter((c) => now - c.updatedAt >= SEVEN_DAYS),
  };

  const pendingConv = pendingDeleteId ? conversations.find((c) => c.id === pendingDeleteId) : null;

  return (
    <>
      <div className="flex w-60 shrink-0 flex-col border-r border-border/50 bg-sidebar overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b border-border/50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <span className="text-[10px] font-bold leading-none text-primary-foreground">RD</span>
            </div>
            <span className="text-sm font-semibold">RAGdoll</span>
          </div>
          <Button onClick={handleNewChat} className="w-full gap-2" variant="outline" size="sm">
            <Plus className="h-3.5 w-3.5" />
            New chat
          </Button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No conversations yet.
              <br />
              Start one above.
            </p>
          ) : (
            <div className="p-2 space-y-0.5">
              <ConvGroup label="Today" convs={grouped.today} activeId={activeConversationId} onSelect={handleSelectConversation} onDelete={requestDelete} />
              <ConvGroup label="Yesterday" convs={grouped.yesterday} activeId={activeConversationId} onSelect={handleSelectConversation} onDelete={requestDelete} />
              <ConvGroup label="Previous 7 days" convs={grouped.week} activeId={activeConversationId} onSelect={handleSelectConversation} onDelete={requestDelete} />
              <ConvGroup label="Older" convs={grouped.older} activeId={activeConversationId} onSelect={handleSelectConversation} onDelete={requestDelete} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border/50 p-3 space-y-0.5">
          {onOpenMemory && (
            <Button
              onClick={onOpenMemory}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
            >
              <Brain className="h-3.5 w-3.5" />
              Memory
            </Button>
          )}
          {onOpenMarketplace && (
            <Button
              onClick={onOpenMarketplace}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
            >
              <Puzzle className="h-3.5 w-3.5" />
              Marketplace
              {pluginUpdateCount > 0 && (
                <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                  {pluginUpdateCount}
                </span>
              )}
            </Button>
          )}
          <Button
            onClick={onOpenSettings}
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </Button>
        </div>
      </div>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConv
                ? <>&#8220;{pendingConv.title}&#8221; will be permanently deleted.</>
                : 'This conversation will be permanently deleted.'}
              {' '}This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConvGroup({
  label,
  convs,
  activeId,
  onSelect,
  onDelete,
}: {
  label: string;
  convs: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}) {
  if (convs.length === 0) return null;
  return (
    <>
      <p className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
      {convs.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={`group w-full rounded-md px-2 py-2 text-left text-sm transition-colors ${
            conv.id === activeId
              ? 'bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          }`}
        >
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium leading-tight">{conv.title}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground/60">
                {formatDistanceToNow(conv.updatedAt, { addSuffix: true })}
              </div>
            </div>
            <button
              onClick={(e) => onDelete(conv.id, e)}
              className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Delete conversation"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-destructive transition-colors" />
            </button>
          </div>
        </button>
      ))}
    </>
  );
}
