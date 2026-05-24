import { useRef, useState, useEffect, useCallback } from 'react';
import { Send, Paperclip, Square, AlertCircle, PlusCircle, Archive } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { chatStore } from '@/store/chatStore';
import { toast } from 'sonner';
import { FileUploadButton } from './FileUploadButton';
import { AttachedFilesList } from './AttachedFilesList';
import { ProfileSwitcher } from './ProfileSwitcher';
import { PluginPickerButton } from './PluginPickerButton';
import Grainient from '@/components/Grainient';
import { useAccentHexes } from '@/lib/accent';
import { getAppSettings } from '@/lib/store';
import type { AttachedFile, ResponseStyle } from '@/types/chat';

// ── Shadow overlay renderer ────────────────────────────────────────────────────
// Keeps syntax markers visible but dimmed; renders formatting on top of the
// transparent textarea so cursor, focus ring, and editing all stay on the real input.

function toHTMLShadow(text: string): string {
  if (!text) return '';
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return safe
    // **bold** — keep markers, bold the inner text
    .replace(/(\*\*)([^*\n]+?)(\*\*)/g,
      '<span class="mk">$1</span><strong>$2</strong><span class="mk">$3</span>')
    // _italic_ — keep markers, italicise the inner text
    .replace(/(_)([^_\n]+?)(_)/g,
      '<span class="mk">$1</span><em>$2</em><span class="mk">$3</span>')
    // `code` — keep markers, apply code style
    .replace(/(`)([^`\n]+?)(`)/g,
      '<span class="mk">$1</span><code>$2</code><span class="mk">$3</span>')
    .replace(/\n/g, '<br>');
}

// ── Component ──────────────────────────────────────────────────────────────────

interface ChatInputProps {
  onNavigateToSettings?: () => void;
  /** Files dragged onto the DragDropZone get pushed here so they join the queue */
  droppedFiles?: AttachedFile[];
  onDroppedFilesConsumed?: () => void;
}

export function ChatInput({ onNavigateToSettings, droppedFiles, onDroppedFilesConsumed }: ChatInputProps) {
  const { color1, color2, color3, isDark } = useAccentHexes();
  const { sendMessage, stopGeneration, prefetchContext, isStreaming, error: chatError } = useChat();
  const activeConversationId = chatStore((state) => state.activeConversationId);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const input = (activeConversationId ? drafts[activeConversationId] : undefined) ?? '';

  const [responseStyle, setResponseStyle] = useState<ResponseStyle | null>(null);
  const [attachedFilesByConversation, setAttachedFilesByConversation] = useState<Record<string, AttachedFile[]>>({});
  const attachedFiles = activeConversationId ? (attachedFilesByConversation[activeConversationId] ?? []) : [];
  const [fileError, setFileError] = useState<string | null>(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const [sendOnEnter, setSendOnEnter] = useState(true);
  const [mdPreview, setMdPreview] = useState(true);
  const [inputFocused, setInputFocused] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef  = useRef<HTMLDivElement>(null);

  // ── Settings ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    getAppSettings().then((s) => { setSendOnEnter(s.sendOnEnter); setMdPreview(s.mdPreview); });
  }, []);

  useEffect(() => {
    const handler = () =>
      getAppSettings().then((s) => { setSendOnEnter(s.sendOnEnter); setMdPreview(s.mdPreview); });
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, []);

  // ── Attached files ────────────────────────────────────────────────────────────

  const updateAttachedFiles = (updater: (files: AttachedFile[]) => AttachedFile[]) => {
    if (!activeConversationId) return;
    setAttachedFilesByConversation((prev) => ({
      ...prev,
      [activeConversationId]: updater(prev[activeConversationId] ?? []),
    }));
  };

  useEffect(() => {
    if (!activeConversationId || !droppedFiles || droppedFiles.length === 0) return;
    updateAttachedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...droppedFiles.filter((f) => !existingNames.has(f.name))];
    });
    onDroppedFilesConsumed?.();
  }, [activeConversationId, droppedFiles, onDroppedFilesConsumed]);

  // ── Draft helpers ─────────────────────────────────────────────────────────────

  const setInput = useCallback((val: string) => {
    setDrafts((prev) => ({
      ...prev,
      ...(activeConversationId ? { [activeConversationId]: val } : {}),
    }));
  }, [activeConversationId]);

  // Reset focus indicator when switching conversations
  useEffect(() => { setInputFocused(false); }, [activeConversationId]);

  // ── Auto-expand textarea ──────────────────────────────────────────────────────

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // ── Ctrl+L focuses input ──────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); textareaRef.current?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── File error auto-clear ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!fileError) return;
    const t = setTimeout(() => setFileError(null), 4000);
    return () => clearTimeout(t);
  }, [fileError]);

  // ── /compact slash command ────────────────────────────────────────────────────

  const handleCompact = useCallback(async () => {
    if (!activeConversationId || isCompacting) return;
    setIsCompacting(true);
    setInput('');

    const conversations = chatStore.getState().conversations;
    const conv = conversations.find((c) => c.id === activeConversationId);
    const { profileStore, getProfileApiKey } = await import('@/store/profileStore');
    const profile = profileStore.getState().getActiveProfile();
    const provider = profile?.provider ?? conv?.provider ?? 'openai';
    const model    = profile?.modelName ?? conv?.model ?? 'gpt-4o';
    const apiKey   = profile ? (await getProfileApiKey(profile.id)) ?? '' : '';

    try {
      const toastId = toast.loading('Compacting conversation…');
      const res = await fetch('http://127.0.0.1:8765/chat/compact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: activeConversationId, provider, api_key: apiKey, model }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? 'Compact failed', { id: toastId });
        return;
      }

      // Reload the compacted messages from the sidecar
      const msgsRes = await fetch(`http://127.0.0.1:8765/conversations/${activeConversationId}/messages`);
      const msgsData = await msgsRes.json();
      // Endpoint returns a plain array; normalise each raw DB row to the Message shape
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalised = (Array.isArray(msgsData) ? msgsData : []).map((m: any) => ({
        id:           m.id,
        conversationId: m.conversation_id,
        role:         m.role,
        content:      m.content ?? '',
        displayContent: m.display_content ?? null,
        createdAt:    m.created_at,
        isStreaming:  false,
        memoryChunks: null,
      }));
      chatStore.getState().setMessages(activeConversationId, normalised);

      toast.success(
        `Compacted ${data.message_count_before} messages → 1 summary`,
        { id: toastId, icon: '📋' },
      );
    } catch (e) {
      toast.error('Compact failed — is the sidecar running?');
      console.error('[compact]', e);
    } finally {
      setIsCompacting(false);
    }
  }, [activeConversationId, isCompacting, setInput]);

  // ── Send ──────────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isStreaming) return;

    // Handle slash commands before sending to the LLM
    const trimmed = input.trim().toLowerCase();
    if (trimmed === '/compact') {
      void handleCompact();
      return;
    }

    const content = input;
    const files = attachedFiles;
    setInput('');
    await sendMessage(content, files, responseStyle);
    updateAttachedFiles((prev) => prev.filter((file) => file.persistent));
  };

  // ── Markdown helpers ──────────────────────────────────────────────────────────

  const wrapSelection = useCallback((before: string, after: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end   = el.selectionEnd   ?? 0;
    const selected = el.value.slice(start, end);
    setInput(el.value.slice(0, start) + before + selected + after + el.value.slice(end));
    requestAnimationFrame(() => {
      el.selectionStart = start + before.length;
      el.selectionEnd   = start + before.length + selected.length;
      el.focus();
    });
  }, [setInput]);

  const insertNewline = useCallback((el: HTMLTextAreaElement) => {
    const start = el.selectionStart ?? 0;
    const end   = el.selectionEnd   ?? 0;
    setInput(el.value.slice(0, start) + '\n' + el.value.slice(end));
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 1; });
  }, [setInput]);

  // ── Key handler ───────────────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && !e.shiftKey && !e.altKey) {
      if (e.key === 'b') { e.preventDefault(); wrapSelection('**', '**'); return; }
      if (e.key === 'i') { e.preventDefault(); wrapSelection('_', '_');   return; }
      if (e.key === '`') { e.preventDefault(); wrapSelection('`', '`');   return; }
    }

    if (e.key === 'Enter') {
      if (sendOnEnter) {
        if (mod || e.shiftKey) { e.preventDefault(); insertNewline(e.currentTarget); }
        else                   { e.preventDefault(); handleSend(); }
      } else {
        if (mod) { e.preventDefault(); handleSend(); }
      }
    }
  };

  // ── File helpers ──────────────────────────────────────────────────────────────

  const addFiles = (files: AttachedFile[]) => {
    updateAttachedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...files.filter((f) => !existingNames.has(f.name))];
    });
  };

  const removeFile       = (id: string) => updateAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  const togglePersistent = (id: string) =>
    updateAttachedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, persistent: !f.persistent } : f)));

  // ── Derived ───────────────────────────────────────────────────────────────────

  const isCompactCommand = input.trim().toLowerCase() === '/compact';
  const canSend  = (input.trim().length > 0 || attachedFiles.length > 0) && !isStreaming && !isCompacting && !!activeConversationId;
  const sendHint = sendOnEnter ? 'Enter to send · Ctrl+Enter for new line' : 'Ctrl+Enter to send';
  // Shadow overlay is active when mdPreview is on, there is content, and the textarea is NOT focused.
  // While focused, show raw text so selection, cursor, and editing all behave natively.
  const showShadow = mdPreview && input.length > 0 && !inputFocused;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="px-3 pt-2 pb-1.5">
      <div
        className="relative mx-auto max-w-4xl rounded-2xl border border-white/10"
        style={{ backdropFilter: 'blur(18px) saturate(160%)', WebkitBackdropFilter: 'blur(18px) saturate(160%)' }}
      >
        {/* Grain texture */}
        <div className={`absolute inset-0 pointer-events-none overflow-hidden rounded-2xl ${isDark ? 'opacity-50' : 'opacity-75'}`}>
          <Grainient
            color1={color1} color2={color2} color3={color3}
            timeSpeed={0} colorBalance={0} warpStrength={0} warpFrequency={9.9}
            warpSpeed={0} warpAmplitude={50} blendAngle={90} blendSoftness={1}
            rotationAmount={0} noiseScale={2.1} grainAmount={0.17} grainScale={2}
            grainAnimated={false} contrast={1.5} gamma={1} saturation={1}
            centerX={0} centerY={0} zoom={1.8}
          />
        </div>
        {/* Scrim */}
        <div className={`absolute inset-0 pointer-events-none rounded-2xl ${isDark ? 'bg-black/20' : 'bg-white/50'}`} />

        {/* Content */}
        <div className="relative z-10 p-3 space-y-2">

          {/* Character count */}
          {input.length > 500 && (
            <p className="text-right text-xs text-muted-foreground">{input.length.toLocaleString()} chars</p>
          )}

          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-muted/30 px-3 pt-2 pb-1">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Paperclip className="h-2.5 w-2.5" />
                Context documents
              </div>
              <AttachedFilesList files={attachedFiles} onRemove={removeFile} onTogglePersistent={togglePersistent} />
            </div>
          )}

          {/* Stream / LLM error banner */}
          {chatError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive/80" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-destructive/90">{chatError}</p>
                {chatError.includes('context window') && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('ragdoll:new-conversation'))}
                    className="mt-1 flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <PlusCircle className="h-3 w-3" />
                    Start a new conversation
                  </button>
                )}
              </div>
            </div>
          )}

          {/* File error */}
          {fileError && (
            <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{fileError}</p>
          )}

          {/* Input row */}
          <div className="flex items-center gap-2">

            {/* Left controls */}
            <div className="flex shrink-0 items-center gap-1">
              <ProfileSwitcher onNavigateToSettings={onNavigateToSettings} />
              <FileUploadButton
                onFilesAccepted={addFiles}
                onError={setFileError}
                disabled={!activeConversationId}
                responseStyle={responseStyle}
                onResponseStyleChange={setResponseStyle}
              />
              <PluginPickerButton disabled={!activeConversationId} />
            </div>

            {/* Textarea + shadow overlay */}
            <div className="relative flex-1">

              {/* Real textarea — always interactive; text made transparent when shadow is active */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); prefetchContext(e.target.value); }}
                onKeyDown={handleKeyDown}
                onFocus={(e) => {
                  setInputFocused(true);
                  e.currentTarget.style.boxShadow  = '0 0 0 2px var(--accent-60)';
                  e.currentTarget.style.borderColor = 'var(--accent-60)';
                }}
                onBlur={(e) => {
                  setInputFocused(false);
                  e.currentTarget.style.boxShadow  = '';
                  e.currentTarget.style.borderColor = '';
                }}
                onScroll={(e) => {
                  if (overlayRef.current)
                    overlayRef.current.scrollTop = e.currentTarget.scrollTop;
                }}
                disabled={!activeConversationId}
                placeholder={activeConversationId
                  ? 'Type your message… (Ctrl+B bold · Ctrl+I italic · Ctrl+` code)'
                  : 'Select or start a conversation'}
                className={`w-full resize-none rounded-lg border border-border/50 px-3 py-[10px] text-sm leading-[1.4] focus:outline-none disabled:opacity-50 min-h-[42px] ${isDark ? 'bg-background/40' : 'bg-white/70'}`}
                style={{
                  color:      showShadow ? 'transparent' : undefined,
                  caretColor: 'var(--accent)',
                  '--tw-ring-color': 'var(--accent-60)',
                } as React.CSSProperties}
                rows={1}
                aria-label="Chat message input"
              />

              {/* Shadow overlay — pointer-events-none, syncs scroll, renders inline markdown */}
              {showShadow && (
                <div
                  ref={overlayRef}
                  aria-hidden="true"
                  className={`absolute inset-0 px-3 py-[10px] text-sm leading-[1.4] overflow-hidden pointer-events-none select-none whitespace-pre-wrap break-words
                    [&_.mk]:opacity-30
                    [&_strong]:font-semibold
                    [&_em]:italic
                    [&_code]:font-mono [&_code]:text-[0.8em] [&_code]:bg-muted/60 [&_code]:rounded [&_code]:px-0.5 [&_code]:py-px`}
                  dangerouslySetInnerHTML={{ __html: toHTMLShadow(input) }}
                />
              )}
            </div>

            {/* Send / Stop / Compact — collapses when empty */}
            <div
              className="shrink-0 overflow-hidden transition-all duration-200 ease-in-out"
              style={{
                maxWidth:     canSend || isStreaming ? '42px' : '0px',
                opacity:      canSend || isStreaming ? 1 : 0,
                pointerEvents: canSend || isStreaming ? 'auto' : 'none',
              }}
            >
              {isStreaming ? (
                <button
                  onClick={stopGeneration}
                  aria-label="Stop generation"
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-destructive text-white transition-transform active:scale-95"
                >
                  <Square className="h-4 w-4 fill-current" />
                </button>
              ) : isCompactCommand ? (
                <button
                  onClick={handleSend}
                  aria-label="Compact conversation"
                  title="Summarise and compact this conversation"
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-amber-500 text-white transition-transform active:scale-95"
                >
                  <Archive className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  aria-label="Send message"
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-xl text-white transition-transform active:scale-95"
                  style={{ background: 'var(--accent)' }}
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Hint */}
          <p className="text-center text-[10px] text-muted-foreground/50 pb-0.5">
            {isCompactCommand
              ? '📋 Summarises all messages into a compact history — press Enter to run'
              : `${sendHint} · Ctrl+P to switch profile · 🧩 to toggle skills & style`}
          </p>
        </div>
      </div>
    </div>
  );
}
