import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, ThumbsUp, ThumbsDown, ChevronDown, Check, FileText, FileSpreadsheet, Braces, FileCode, RotateCcw } from 'lucide-react';
import { ThinkingBlock } from '@/components/chat/ThinkingBlock';
import { ToolCallIndicator, SkillLoadingIndicator } from '@/components/chat/ToolCallIndicator';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { chatStore, type Message, type MemoryChunk } from '@/store/chatStore';
import { DocumentViewerModal } from '@/components/memory/DocumentViewerModal';
import { FilePermissionDialog } from '@/components/skills/FilePermissionDialog';
import { FileResultDisplay, parseFileResults } from '@/components/skills/FileResultDisplay';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChat } from '@/hooks/useChat';

const SUGGESTED_PROMPTS = [
  'Summarize a document',
  'Help me write something',
  'Explain a concept',
  'Answer questions from my notes',
] as const;

const EMPTY_MESSAGES: Message[] = [];
const DOCUMENT_CONTEXT_PREFIX = 'The user has attached the following documents:';

function getVisibleUserMessage(message: Message): { content: string; fileNames: string[] } {
  const metadataFileNames = message.attachedFileNames ?? [];
  const documentFileNames = Array.from(
    message.content.matchAll(/\[document:\s*([^\]]+)\]/g),
    (match) => match[1].trim()
  );
  const fileNames = metadataFileNames.length > 0 ? metadataFileNames : documentFileNames;

  if (message.displayContent !== undefined && message.displayContent !== null) {
    return { content: message.displayContent, fileNames };
  }

  if (message.content.trimStart().startsWith(DOCUMENT_CONTEXT_PREFIX)) {
    return { content: '', fileNames };
  }

  return { content: message.content, fileNames };
}

export function MessageThread() {
  const activeConversationId = chatStore((state) => state.activeConversationId);
  const messages = chatStore((state) =>
    activeConversationId ? (state.messages[activeConversationId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES
  );
  const targetMessageId = chatStore((state) => state.targetMessageId);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Ref tracks the real-time scroll position; state drives the UI button only.
  // Using state alone in the effect dep array caused a loop: scroll → handleScroll
  // → setIsAtBottom → effect re-fires → scroll again → repeat.
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const prevConversationIdRef = useRef<string | null>(null);
  // Set to true whenever the conversation changes; cleared once messages arrive
  // and we've done the instant jump. Handles the case where the conversation ID
  // is restored before messages have loaded (e.g. on app restart).
  const pendingInstantScrollRef = useRef(true);
  const { sendMessage } = useChat();

  // Scroll to a specific message when targeted from command palette
  useEffect(() => {
    if (!targetMessageId || messages.length === 0) return;
    // Small delay to let the DOM render after conversation switch
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-message-id="${targetMessageId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Briefly highlight the message
        el.classList.add('ring-2', 'ring-[var(--accent)]', 'ring-offset-2', 'ring-offset-background');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-[var(--accent)]', 'ring-offset-2', 'ring-offset-background');
          chatStore.getState().setTargetMessageId(null);
        }, 1800);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [targetMessageId, messages]);

  // Conversation switch → instant jump to bottom (no visible scroll animation).
  // New message during streaming → smooth scroll only if already near bottom.
  useEffect(() => {
    const conversationChanged = prevConversationIdRef.current !== activeConversationId;
    prevConversationIdRef.current = activeConversationId ?? null;

    if (conversationChanged) {
      // Mark that we need an instant jump; defer until messages are actually there.
      pendingInstantScrollRef.current = true;
    }

    if (pendingInstantScrollRef.current) {
      if (messages.length > 0) {
        // Messages have arrived — jump instantly, no animation.
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
        isAtBottomRef.current = true;
        setIsAtBottom(true);
        pendingInstantScrollRef.current = false;
      }
      // else: still waiting for messages to load, do nothing yet.
    } else if (isAtBottomRef.current) {
      // Normal streaming update — smooth scroll only when pinned to bottom.
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeConversationId]);

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
        className="h-full overflow-y-auto px-4 pt-6 pb-36"
      >
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.map((message, idx) => {
            const onRegenerate =
              message.role === 'assistant'
                ? () => {
                    if (!activeConversationId) return;
                    const prevUser = messages.slice(0, idx).reverse().find((m) => m.role === 'user');
                    if (!prevUser) return;
                    chatStore.getState().removeMessages(activeConversationId, [message.id, prevUser.id]);
                    void sendMessage(prevUser.content);
                  }
                : undefined;
            return <MessageBubble key={message.id} message={message} onRegenerate={onRegenerate} />;
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button — slides in from below, exits all the way down */}
      <AnimatePresence>
        {!isAtBottom && (
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="absolute bottom-36 left-1/2 -translate-x-1/2"
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

function MessageBubble({ message, onRegenerate }: { message: Message; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const activeConversationId = chatStore((state) => state.activeConversationId);
  const visibleUserMessage = isUser ? getVisibleUserMessage(message) : null;
  const rawContent = visibleUserMessage?.content ?? message.content;
  const attachedFileNames = visibleUserMessage?.fileNames ?? message.attachedFileNames ?? [];

  // Parse __RAGDOLL_FILES__ marker out of assistant messages
  const { before: contentBefore, results: fileResults, after: contentAfter } =
    !isUser ? parseFileResults(rawContent) : { before: rawContent, results: null, after: '' };
  const displayContent = isUser ? rawContent : contentBefore;

  // Handler for the inline FilePermissionDialog
  const handlePermissionResolve = useCallback(
    (approved: boolean) => {
      if (activeConversationId) {
        chatStore.getState().resolvePendingPermission(message.id, approved);
      }
    },
    [message.id, activeConversationId]
  );

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleFeedback = (feedback: 'up' | 'down') => {
    if (!activeConversationId) return;
    chatStore.getState().setMessageFeedback(activeConversationId, message.id, feedback);
  };

  const hasThinking = !isUser && (message.thinkingContent != null);
  const hasToolCalls = !isUser && !!message.toolCallsUsed?.length;

  return (
    <motion.div
      data-message-id={message.id}
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={cn('flex flex-col transition-all duration-300', isUser ? 'items-end' : 'items-start')}
    >
      {/* Tool-use pill — only rendered once streaming is done (quiet "Used X" state).
          While still streaming the inline SkillLoadingIndicator inside the bubble
          handles the active "Using X…" display instead. */}
      {hasToolCalls && !message.isStreaming && (
        <div className="w-full max-w-[72%]">
          <ToolCallIndicator
            tools={message.toolCallsUsed!}
            isStreaming={false}
          />
        </div>
      )}

      {/* Thinking block — shown above assistant bubbles that have thinking content */}
      {hasThinking && (
        <div className="w-full max-w-[72%]">
          <ThinkingBlock
            content={message.thinkingContent ?? ''}
            duration={message.thinkingDuration ?? null}
            isStreaming={message.isStreaming && message.thinkingDuration == null}
          />
        </div>
      )}

      {/* Inline permission dialog — shown mid-stream while the skill awaits user decision */}
      {!isUser && message.pendingPermission && (
        <div className="w-full max-w-[72%]">
          <FilePermissionDialog
            permission={message.pendingPermission}
            onResolve={handlePermissionResolve}
          />
        </div>
      )}

      <div
        className={cn(
          'group relative min-w-0 max-w-[72%] overflow-hidden rounded-xl px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'border border-border/50 bg-muted/40 text-foreground'
        )}
      >
        {/* Markdown content */}
        {displayContent && (
          <div
            className={cn(
            'message-markdown prose-sm max-w-full min-w-0 overflow-hidden break-words text-sm leading-relaxed [overflow-wrap:anywhere]',
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
            '[&_pre]:max-w-full [&_pre]:overflow-x-auto',
            '[&_code]:break-words [&_code]:[overflow-wrap:anywhere]',
            '[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto',
            message.isStreaming && displayContent && 'streaming-markdown',
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
                        wrapLongLines
                        customStyle={{
                          borderRadius: '0.5rem',
                          fontSize: '0.75rem',
                          margin: '0.5rem 0',
                          maxWidth: '100%',
                          overflowX: 'auto',
                          padding: '0.75rem',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
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
                        'rounded px-1 py-0.5 font-mono text-[0.8em] break-words [overflow-wrap:anywhere]',
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
              {displayContent}
            </ReactMarkdown>
          </div>
        )}

        {/* File result cards — emitted by the universal-file-access skill */}
        {fileResults && fileResults.length > 0 && (
          <FileResultDisplay results={fileResults} />
        )}

        {/* "after marker" text (any text following the file results block) */}
        {contentAfter && !isUser && (
          <div className="prose prose-sm dark:prose-invert max-w-none mt-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{contentAfter}</ReactMarkdown>
          </div>
        )}

        {/* Attached files (user messages) */}
        {isUser && attachedFileNames.length > 0 && (
          <div className={cn('flex flex-wrap gap-1', displayContent && 'mt-2 border-t border-primary-foreground/20 pt-2')}>
            {attachedFileNames.map((name) => (
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

        {/* Typing indicator — installing/using skill or plain dots before any text arrives */}
        {message.isStreaming && !message.content && (
          hasToolCalls || message.installingPlugin ? (
            <SkillLoadingIndicator
              tools={message.toolCallsUsed ?? []}
              installingPlugin={message.installingPlugin}
            />
          ) : (
            <span className="flex items-center gap-1 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:300ms]" />
            </span>
          )
        )}

        {/* Assistant toolbar (visible on hover) */}
        {!isUser && !message.isStreaming && (
          <div className="mt-2 flex items-center gap-1 border-t border-border/30 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => handleCopy(displayContent)}
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
              {onRegenerate && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onRegenerate}
                  title="Regenerate response"
                  className="h-6 w-6"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Source citations */}
        {!isUser && !message.isStreaming && (
          <SourceCitations memoryChunks={message.memoryChunks} citations={message.citations} />
        )}
      </div>
    </motion.div>
  );
}

// ─── Source citations (document-only pills + viewer modal) ───────────────────

function DocPillIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf')  return <FileText className="h-2.5 w-2.5 shrink-0 text-red-400" />;
  if (ext === 'csv')  return <FileSpreadsheet className="h-2.5 w-2.5 shrink-0 text-green-400" />;
  if (ext === 'json') return <Braces className="h-2.5 w-2.5 shrink-0 text-yellow-400" />;
  if (ext === 'md')   return <FileCode className="h-2.5 w-2.5 shrink-0 text-blue-400" />;
  return <FileText className="h-2.5 w-2.5 shrink-0" />;
}

function SourceCitations({
  memoryChunks,
  citations,
}: {
  memoryChunks: MemoryChunk[] | null;
  citations?: string[];
}) {
  const [viewer, setViewer] = useState<{ filename: string; chunks: MemoryChunk[] } | null>(null);

  // Only surface document sources (skip conversation memory)
  const docChunks = memoryChunks?.filter((c) => c.source !== 'conversation') ?? [];

  const docGroupMap = docChunks.reduce<Record<string, MemoryChunk[]>>((acc, c) => {
    (acc[c.source] ??= []).push(c);
    return acc;
  }, {});

  // filenames explicitly cited in the response text but not in vector chunks
  const citationOnly = (citations ?? []).filter((f) => !docGroupMap[f]);

  if (Object.keys(docGroupMap).length === 0 && citationOnly.length === 0) return null;

  return (
    <>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/20 pt-2">
        <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40 mr-0.5">
          Sources
        </span>

        {Object.entries(docGroupMap).map(([filename, chunks]) => (
          <button
            key={filename}
            onClick={() => setViewer({ filename, chunks })}
            title={`View ${filename}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-medium text-blue-400 ring-1 ring-blue-500/20 transition-colors hover:bg-blue-500/18 hover:text-blue-300 hover:ring-blue-400/30 active:scale-95"
          >
            <DocPillIcon filename={filename} />
            <span className="max-w-[140px] truncate">{filename}</span>
            {chunks.length > 1 && (
              <span className="rounded-full bg-blue-400/20 px-1.5 py-px text-[9px] leading-tight tabular-nums">
                {chunks.length}
              </span>
            )}
          </button>
        ))}

        {citationOnly.map((f) => (
          <button
            key={f}
            onClick={() => setViewer({ filename: f, chunks: [] })}
            title={`View ${f}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/8 px-2.5 py-0.5 text-[10px] font-medium text-blue-400/60 ring-1 ring-blue-500/15 transition-colors hover:bg-blue-500/15 hover:text-blue-400"
          >
            <DocPillIcon filename={f} />
            <span className="max-w-[140px] truncate">{f}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {viewer && (
          <DocumentViewerModal
            key={viewer.filename}
            filename={viewer.filename}
            chunkTexts={viewer.chunks.map((c) => c.text)}
            onClose={() => setViewer(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
