import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Plus, Trash2, Settings, Puzzle, LayoutDashboard, Pin, PinOff, Pencil, Search, PanelLeftClose, PanelLeftOpen, MessageSquare } from 'lucide-react';
import { MainLogo } from '@/components/ui/MainLogo';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { toast } from '@/lib/toast';
import Grainient from '@/components/Grainient';
import { useAccentHexes } from '@/lib/accent';
import { formatDistanceToNow } from 'date-fns';
import { chatStore, type Conversation } from '@/store/chatStore';
import { profileStore } from '@/store/profileStore';
import { dashboardStore } from '@/store/dashboardStore';
import { uiStore } from '@/store/uiStore';
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
import * as ContextMenu from '@radix-ui/react-context-menu';

const SIDECAR_URL = 'http://127.0.0.1:8765';

const ONE_DAY = 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * ONE_DAY;

interface SidebarProps {
  onOpenSettings: () => void;
  onOpenMemory?: () => void;
  onOpenMarketplace?: () => void;
  onOpenDashboard?: () => void;
  onOpenConversation?: (id: string) => void;
  pluginUpdateCount?: number;
  showDashboard?: boolean;
}

export function Sidebar({ onOpenSettings, onOpenMemory, onOpenMarketplace, onOpenDashboard, onOpenConversation, pluginUpdateCount = 0, showDashboard = false }: SidebarProps) {
  const openPalette = useCommandPalette((s) => s.open);
  const { color1, color2, color3, isDark } = useAccentHexes();
  const conversations = chatStore((state) => state.conversations);
  const _activeConversationId = chatStore((state) => state.activeConversationId);
  // While on the dashboard no conversation should appear selected
  const activeConversationId = showDashboard ? null : _activeConversationId;
  const pinnedIds = dashboardStore((s) => s.pinnedConversationIds);
  const collapsed = uiStore((s) => s.sidebarCollapsed);
  const sidebarWidth = uiStore((s) => s.sidebarWidth);
  const setCollapsed = uiStore((s) => s.setSidebarCollapsed);
  const setSidebarWidth = uiStore((s) => s.setSidebarWidth);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = collapsed ? 56 : sidebarWidth;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const newWidth = dragStartWidth.current + (ev.clientX - dragStartX.current);
      if (newWidth < 120) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
        setSidebarWidth(Math.min(Math.max(newWidth, 160), 480));
      }
    };

    const onUp = () => {
      dragRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

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
      onOpenConversation?.(newConv.id);
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
      onOpenConversation?.(fallback.id);
    }
  }, [onOpenConversation]);

  const handleSelectConversation = useCallback((id: string) => {
    chatStore.getState().setActiveConversation(id);
    onOpenConversation?.(id);
  }, [onOpenConversation]);

  // Allow other parts of the app (e.g. the context-length error banner) to
  // trigger a new conversation without drilling through prop callbacks.
  useEffect(() => {
    const listener = () => { void handleNewChat(); };
    window.addEventListener('ragdoll:new-conversation', listener);
    return () => window.removeEventListener('ragdoll:new-conversation', listener);
  }, [handleNewChat]);

  const requestDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(async () => {
    const id = pendingDeleteId;
    const conv = conversations.find((c) => c.id === id);
    setPendingDeleteId(null);
    if (!id) return;

    try {
      await fetch(`${SIDECAR_URL}/conversations/${id}`, { method: 'DELETE' });
    } catch { /* non-fatal */ }

    chatStore.getState().deleteConversation(id);
    dashboardStore.getState().unpinConversation(id);

    if (activeConversationId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      chatStore.getState().setActiveConversation(remaining[0]?.id ?? null);
    }

    toast.success(`"${conv?.title ?? 'Conversation'}" deleted`);
  }, [pendingDeleteId, activeConversationId, conversations]);

  const startRename = useCallback((conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameDraft(conv.title);
    setTimeout(() => renameRef.current?.select(), 30);
  }, []);

  const commitRename = useCallback(async () => {
    const id = renamingId;
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!id || !title) return;
    chatStore.getState().updateConversationTitle(id, title);
    try {
      await fetch(`${SIDECAR_URL}/conversations/${id}/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      toast.success('Conversation renamed');
    } catch { /* non-fatal */ }
  }, [renamingId, renameDraft]);

  const now = Date.now();

  // Pinned convs come first (in pin order), then time-grouped below
  const pinnedSet = new Set(pinnedIds);
  const unpinned = conversations.filter((c) => !pinnedSet.has(c.id));
  const pinned = pinnedIds
    .map((id) => conversations.find((c) => c.id === id))
    .filter(Boolean) as Conversation[];

  const grouped = {
    today: unpinned.filter((c) => now - c.updatedAt < ONE_DAY),
    yesterday: unpinned.filter((c) => now - c.updatedAt >= ONE_DAY && now - c.updatedAt < 2 * ONE_DAY),
    week: unpinned.filter((c) => now - c.updatedAt >= 2 * ONE_DAY && now - c.updatedAt < SEVEN_DAYS),
    older: unpinned.filter((c) => now - c.updatedAt >= SEVEN_DAYS),
  };

  const pendingConv = pendingDeleteId ? conversations.find((c) => c.id === pendingDeleteId) : null;

  // ── Icon-only button helper for collapsed rail ───────────────────────────
  const RailBtn = ({ icon, label, onClick, active = false, badge = 0 }: {
    icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; badge?: number;
  }) => (
    <button
      onClick={onClick}
      title={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150"
      style={active ? {
        background: 'linear-gradient(135deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.25) 0%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.14) 100%)',
        border: '1px solid hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.38)',
        color: 'var(--accent)',
      } : { color: 'hsl(var(--muted-foreground))' }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.10)'; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = ''; }}
    >
      {icon}
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[8px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <>
      {/* ── Floating sidebar panel ── */}
      <motion.div
        animate={{ width: collapsed ? 56 : sidebarWidth }}
        transition={isDragging ? { duration: 0 } : { duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex shrink-0 flex-col my-2 ml-2 rounded-xl border border-border/40 shadow-2xl overflow-hidden"
        style={{ backdropFilter: 'blur(18px) saturate(160%)', WebkitBackdropFilter: 'blur(18px) saturate(160%)' }}
      >
        {/* ── Resize handle ── */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute right-0 top-0 bottom-0 z-50 w-3 cursor-col-resize group flex items-center justify-center"
        >
          {/* thin visible bar that glows on hover */}
          <div className="h-full w-px bg-border/0 group-hover:bg-accent/50 transition-colors duration-150" />
        </div>
        {/* Grainient — clipped to this container */}
        <div className={`absolute inset-0 pointer-events-none overflow-hidden rounded-xl ${isDark ? 'opacity-100' : 'opacity-80'}`}>
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
            blendAngle={collapsed ? 90 : 0}
            blendSoftness={1}
            rotationAmount={collapsed ? 0 : 500}
            noiseScale={2.1}
            grainAmount={0.17}
            grainScale={2}
            grainAnimated={false}
            contrast={collapsed ? 1.2 : 1.5}
            gamma={1}
            saturation={collapsed ? 0.8 : 1}
            centerX={0}
            centerY={0}
            zoom={collapsed ? 4 : 0.9}
          />
        </div>
        {/* Scrim — dark in dark mode, white wash in light mode */}
        <div className={`absolute inset-0 pointer-events-none rounded-xl ${isDark ? 'bg-black/50' : 'bg-white/55'}`} />

        {/* ── Content above glass ── */}
        <div className="relative z-10 flex flex-col h-full overflow-hidden">

          {/* ════ COLLAPSED RAIL ════ */}
          {collapsed ? (
            <>
              {/* Rail header */}
              <div className="shrink-0 flex flex-col items-center gap-2 pt-3 pb-2 px-1.5 border-b border-border/40">
                {/* App logo */}
                <MainLogo size={40} style={{ color: 'var(--accent)' }} aria-hidden />
                {/* Expand toggle */}
                <button
                  onClick={() => setCollapsed(false)}
                  title="Expand sidebar"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              </div>

              {/* Rail actions */}
              <div className="flex flex-col items-center gap-1.5 py-2 px-1.5 border-b border-border/40">
                <RailBtn icon={<Plus className="h-4 w-4" />} label="New chat (Ctrl+N)" onClick={handleNewChat} />
                <RailBtn icon={<Search className="h-4 w-4" />} label="Search (Ctrl+K)" onClick={openPalette} />
              </div>

              {/* Rail conversation dots — active conversation indicator */}
              <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2 px-1.5">
                {conversations.slice(0, 12).map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    title={conv.title}
                    className="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150"
                    style={conv.id === activeConversationId ? {
                      background: 'linear-gradient(135deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.25) 0%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.14) 100%)',
                      border: '1px solid hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.38)',
                      color: 'var(--accent)',
                    } : { color: 'hsl(var(--muted-foreground))' }}
                    onMouseEnter={(e) => { if (conv.id !== activeConversationId) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.10)'; }}
                    onMouseLeave={(e) => { if (conv.id !== activeConversationId) (e.currentTarget as HTMLElement).style.background = ''; }}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>

              {/* Rail footer */}
              <div className="shrink-0 flex flex-col items-center gap-1 border-t border-border/40 py-2 px-1.5">
                {onOpenDashboard && (
                  <RailBtn icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard (Ctrl+H)" onClick={onOpenDashboard!} active={showDashboard} />
                )}
                {onOpenMemory && (
                  <RailBtn icon={<Brain className="h-4 w-4" />} label="Memory (Ctrl+Shift+M)" onClick={onOpenMemory!} />
                )}
                {onOpenMarketplace && (
                  <RailBtn icon={<Puzzle className="h-4 w-4" />} label="Marketplace (Ctrl+M)" onClick={onOpenMarketplace!} badge={pluginUpdateCount} />
                )}
                <RailBtn icon={<Settings className="h-4 w-4" />} label="Settings (Ctrl+,)" onClick={onOpenSettings} />
              </div>
            </>
          ) : (
          /* ════ EXPANDED SIDEBAR ════ */
          <>
            {/* Header */}
            <div className="shrink-0 border-b border-border/40 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MainLogo size={40} style={{ color: 'var(--accent)' }} aria-hidden />
                  <span className="text-sm font-semibold">RAGdoll</span>
                </div>
                {/* Collapse toggle */}
                <button
                  onClick={() => setCollapsed(true)}
                  title="Collapse sidebar"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              </div>
              <Button
                onClick={handleNewChat}
                className="w-full gap-2 text-white border-0"
                size="sm"
                style={{ background: 'var(--accent)' }}
              >
                <Plus className="h-3.5 w-3.5" />
                New chat
              </Button>
              <button
                onClick={openPalette}
                className="flex w-full items-center gap-2 rounded-md border border-border/40 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
                aria-label="Open command palette (Ctrl+K)"
              >
                <Search className="h-3 w-3" />
                <span className="flex-1 text-left">Search…</span>
                <kbd className="rounded border border-border/60 bg-background/40 px-1 py-0.5 text-[9px]">Ctrl K</kbd>
              </button>
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
                  {pinned.length > 0 && (
                    <ConvGroup
                      label="Pinned"
                      convs={pinned}
                      activeId={activeConversationId}
                      renamingId={renamingId}
                      renameDraft={renameDraft}
                      renameRef={renameRef}
                      pinnedIds={pinnedIds}
                      onSelect={handleSelectConversation}
                      onDelete={requestDelete}
                      onStartRename={startRename}
                      onRenameDraftChange={setRenameDraft}
                      onCommitRename={commitRename}
                      onCancelRename={() => setRenamingId(null)}
                    />
                  )}
                  <ConvGroup label="Today" convs={grouped.today} activeId={activeConversationId} renamingId={renamingId} renameDraft={renameDraft} renameRef={renameRef} pinnedIds={pinnedIds} onSelect={handleSelectConversation} onDelete={requestDelete} onStartRename={startRename} onRenameDraftChange={setRenameDraft} onCommitRename={commitRename} onCancelRename={() => setRenamingId(null)} />
                  <ConvGroup label="Yesterday" convs={grouped.yesterday} activeId={activeConversationId} renamingId={renamingId} renameDraft={renameDraft} renameRef={renameRef} pinnedIds={pinnedIds} onSelect={handleSelectConversation} onDelete={requestDelete} onStartRename={startRename} onRenameDraftChange={setRenameDraft} onCommitRename={commitRename} onCancelRename={() => setRenamingId(null)} />
                  <ConvGroup label="Previous 7 days" convs={grouped.week} activeId={activeConversationId} renamingId={renamingId} renameDraft={renameDraft} renameRef={renameRef} pinnedIds={pinnedIds} onSelect={handleSelectConversation} onDelete={requestDelete} onStartRename={startRename} onRenameDraftChange={setRenameDraft} onCommitRename={commitRename} onCancelRename={() => setRenamingId(null)} />
                  <ConvGroup label="Older" convs={grouped.older} activeId={activeConversationId} renamingId={renamingId} renameDraft={renameDraft} renameRef={renameRef} pinnedIds={pinnedIds} onSelect={handleSelectConversation} onDelete={requestDelete} onStartRename={startRename} onRenameDraftChange={setRenameDraft} onCommitRename={commitRename} onCancelRename={() => setRenamingId(null)} />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-border/40 p-3 space-y-0.5">
              {onOpenDashboard && (
                <Button
                  onClick={onOpenDashboard}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 transition-all duration-150"
                  style={showDashboard ? {
                    background: 'linear-gradient(135deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.18) 0%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.10) 100%)',
                    border: '1px solid hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.32)',
                    boxShadow: '0 2px 10px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.15), inset 0 1px 0 rgba(255,255,255,0.07)',
                    color: 'var(--accent)',
                  } : {}}
                  aria-current={showDashboard ? 'page' : undefined}
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard
                </Button>
              )}
              {onOpenMemory && (
                <Button onClick={onOpenMemory} variant="ghost" size="sm" className="w-full justify-start gap-2">
                  <Brain className="h-3.5 w-3.5" />
                  Memory
                </Button>
              )}
              {onOpenMarketplace && (
                <Button onClick={onOpenMarketplace} variant="ghost" size="sm" className="w-full justify-start gap-2">
                  <Puzzle className="h-3.5 w-3.5" />
                  Marketplace
                  {pluginUpdateCount > 0 && (
                    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                      {pluginUpdateCount}
                    </span>
                  )}
                </Button>
              )}
              <Button onClick={onOpenSettings} variant="ghost" size="sm" className="w-full justify-start gap-2">
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Button>
            </div>
          </>
          )}
        </div>{/* end z-10 */}
      </motion.div>{/* end floating sidebar */}

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

interface ConvGroupProps {
  label: string;
  convs: Conversation[];
  activeId: string | null;
  renamingId: string | null;
  renameDraft: string;
  renameRef: React.RefObject<HTMLInputElement | null>;
  pinnedIds: string[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onStartRename: (conv: Conversation) => void;
  onRenameDraftChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}

function ConvGroup({
  label, convs, activeId, renamingId, renameDraft, renameRef, pinnedIds,
  onSelect, onDelete, onStartRename, onRenameDraftChange, onCommitRename, onCancelRename,
}: ConvGroupProps) {
  if (convs.length === 0) return null;
  return (
    <>
      <p className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
      {convs.map((conv) => (
        <ConvRow
          key={conv.id}
          conv={conv}
          isActive={conv.id === activeId}
          isRenaming={renamingId === conv.id}
          renameDraft={renameDraft}
          renameRef={renameRef}
          isPinned={pinnedIds.includes(conv.id)}
          onSelect={onSelect}
          onDelete={onDelete}
          onStartRename={onStartRename}
          onRenameDraftChange={onRenameDraftChange}
          onCommitRename={onCommitRename}
          onCancelRename={onCancelRename}
        />
      ))}
    </>
  );
}

interface ConvRowProps {
  conv: Conversation;
  isActive: boolean;
  isRenaming: boolean;
  renameDraft: string;
  renameRef: React.RefObject<HTMLInputElement | null>;
  isPinned: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onStartRename: (conv: Conversation) => void;
  onRenameDraftChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}

function ConvRow({
  conv, isActive, isRenaming, renameDraft, renameRef, isPinned,
  onSelect, onDelete, onStartRename, onRenameDraftChange, onCommitRename, onCancelRename,
}: ConvRowProps) {
  const togglePin = () => {
    if (isPinned) {
      dashboardStore.getState().unpinConversation(conv.id);
    } else {
      dashboardStore.getState().pinConversation(conv.id);
    }
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={`group relative w-full rounded-lg py-2 text-left text-sm cursor-pointer transition-all duration-150 ${
            isActive
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          style={isActive ? {
            background: 'linear-gradient(135deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.18) 0%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.10) 100%)',
            border: '1px solid hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.32)',
            boxShadow: '0 2px 12px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.15), inset 0 1px 0 rgba(255,255,255,0.07)',
            paddingLeft: '8px',
            paddingRight: '8px',
          } : {
            border: '1px solid transparent',
            paddingLeft: '8px',
            paddingRight: '8px',
          }}
          onMouseEnter={(e) => {
            if (!isActive) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.07)';
          }}
          onMouseLeave={(e) => {
            if (!isActive) (e.currentTarget as HTMLElement).style.background = '';
          }}
          onClick={() => !isRenaming && onSelect(conv.id)}
        >
          {isRenaming ? (
            <input
              ref={renameRef}
              value={renameDraft}
              onChange={(e) => onRenameDraftChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitRename();
                if (e.key === 'Escape') onCancelRename();
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded bg-background px-1 py-0.5 text-xs font-medium outline-none ring-1 ring-primary/50 focus:ring-primary text-foreground"
              autoFocus
            />
          ) : (
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium leading-tight flex items-center gap-1">
                  {isPinned && <Pin className="h-2.5 w-2.5 shrink-0 text-primary/60" />}
                  {conv.title}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground/60">
                  {formatDistanceToNow(conv.updatedAt, { addSuffix: true })}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Delete conversation"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-destructive transition-colors" />
              </button>
            </div>
          )}
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          className="z-50 min-w-[160px] overflow-hidden rounded-lg border border-border/60 bg-popover p-1 shadow-xl"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <ContextMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
            onSelect={() => onStartRename(conv)}
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
            Rename
          </ContextMenu.Item>
          <ContextMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
            onSelect={togglePin}
          >
            {isPinned
              ? <><PinOff className="h-3 w-3 text-muted-foreground" /> Unpin</>
              : <><Pin className="h-3 w-3 text-muted-foreground" /> Pin to top</>
            }
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border/40" />
          <ContextMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
            onSelect={() => onDelete(conv.id)}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
