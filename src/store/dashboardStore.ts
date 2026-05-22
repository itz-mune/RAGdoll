import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const SIDECAR_URL = 'http://127.0.0.1:8765';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayCount {
  date: string;  // YYYY-MM-DD
  count: number;
}

export interface DayTokens {
  date: string;
  tokens: number;
}

export interface TopSkill {
  name: string;
  count: number;
}

export interface DashboardStats {
  totalMessages: number;
  totalConversations: number;
  totalTokens: number;
  avgResponseMs: number | null;
  messagesPerDay: DayCount[];
  tokensPerDay: DayTokens[];
  topSkills: TopSkill[];
  avgTokensPerMessage: number | null;
}

export interface ActivityItem {
  id: string;
  conversationId: string;
  conversationTitle: string;
  snippet: string;
  createdAt: number;
  toolCallsUsed: string[];
}

export interface PinnedConversation {
  id: string;
  title: string;
  provider: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface DashboardStore {
  // Persisted
  pinnedConversationIds: string[];

  // Fetched data
  stats: DashboardStats | null;
  activity: ActivityItem[];
  pinnedConversations: PinnedConversation[];
  statsLoading: boolean;
  activityLoading: boolean;
  pinnedLoading: boolean;
  lastFetchedAt: number | null;

  // Actions
  pinConversation: (id: string) => void;
  unpinConversation: (id: string) => void;
  isPinned: (id: string) => boolean;
  fetchStats: (days?: number) => Promise<void>;
  fetchActivity: () => Promise<void>;
  fetchPinned: () => Promise<void>;
  refreshAll: (days?: number) => Promise<void>;
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({
      pinnedConversationIds: [],
      stats: null,
      activity: [],
      pinnedConversations: [],
      statsLoading: false,
      activityLoading: false,
      pinnedLoading: false,
      lastFetchedAt: null,

      pinConversation: (id) =>
        set((s) => ({
          pinnedConversationIds: s.pinnedConversationIds.includes(id)
            ? s.pinnedConversationIds
            : [id, ...s.pinnedConversationIds],
        })),

      unpinConversation: (id) =>
        set((s) => ({
          pinnedConversationIds: s.pinnedConversationIds.filter((p) => p !== id),
        })),

      isPinned: (id) => get().pinnedConversationIds.includes(id),

      fetchStats: async (days = 30) => {
        set({ statsLoading: true });
        try {
          const r = await fetch(`${SIDECAR_URL}/dashboard/stats?days=${days}`);
          const data: DashboardStats = await r.json();
          set({ stats: data, lastFetchedAt: Date.now() });
        } catch {
          // non-fatal
        } finally {
          set({ statsLoading: false });
        }
      },

      fetchActivity: async () => {
        set({ activityLoading: true });
        try {
          const r = await fetch(`${SIDECAR_URL}/dashboard/activity?limit=20`);
          const data: ActivityItem[] = await r.json();
          set({ activity: data });
        } catch {
          // non-fatal
        } finally {
          set({ activityLoading: false });
        }
      },

      fetchPinned: async () => {
        const ids = get().pinnedConversationIds;
        if (!ids.length) {
          set({ pinnedConversations: [] });
          return;
        }
        set({ pinnedLoading: true });
        try {
          const r = await fetch(`${SIDECAR_URL}/dashboard/pinned`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });
          const data: PinnedConversation[] = await r.json();
          set({ pinnedConversations: data });
        } catch {
          // non-fatal
        } finally {
          set({ pinnedLoading: false });
        }
      },

      refreshAll: async (days = 30) => {
        const { fetchStats, fetchActivity, fetchPinned } = get();
        await Promise.all([fetchStats(days), fetchActivity(), fetchPinned()]);
      },
    }),
    {
      name: 'ragdoll-dashboard',
      partialize: (s) => ({
        pinnedConversationIds: s.pinnedConversationIds,
        stats: s.stats,
        activity: s.activity,
        pinnedConversations: s.pinnedConversations,
        lastFetchedAt: s.lastFetchedAt,
      }),
    }
  )
);

// Convenience alias
export const dashboardStore = useDashboardStore;
