import { formatDistanceToNow } from 'date-fns';
import { Pin, MessageSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboardStore, type PinnedConversation } from '@/store/dashboardStore';

interface PinnedConversationsProps {
  conversations: PinnedConversation[];
  loading?: boolean;
  onOpenConversation: (id: string) => void;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai:     'bg-green-500/15 text-green-400',
  anthropic:  'bg-orange-500/15 text-orange-400',
  groq:       'bg-yellow-500/15 text-yellow-400',
  google:     'bg-blue-500/15 text-blue-400',
  ollama:     'bg-purple-500/15 text-purple-400',
  openrouter: 'bg-pink-500/15 text-pink-400',
};

export function PinnedConversations({ conversations, loading, onOpenConversation }: PinnedConversationsProps) {
  if (!loading && conversations.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Pin className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Pinned Conversations
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {conversations.map((conv) => (
            <PinnedCard
              key={conv.id}
              conv={conv}
              onOpen={() => onOpenConversation(conv.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PinnedCard({ conv, onOpen }: { conv: PinnedConversation; onOpen: () => void }) {
  const color = PROVIDER_COLORS[conv.provider] ?? 'bg-muted text-muted-foreground';

  return (
    <button
      onClick={onOpen}
      className="group rounded-lg border border-border/40 bg-background p-3 text-left transition-all duration-150"
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-40)';
        (e.currentTarget as HTMLElement).style.background = 'var(--accent-10)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '';
        (e.currentTarget as HTMLElement).style.background = '';
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <p
          className="flex-1 truncate text-xs font-semibold text-foreground leading-tight transition-colors"
          style={{ color: 'inherit' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ''; }}
        >
          {conv.title}
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dashboardStore.getState().unpinConversation(conv.id);
          }}
          className="shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
          title="Unpin"
        >
          <Pin className="h-3 w-3 fill-current" />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${color}`}>
          {conv.provider}
        </span>
        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
          <MessageSquare className="h-2.5 w-2.5" />
          {conv.messageCount}
        </span>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground/60">
        {formatDistanceToNow(conv.updatedAt, { addSuffix: true })}
      </p>
    </button>
  );
}
