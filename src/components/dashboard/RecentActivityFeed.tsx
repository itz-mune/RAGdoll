import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Zap, X, ChevronRight, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { ActivityItem } from '@/store/dashboardStore';

const PREVIEW_COUNT = 5;

interface RecentActivityFeedProps {
  items: ActivityItem[];
  loading?: boolean;
  onOpenConversation: (id: string) => void;
}

export function RecentActivityFeed({ items, loading, onOpenConversation }: RecentActivityFeedProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const preview = items.slice(0, PREVIEW_COUNT);
  const hasMore = items.length > PREVIEW_COUNT;

  return (
    <>
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-3 w-0.5 rounded-full" style={{ background: 'var(--accent-60)' }} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Recent Activity
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: PREVIEW_COUNT }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 italic">No activity yet. Start a conversation!</p>
        ) : (
          <>
            <div className="space-y-0.5">
              {preview.map((item) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  onOpen={() => { onOpenConversation(item.conversationId); }}
                />
              ))}
            </div>

            {hasMore && (
              <button
                onClick={() => setModalOpen(true)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/40 py-2 text-xs text-muted-foreground transition-all duration-150"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-40)';
                (e.currentTarget as HTMLElement).style.background = 'var(--accent-10)';
                (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = '';
                (e.currentTarget as HTMLElement).style.background = '';
                (e.currentTarget as HTMLElement).style.color = '';
              }}
              >
                <Clock className="h-3 w-3" />
                View full history
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Full-history modal ─────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="relative flex w-full max-w-lg flex-col rounded-t-2xl border border-border/60 bg-popover shadow-2xl sm:rounded-2xl max-h-[80vh]">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold">Activity history</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {items.length} responses
                </span>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto p-2">
              {items.map((item) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  onOpen={() => { onOpenConversation(item.conversationId); setModalOpen(false); }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Shared row component ──────────────────────────────────────────────────────

function ActivityRow({ item, onOpen }: { item: ActivityItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-lg px-2 py-2 text-left transition-all duration-150 group"
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-10)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
            {item.conversationTitle}
          </div>
          <div className="mt-0.5 text-xs text-foreground/80 line-clamp-2 leading-relaxed">
            {item.snippet || <span className="italic text-muted-foreground/50">Empty response</span>}
          </div>
          {item.toolCallsUsed.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.toolCallsUsed.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                  style={{ background: 'var(--accent-10)', color: 'var(--accent)' }}
                >
                  <Zap className="h-2 w-2" />{t}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground/50 mt-0.5 whitespace-nowrap">
          {formatDistanceToNow(item.createdAt, { addSuffix: true })}
        </span>
      </div>
    </button>
  );
}
