import { useCallback, useRef, useState } from 'react';
import { chatStore, type Message, type MemoryChunk } from '@/store/chatStore';
import { profileStore, getProfileApiKey } from '@/store/profileStore';
import type { AttachedFile, ResponseStyle } from '@/types/chat';

const SIDECAR_URL = 'http://127.0.0.1:8765';

interface UseChatReturn {
  sendMessage: (content: string, files?: AttachedFile[], responseStyle?: ResponseStyle | null) => Promise<void>;
  stopGeneration: () => void;
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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChat(): UseChatReturn {
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStreaming = chatStore((state) => state.isStreaming);
  const [error, setError] = useState<string | null>(null);

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

    // Resolve provider + model + API key from active profile (fall back to conversation)
    const profile = profileStore.getState().getActiveProfile();
    const provider = profile?.provider ?? conversation.provider;
    const model = profile?.modelName ?? conversation.model;
    const apiKey = profile ? (await getProfileApiKey(profile.id)) ?? '' : '';

    // ── Process attached files ─────────────────────────────────────────────
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

    // ── Final user message text ────────────────────────────────────────────
    const messageText = fileContext ? `${fileContext}\n\n${content}`.trim() : content;

    // ── Optimistic user message ────────────────────────────────────────────
    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      conversationId: activeConversationId,
      role: 'user',
      content, // show only the user's text in the bubble, not the full context
      createdAt: Date.now(),
      isStreaming: false,
      memoryChunks: null,
      attachedFileNames: fileNames.length > 0 ? fileNames : undefined,
    };
    chatStore.getState().addMessage(activeConversationId, userMessage);

    // ── Streaming placeholder ──────────────────────────────────────────────
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

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body from sidecar');

      const decoder = new TextDecoder();
      let buffer = '';
      let pendingMemoryChunks: MemoryChunk[] | null = null;
      let pendingCitations: string[] | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr) as {
              type: string;
              content?: string;
              chunks?: MemoryChunk[];
              citations?: string[];
              title?: string;
              messageId?: string;
              message?: string;
            };

            if (event.type === 'chunk') {
              chatStore.getState().appendToStreamingMessage(streamingMessageId, event.content ?? '');
            } else if (event.type === 'memory') {
              pendingMemoryChunks = event.chunks ?? null;
            } else if (event.type === 'citations') {
              pendingCitations = event.citations ?? null;
            } else if (event.type === 'title') {
              chatStore.getState().updateConversationTitle(activeConversationId, event.title ?? '');
            } else if (event.type === 'done') {
              chatStore.getState().finalizeStreamingMessage(streamingMessageId, pendingMemoryChunks, pendingCitations);
            } else if (event.type === 'error') {
              throw new Error(event.message ?? 'Unknown sidecar error');
            }
          } catch (parseErr) {
            // Re-throw real errors; silently drop malformed SSE lines
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
        // Finalize the placeholder so the UI doesn't stay in streaming state
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

  return { sendMessage, stopGeneration, isStreaming, error };
}
