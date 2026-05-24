import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';

export type Provider = 'openai' | 'anthropic' | 'groq' | 'google' | 'ollama' | 'huggingface' | 'openrouter';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface MemoryChunk {
  id: string;
  text: string;
  score: number; // 0–1
  source: string; // 'conversation' | plugin name
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  displayContent?: string | null;
  createdAt: number;
  isStreaming: boolean;
  memoryChunks: MemoryChunk[] | null;
  feedback?: 'up' | 'down' | null;
  attachedFileNames?: string[];
  citations?: string[];
  thinkingContent?: string | null;
  thinkingDuration?: number | null;   // seconds
  toolCallsUsed?: string[];           // tool names used to produce this message
  installingPlugin?: { name: string; id: string } | null; // set while a plugin is being installed
  pendingPermission?: {
    id: string;
    files: string[];
    is_critical: boolean;
    resolved: boolean;
    approved: boolean | null;
  } | null;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  provider: Provider;
  model: string;
  messageCount: number;
}

interface ChatStore {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  isStreaming: boolean;
  streamingMessageId: string | null;
  targetMessageId: string | null;
  pluginVersion: number;

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  bumpPluginVersion: () => void;
  setTargetMessageId: (id: string | null) => void;
  createConversation: (conversation: Conversation) => void;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  appendToStreamingMessage: (messageId: string, chunk: string) => void;
  finalizeStreamingMessage: (messageId: string, memoryChunks?: MemoryChunk[] | null, citations?: string[] | null) => void;
  updateConversationTitle: (id: string, title: string) => void;
  setMessageFeedback: (conversationId: string, messageId: string, feedback: 'up' | 'down' | null) => void;
  removeMessages: (conversationId: string, ids: string[]) => void;
  setStreaming: (isStreaming: boolean) => void;
  clearAll: () => void;
  setThinkingContent: (messageId: string, content: string) => void;
  finalizeThinking: (messageId: string, durationSeconds: number) => void;
  setToolCallsUsed: (messageId: string, tools: string[]) => void;
  setInstallingPlugin: (messageId: string, plugin: { name: string; id: string } | null) => void;
  setPendingPermission: (messageId: string, perm: NonNullable<Message['pendingPermission']>) => void;
  resolvePendingPermission: (messageId: string, approved: boolean) => void;
}

export const useChatStore = create<ChatStore>()(
  subscribeWithSelector(
  persist(
  (set) => ({
    conversations: [],
    activeConversationId: null,
    messages: {},
    isStreaming: false,
    streamingMessageId: null,
    targetMessageId: null,
    pluginVersion: 0,

    setConversations: (conversations) => set({ conversations }),
    bumpPluginVersion: () => set((state) => ({ pluginVersion: state.pluginVersion + 1 })),
    setTargetMessageId: (id) => set({ targetMessageId: id }),

    createConversation: (conversation) =>
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        activeConversationId: conversation.id,
        messages: { ...state.messages, [conversation.id]: [] },
      })),

    deleteConversation: (id) =>
      set((state) => {
        const next = { ...state.messages };
        delete next[id];
        return {
          conversations: state.conversations.filter((c) => c.id !== id),
          activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
          messages: next,
        };
      }),

    setActiveConversation: (id) => set({ activeConversationId: id }),

    setMessages: (conversationId, messages) =>
      set((state) => ({
        messages: { ...state.messages, [conversationId]: messages },
      })),

    addMessage: (conversationId, message) =>
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: [...(state.messages[conversationId] ?? []), message],
        },
        isStreaming: message.role === 'assistant' && message.isStreaming,
        streamingMessageId: message.role === 'assistant' && message.isStreaming ? message.id : null,
      })),

    appendToStreamingMessage: (messageId, chunk) =>
      set((state) => {
        const activeConvId = state.activeConversationId;
        if (!activeConvId) return state;
        const msgs = state.messages[activeConvId] ?? [];
        return {
          messages: {
            ...state.messages,
            [activeConvId]: msgs.map((msg) =>
              msg.id === messageId ? { ...msg, content: msg.content + chunk } : msg
            ),
          },
        };
      }),

    finalizeStreamingMessage: (messageId, memoryChunks = null, citations = null) =>
      set((state) => {
        const activeConvId = state.activeConversationId;
        if (!activeConvId) return state;
        return {
          messages: {
            ...state.messages,
            [activeConvId]: (state.messages[activeConvId] ?? []).map((msg) =>
              msg.id === messageId
                ? { ...msg, isStreaming: false, memoryChunks, citations: citations ?? undefined }
                : msg
            ),
          },
          isStreaming: false,
          streamingMessageId: null,
        };
      }),

    updateConversationTitle: (id, title) =>
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, title, updatedAt: Date.now() } : c
        ),
      })),

    setMessageFeedback: (conversationId, messageId, feedback) =>
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: (state.messages[conversationId] ?? []).map((msg) =>
            msg.id === messageId ? { ...msg, feedback } : msg
          ),
        },
      })),

    removeMessages: (conversationId, ids) =>
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: (state.messages[conversationId] ?? []).filter(
            (m) => !ids.includes(m.id)
          ),
        },
      })),

    setStreaming: (isStreaming) => set({ isStreaming }),

    clearAll: () =>
      set({
        conversations: [],
        activeConversationId: null,
        messages: {},
        isStreaming: false,
        streamingMessageId: null,
      }),

    setThinkingContent: (messageId, content) =>
      set((state) => {
        const activeConvId = state.activeConversationId;
        if (!activeConvId) return state;
        return {
          messages: {
            ...state.messages,
            [activeConvId]: (state.messages[activeConvId] ?? []).map((msg) =>
              msg.id === messageId ? { ...msg, thinkingContent: content } : msg
            ),
          },
        };
      }),

    finalizeThinking: (messageId, durationSeconds) =>
      set((state) => {
        const activeConvId = state.activeConversationId;
        if (!activeConvId) return state;
        return {
          messages: {
            ...state.messages,
            [activeConvId]: (state.messages[activeConvId] ?? []).map((msg) =>
              msg.id === messageId ? { ...msg, thinkingDuration: durationSeconds } : msg
            ),
          },
        };
      }),

    setToolCallsUsed: (messageId, tools) =>
      set((state) => {
        const activeConvId = state.activeConversationId;
        if (!activeConvId) return state;
        return {
          messages: {
            ...state.messages,
            [activeConvId]: (state.messages[activeConvId] ?? []).map((msg) =>
              msg.id === messageId ? { ...msg, toolCallsUsed: tools } : msg
            ),
          },
        };
      }),

    setInstallingPlugin: (messageId, plugin) =>
      set((state) => {
        const activeConvId = state.activeConversationId;
        if (!activeConvId) return state;
        return {
          messages: {
            ...state.messages,
            [activeConvId]: (state.messages[activeConvId] ?? []).map((msg) =>
              msg.id === messageId ? { ...msg, installingPlugin: plugin } : msg
            ),
          },
        };
      }),

    setPendingPermission: (messageId, perm) =>
      set((state) => {
        const activeConvId = state.activeConversationId;
        if (!activeConvId) return state;
        return {
          messages: {
            ...state.messages,
            [activeConvId]: (state.messages[activeConvId] ?? []).map((msg) =>
              msg.id === messageId ? { ...msg, pendingPermission: perm } : msg
            ),
          },
        };
      }),

    resolvePendingPermission: (messageId, approved) =>
      set((state) => {
        const activeConvId = state.activeConversationId;
        if (!activeConvId) return state;
        return {
          messages: {
            ...state.messages,
            [activeConvId]: (state.messages[activeConvId] ?? []).map((msg) =>
              msg.id === messageId && msg.pendingPermission
                ? {
                    ...msg,
                    pendingPermission: {
                      ...msg.pendingPermission,
                      resolved: true,
                      approved,
                    },
                  }
                : msg
            ),
          },
        };
      }),
  }),
  {
    name: 'ragdoll-chat-ui',
    partialize: (s) => ({ activeConversationId: s.activeConversationId }),
  }
  )
  )
);

// Convenience alias so components can import either name
export const chatStore = useChatStore;
