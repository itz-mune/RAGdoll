import { useEffect, useRef, useState } from 'react';
import { Copy, ThumbsUp, ThumbsDown, ChevronDown, Check, FileText, FileSpreadsheet, Braces, FileCode, Quote } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { chatStore, type Message } from '@/store/chatStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChat } from '@/hooks/useChat';

const SUGGESTED_PROMPTS = [
  'Summarize a document',
  'Help me write something',
  'Explain a concept',
  'Answer questions from my notes',
] as const;

export function MessageThread() {
  const activeConversationId = chatStore((state) => state.activeConversationId);
  const messages = chatStore((state) =>
    activeConversationId ? (state.messages[activeConversationId] ?? []) : []
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Ref tracks the real-time scroll position; state drives the UI button only.
  // Using state alone in the effect dep array caused a loop: scroll → handleScroll
  // → setIsAtBottom → effect re-fires → scroll again → repeat.
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { sendMessage } = useChat();

  // Auto-scroll only when messages change; read position from ref, not state.
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsAtBottom(true);
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold">What can I help you with?</h2>
          <p className="text-sm text-muted-foreground">
            Ask anything — or pick a prompt below to get started.
          </p>
        </div>
        <div className="grid w-full max-w-lg grid-cols-2 gap-2">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-6"
      >
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      <AnimatePresence>
        {!isAtBottom && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2"
          >
            <button
              onClick={scrollToBottom}
              className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-md transition-colors hover:text-foreground"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Scroll to bottom
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── File icon helper ─────────────────────────────────────────────────────────

function FileAttachIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return <FileText className="h-2.5 w-2.5 shrink-0 text-red-400" />;
  if (ext === 'csv') return <FileSpreadsheet className="h-2.5 w-2.5 shrink-0 text-green-400" />;
  if (ext === 'json') return <Braces className="h-2.5 w-2.5 shrink-0 text-yellow-400" />;
  if (ext === 'md') return <FileCode className="h-2.5 w-2.5 shrink-0 text-blue-400" />;
  return <FileText className="h-2.5 w-2.5 shrink-0" />;
}

// ─── Individual message bubble ────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const activeConversationId = chatStore((state) => state.activeConversationId);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleFeedback = (feedback: 'up' | 'down') => {
    if (!activeConversationId) return;
    chatStore.getState().setMessageFeedback(activeConversationId, message.id, feedback);
  };

  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'group relative max-w-[72%] rounded-xl px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'border border-border/50 bg-muted/40 text-foreground'
        )}
      >
        {/* Markdown content */}
        <div
          className={cn(
            'prose-sm max-w-none break-words text-sm leading-relaxed',
            '[&_p]:mb-2 [&_p:last-child]:mb-0',
            '[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-4',
            '[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4',
            '[&_li]:mb-0.5',
            '[&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold',
            '[&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold',
            '[&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-medium',
            '[&_blockquote]:border-l-2 [&_blockquote]:border-current/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-current/70',
            '[&_table]:w-full [&_table]:border-collapse [&_table]:text-xs',
            '[&_th]:border [&_th]:border-current/20 [&_th]:bg-current/5 [&_th]:p-1.5 [&_th]:text-left',
            '[&_td]:border [&_td]:border-current/20 [&_td]:p-1.5',
            '[&_hr]:border-current/20 [&_hr]:my-3',
            isUser ? 'text-primary-foreground' : 'text-foreground'
          )}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // v9-compatible code renderer — no `inline` prop
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className ?? '');
                if (match) {
                  return (
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{
                        borderRadius: '0.5rem',
                        fontSize: '0.75rem',
                        margin: '0.5rem 0',
                        padding: '0.75rem',
                      }}
                      {...(props as object)}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  );
                }
                return (
                  <code
                    className={cn(
                      'rounded px-1 py-0.5 font-mono text-[0.8em]',
                      isUser ? 'bg-primary-foreground/15' : 'bg-black/20',
                      className
                    )}
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Attached files (user messages) */}
        {isUser && message.attachedFileNames && message.attachedFileNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 border-t border-primary-foreground/20 pt-2">
            {message.attachedFileNames.map((name) => (
              <span
                key={name}
                className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[10px] font-medium"
              >
                <FileAttachIcon name={name} />
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Typing indicator — dots before any text arrives */}
        {message.isStreaming && !message.content && (
          <span className="flex items-center gap-1 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:300ms]" />
          </span>
        )}
        {/* Blinking cursor once text has started */}
        {message.isStreaming && message.content && (
          <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-current align-middle" />
        )}

        {/* Assistant toolbar (visible on hover) */}
        {!isUser && !message.isStreaming && (
          <div className="mt-2 flex items-center gap-1 border-t border-border/30 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => handleCopy(message.content)}
              className="h-6 gap-1 px-1.5 text-[11px]"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <div className="flex gap-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleFeedback('up')}
                className={cn(
                  'h-6 w-6',
                  message.feedback === 'up' && 'text-green-500'
                )}
              >
                <ThumbsUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleFeedback('down')}
                className={cn(
                  'h-6 w-6',
                  message.feedback === 'down' && 'text-destructive'
                )}
              >
                <ThumbsDown className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Citation chips */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Quote className="h-2.5 w-2.5 shrink-0 text-blue-400/70" />
            {message.citations.map((fname) => (
              <span
                key={fname}
                className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400 ring-1 ring-blue-500/20"
              >
                <FileAttachIcon name={fname} />
                {fname}
              </span>
            ))}
          </div>
        )}

        {/* Memory badge */}
        {message.memoryChunks && message.memoryChunks.length > 0 && (
          <div className="mt-2 inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {message.memoryChunks.length}{' '}
            {message.memoryChunks.length === 1 ? 'source' : 'sources'} used
          </div>
        )}
      </div>
    </motion.div>
  );
}
