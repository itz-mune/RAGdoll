import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThinkingBlockProps {
  content: string;
  duration: number | null;   // seconds — null while still streaming
  isStreaming: boolean;
}

export function ThinkingBlock({ content, duration, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const label = isStreaming
    ? 'Thinking…'
    : duration != null
    ? `Thought for ${duration.toFixed(1)}s`
    : 'Thinking complete';

  return (
    <div className="mb-2 rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30"
      >
        {/* Pulsing brain icon while streaming, static once done */}
        <Sparkles
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-primary/70',
            isStreaming && 'animate-[pulse_1.5s_ease-in-out_infinite]',
          )}
        />
        <span className="flex-1 text-[11px] font-medium text-muted-foreground">{label}</span>
        {expanded
          ? <ChevronUp className="h-3 w-3 text-muted-foreground/60" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground/60" />}
      </button>

      {/* Expandable thinking text */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="thinking-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="max-h-[300px] overflow-y-auto border-t border-border/30 bg-muted/10 px-3 py-2.5">
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground/80">
                {content || '…'}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
