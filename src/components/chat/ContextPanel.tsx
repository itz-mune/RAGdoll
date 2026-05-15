import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, FileText, MessageSquare } from 'lucide-react';
import { chatStore, type MemoryChunk, type Message } from '@/store/chatStore';
import { cn } from '@/lib/utils';

interface ContextPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_CHUNKS: MemoryChunk[] = [];

export function ContextPanel({ isOpen, onToggle }: ContextPanelProps) {
  const activeConversationId = chatStore((state) => state.activeConversationId);
  const messages = chatStore((state) =>
    activeConversationId ? (state.messages[activeConversationId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES
  );

  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  const chunks: MemoryChunk[] = lastAssistantMessage?.memoryChunks ?? EMPTY_CHUNKS;

  const semChunks = chunks.filter((c) => c.source === 'conversation');
  const docChunks = chunks.filter((c) => c.source !== 'conversation');

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
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">Memory used</span>
                {chunks.length > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {chunks.length}
                  </span>
                )}
              </div>
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

      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, delay: 0.05 }}
          className="flex-1 overflow-y-auto p-3 space-y-4"
        >
          {chunks.length === 0 ? (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground/70">No memory used</p>
              <p className="leading-relaxed">
                RAGdoll searches your conversation history and documents before each reply.
                Once you have stored memories, relevant context will appear here.
              </p>
            </div>
          ) : (
            <>
              {semChunks.length > 0 && (
                <ChunkSection
                  label="Conversation memory"
                  icon={<MessageSquare className="h-3 w-3" />}
                  chunks={semChunks}
                />
              )}
              {docChunks.length > 0 && (
                <ChunkSection
                  label="Documents"
                  icon={<FileText className="h-3 w-3" />}
                  chunks={docChunks}
                />
              )}
            </>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function ChunkSection({
  label,
  icon,
  chunks,
}: {
  label: string;
  icon: React.ReactNode;
  chunks: MemoryChunk[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {icon}
        {label}
      </div>
      {chunks.map((chunk) => (
        <MemoryChunkCard key={chunk.id} chunk={chunk} />
      ))}
    </div>
  );
}

function MemoryChunkCard({ chunk }: { chunk: MemoryChunk }) {
  const scoreColor =
    chunk.score > 0.8 ? 'bg-green-500' : chunk.score > 0.5 ? 'bg-amber-500' : 'bg-muted-foreground/40';
  const scoreLabel =
    chunk.score > 0.8 ? 'text-green-400' : chunk.score > 0.5 ? 'text-amber-400' : 'text-muted-foreground';
  const isDoc = chunk.source !== 'conversation';

  return (
    <div className="rounded border border-border/50 bg-muted/20 p-2.5 text-xs space-y-1.5">
      {/* Relevance bar */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all', scoreColor)}
            style={{ width: `${chunk.score * 100}%` }}
          />
        </div>
        <span className={cn('tabular-nums', scoreLabel)}>{(chunk.score * 100).toFixed(0)}%</span>
      </div>

      {/* Excerpt */}
      <p className="line-clamp-3 leading-relaxed text-muted-foreground">
        {chunk.text.length > 150 ? chunk.text.slice(0, 150) + '…' : chunk.text}
      </p>

      {/* Source badge */}
      <div className="flex items-center gap-1">
        {isDoc && <FileText className="h-2.5 w-2.5 text-blue-400/70" />}
        <span className={cn(
          'rounded px-1.5 py-0.5 text-[10px]',
          isDoc
            ? 'bg-blue-500/10 text-blue-400'
            : 'bg-muted text-muted-foreground',
        )}>
          {chunk.source}
        </span>
      </div>
    </div>
  );
}
