import { useCallback, useRef, useState } from 'react';
import { chatStore, type Message, type MemoryChunk } from '@/store/chatStore';
import { profileStore, getProfileApiKey } from '@/store/profileStore';
import type { AttachedFile, ResponseStyle } from '@/types/chat';

const SIDECAR_URL = 'http://127.0.0.1:8765';
const PREFETCH_DEBOUNCE_MS = 400;

interface UseChatReturn {
  sendMessage: (content: string, files?: AttachedFile[], responseStyle?: ResponseStyle | null) => Promise<void>;
  stopGeneration: () => void;
  prefetchContext: (query: string) => void;
  isStreaming: boolean;
  error: string | null;
}

// ── File processing ───────────────────────────────────────────────────────────

async function processFiles(files: AttachedFile[]): Promise<{ filename: string; content: string; error: string | null }[]> {
  const form = new FormData();
  for (const f of files) {
    const blob = new Blob([f.data], { type: 'application/octet-stream' });
    form.append('files', blob, f.name);
  }

  const res = await fetch(`${SIDECAR_URL}/files/process`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error(`File processing failed: ${res.status}`);
  const json = (await res.json()) as { files: { filename: string; content: string; error: string | null }[] };
  return json.files;
}

function buildFileContext(processed: { filename: string; content: string; error: string | null }[]): string {
  const parts = processed
    .filter((f) => !f.error && f.content)
    .map((f) => `[document: ${f.filename}]\n${f.content}`);
  if (parts.length === 0) return '';
  return `The user has attached the following documents:\n\n${parts.join('\n\n---\n\n')}`;
}

// ── SSE event type ────────────────────────────────────────────────────────────

interface SseEvent {
  // Compact chunk format
  t?: string;
  d?: string;
  // Verbose format (all other events)
  type?: string;
  content?: string;
  chunks?: MemoryChunk[];
  citations?: string[];
  title?: string;
  messageId?: string;
  message?: string;
  tools?: string[];
  plugin_name?: string;
  plugin_id?: string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChat(): UseChatReturn {
  const abortControllerRef = useRef<AbortController | null>(null);
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStreaming = chatStore((state) => state.isStreaming);
  const [error, setError] = useState<string | null>(null);

  // ── Pre-fetch ─────────────────────────────────────────────────────────────

  const prefetchContext = useCallback((query: string) => {
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 8) return;
    prefetchTimerRef.current = setTimeout(() => {
      fetch(`${SIDECAR_URL}/memory/prefetch?q=${encodeURIComponent(trimmed)}`, {
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
    }, PREFETCH_DEBOUNCE_MS);
  }, []);

  // ── Send ──────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (
    content: string,
    files: AttachedFile[] = [],
    responseStyle: ResponseStyle | null = null
  ) => {
    const state = chatStore.getState();
    const activeConversationId = state.activeConversationId;
    if (!activeConversationId) return;

    const conversation = state.conversations.find((c) => c.id === activeConversationId);
    if (!conversation) return;

    setError(null);

    // Cancel any pending prefetch debounce
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }

    const profile = profileStore.getState().getActiveProfile();
    const provider = profile?.provider ?? conversation.provider;
    const model = profile?.modelName ?? conversation.model;
    const apiKey = profile ? (await getProfileApiKey(profile.id)) ?? '' : '';

    let fileContext = '';
    const fileNames = files.map((f) => f.name);
    if (files.length > 0) {
      try {
        const processed = await processFiles(files);
        fileContext = buildFileContext(processed);
      } catch (err) {
        console.warn('[useChat] File processing error:', err);
      }
    }

    const messageText = fileContext ? `${fileContext}\n\n${content}`.trim() : content;

    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      conversationId: activeConversationId,
      role: 'user',
      content,
      createdAt: Date.now(),
      isStreaming: false,
      memoryChunks: null,
      attachedFileNames: fileNames.length > 0 ? fileNames : undefined,
    };
    chatStore.getState().addMessage(activeConversationId, userMessage);

    const streamingMessageId = `msg_${Date.now()}_stream`;
    const streamingMessage: Message = {
      id: streamingMessageId,
      conversationId: activeConversationId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      isStreaming: true,
      memoryChunks: null,
    };
    chatStore.getState().addMessage(activeConversationId, streamingMessage);

    abortControllerRef.current = new AbortController();
    chatStore.getState().setStreaming(true);

    try {
      const response = await fetch(`${SIDECAR_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConversationId,
          message: messageText,
          display_message: content,
          provider,
          api_key: apiKey,
          model,
          file_names: fileNames,
          response_style: responseStyle ?? 'concise',
          has_response_style: !!responseStyle,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error(`Stream failed: ${response.status} ${response.statusText}`);

      // ── rAF-batched chunk accumulator ────────────────────────────────────
      let pendingChunks: string[] = [];
      let rafId: number | null = null;

      function flushChunks() {
        rafId = null;
        if (pendingChunks.length === 0) return;
        const combined = pendingChunks.join('');
        pendingChunks = [];
        chatStore.getState().appendToStreamingMessage(streamingMessageId, combined);
      }

      function scheduleFlush() {
        if (rafId === null) {
          rafId = requestAnimationFrame(flushChunks);
        }
      }

      // ── TextDecoderStream ─────────────────────────────────────────────────
      const reader = response.body!
        .pipeThrough(new TextDecoderStream())
        .getReader();

      let buffer = '';
      let pendingMemoryChunks: MemoryChunk[] | null = null;
      let pendingCitations: string[] | null = null;
      let thinkingStartTime: number | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr) as SseEvent;

            // Compact chunk format: {"t":"c","d":"..."}
            if (event.t === 'c') {
              pendingChunks.push(event.d ?? '');
              scheduleFlush();
              continue;
            }

            const evType = event.type;

            if (evType === 'tool_use') {
              chatStore.getState().setToolCallsUsed(streamingMessageId, event.tools ?? []);
            } else if (evType === 'plugin_install') {
              chatStore.getState().setInstallingPlugin(streamingMessageId, {
                name: event.plugin_name ?? event.plugin_id ?? 'Plugin',
                id: event.plugin_id ?? '',
              });
            } else if (evType === 'chunk') {
              // Verbose chunk fallback
              pendingChunks.push(event.content ?? '');
              scheduleFlush();
            } else if (evType === 'thinking') {
              thinkingStartTime ??= Date.now();
              chatStore.getState().setThinkingContent(streamingMessageId, event.content ?? '');
            } else if (evType === 'thinking_done') {
              if (thinkingStartTime) {
                chatStore.getState().finalizeThinking(streamingMessageId, (Date.now() - thinkingStartTime) / 1000);
              }
            } else if (evType === 'memory') {
              pendingMemoryChunks = event.chunks ?? null;
            } else if (evType === 'citations') {
              pendingCitations = event.citations ?? null;
            } else if (evType === 'title') {
              chatStore.getState().updateConversationTitle(activeConversationId, event.title ?? '');
            } else if (evType === 'done') {
              // Flush any buffered chunks before finalizing
              if (rafId !== null) cancelAnimationFrame(rafId);
              flushChunks();
              // Sync plugin picker if a plugin was installed or activated this turn
              const _msgs = chatStore.getState().messages[activeConversationId] ?? [];
              const _sm = _msgs.find((m) => m.id === streamingMessageId);
              const _pluginTools = ['install_skill', 'install_and_activate_style'];
              if (_sm?.installingPlugin || _sm?.toolCallsUsed?.some((t) => _pluginTools.includes(t))) {
                chatStore.getState().bumpPluginVersion();
              }
              chatStore.getState().finalizeStreamingMessage(streamingMessageId, pendingMemoryChunks, pendingCitations);
            } else if (evType === 'error') {
              throw new Error(event.message ?? 'Unknown sidecar error');
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Unexpected token') {
              throw parseErr;
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'The user aborted a request.') {
        setError(msg);
        const msgs = chatStore.getState().messages[activeConversationId] ?? [];
        const streaming = msgs.find((m) => m.isStreaming);
        if (streaming) chatStore.getState().finalizeStreamingMessage(streaming.id, null);
      }
    } finally {
      chatStore.getState().setStreaming(false);
      abortControllerRef.current = null;
    }
  }, []);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    const state = chatStore.getState();
    const activeId = state.activeConversationId;
    if (activeId) {
      const streaming = state.messages[activeId]?.find((m) => m.isStreaming);
      if (streaming) chatStore.getState().finalizeStreamingMessage(streaming.id, null);
    }
    chatStore.getState().setStreaming(false);
  }, []);

  return { sendMessage, stopGeneration, prefetchContext, isStreaming, error };
}
