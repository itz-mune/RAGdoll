import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { chatStore, type MemoryChunk } from '@/store/chatStore';

interface ContextPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function ContextPanel({ isOpen, onToggle }: ContextPanelProps) {
  const activeConversationId = chatStore((state) => state.activeConversationId);
  const messages = chatStore((state) =>
    activeConversationId ? (state.messages[activeConversationId] ?? []) : []
  );

  // Show memory from the last assistant message that has chunks
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  const chunks: MemoryChunk[] = lastAssistantMessage?.memoryChunks ?? [];

  return (
    <motion.div
      animate={{ width: isOpen ? 288 : 32 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="flex flex-col border-l border-border/50 bg-sidebar overflow-hidden"
    >
      {/* Header / toggle strip */}
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 h-[53px] shrink-0">
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.div
              key="open"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="flex w-full items-center justify-between px-3"
            >
              <span className="text-sm font-medium">Memory used</span>
              <button
                onClick={onToggle}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Close memory panel"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="closed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              onClick={onToggle}
              aria-label="Open memory panel"
              className="flex h-full w-full items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              <span className="text-[10px] font-medium tracking-wider uppercase">
                Memory{chunks.length > 0 ? ` (${chunks.length})` : ''}
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Content — only rendered when open to avoid layout issues */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, delay: 0.05 }}
          className="flex-1 overflow-y-auto p-3 space-y-3"
        >
          {chunks.length === 0 ? (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground/70">No memory available yet</p>
              <p className="leading-relaxed">
                RAGdoll will start remembering your conversations after a few exchanges.
              </p>
            </div>
          ) : (
            chunks.map((chunk) => <MemoryChunkCard key={chunk.id} chunk={chunk} />)
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function MemoryChunkCard({ chunk }: { chunk: MemoryChunk }) {
  const scoreColor =
    chunk.score > 0.8
      ? 'bg-green-500'
      : chunk.score > 0.5
        ? 'bg-amber-500'
        : 'bg-muted-foreground/40';

  const scoreLabel =
    chunk.score > 0.8
      ? 'text-green-400'
      : chunk.score > 0.5
        ? 'text-amber-400'
        : 'text-muted-foreground';

  return (
    <div className="rounded border border-border/50 bg-muted/20 p-2.5 text-xs space-y-2">
      {/* Score bar */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${scoreColor} transition-all`}
            style={{ width: `${chunk.score * 100}%` }}
          />
        </div>
        <span className={`tabular-nums ${scoreLabel}`}>{(chunk.score * 100).toFixed(0)}%</span>
      </div>

      {/* Excerpt */}
      <p className="line-clamp-3 leading-relaxed text-muted-foreground">
        {chunk.text.length > 150 ? chunk.text.slice(0, 150) + '…' : chunk.text}
      </p>

      {/* Source badge */}
      <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {chunk.source}
      </span>
    </div>
  );
}
