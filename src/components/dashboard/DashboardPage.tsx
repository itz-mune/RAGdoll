import { useEffect, useCallback } from 'react';
import { RefreshCw, MessageSquare, Hash, Zap, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dashboardStore } from '@/store/dashboardStore';
import { chatStore } from '@/store/chatStore';
import { profileStore } from '@/store/profileStore';
import { StatCard } from './StatCard';
import { MessagesChart } from './MessagesChart';
import { TokensChart } from './TokensChart';
import { TopSkillsCard } from './TopSkillsCard';
import { RecentActivityFeed } from './RecentActivityFeed';
import { PinnedConversations } from './PinnedConversations';
import { WelcomeBanner } from './WelcomeBanner';
import { SidebarStats } from './SidebarStats';

const SIDECAR_URL = 'http://127.0.0.1:8765';

interface DashboardPageProps {
  onOpenConversation: (id: string) => void;
  hasConversations: boolean;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function DashboardPage({ onOpenConversation, hasConversations }: DashboardPageProps) {
  const stats = dashboardStore((s) => s.stats);
  const activity = dashboardStore((s) => s.activity);
  const pinnedConversations = dashboardStore((s) => s.pinnedConversations);
  const statsLoading = dashboardStore((s) => s.statsLoading);
  const activityLoading = dashboardStore((s) => s.activityLoading);
  const pinnedLoading = dashboardStore((s) => s.pinnedLoading);
  const pinnedIds = dashboardStore((s) => s.pinnedConversationIds);
  const profile = profileStore((s) => s.getActiveProfile());

  // Fetch all data on mount
  useEffect(() => {
    dashboardStore.getState().refreshAll(30);
  }, []);

  // Re-fetch pinned whenever the pin list changes
  useEffect(() => {
    dashboardStore.getState().fetchPinned();
  }, [pinnedIds]);

  const handleRefresh = useCallback(() => {
    dashboardStore.getState().refreshAll(30);
  }, []);

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
      onOpenConversation(conv.id);
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
      onOpenConversation(fallback.id);
    }
  }, [onOpenConversation]);

  const isRefreshing = statsLoading || activityLoading;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar — matches the chat top-bar height */}
      <div className="flex h-[53px] shrink-0 items-center justify-between border-b border-border/50 px-4">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
          Dashboard
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <Button size="sm" onClick={handleNewChat} className="gap-1.5 border-0 text-white" style={{ background: 'var(--accent)' }}>
            <MessageSquare className="h-3.5 w-3.5" />
            New chat
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6 space-y-6">

          {/* Welcome banner (no conversations yet) */}
          {!hasConversations ? (
            <WelcomeBanner profile={profile} onNewChat={handleNewChat} />
          ) : (
            <div className="border-l-2 pl-3" style={{ borderColor: 'var(--accent-40)' }}>
              <h2 className="text-xl font-bold">{greeting()} 👋</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Here's your RAGdoll activity overview.
              </p>
            </div>
          )}

          {/* Pinned conversations */}
          <PinnedConversations
            conversations={pinnedConversations}
            loading={pinnedLoading}
            onOpenConversation={onOpenConversation}
          />

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Messages"
              value={stats ? stats.totalMessages.toLocaleString() : null}
              icon={<MessageSquare className="h-4 w-4" />}
              loading={statsLoading}
              color="blue"
            />
            <StatCard
              label="Conversations"
              value={stats ? stats.totalConversations.toLocaleString() : null}
              icon={<Hash className="h-4 w-4" />}
              loading={statsLoading}
              color="purple"
            />
            <StatCard
              label="Tokens used"
              value={stats ? fmtTokens(stats.totalTokens) : null}
              subValue={stats?.avgTokensPerMessage ? `~${stats.avgTokensPerMessage.toLocaleString()} avg/msg` : undefined}
              icon={<Zap className="h-4 w-4" />}
              loading={statsLoading}
              color="amber"
            />
            <StatCard
              label="Avg response"
              value={stats ? fmtMs(stats.avgResponseMs) : null}
              icon={<Clock className="h-4 w-4" />}
              loading={statsLoading}
              color="green"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MessagesChart data={stats?.messagesPerDay ?? []} loading={statsLoading} />
            <TokensChart   data={stats?.tokensPerDay ?? []} loading={statsLoading} />
          </div>

          {/* Bottom row — activity feed + right column */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-start">
            <div className="md:col-span-2">
              <RecentActivityFeed
                items={activity}
                loading={activityLoading}
                onOpenConversation={onOpenConversation}
              />
            </div>
            {/* Right column: skills + memory + profile, all hugging their content */}
            <div className="space-y-3">
              <TopSkillsCard skills={stats?.topSkills ?? []} loading={statsLoading} />
              <SidebarStats />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
