import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

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

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  createConversation: (conversation: Conversation) => void;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  appendToStreamingMessage: (messageId: string, chunk: string) => void;
  finalizeStreamingMessage: (messageId: string, memoryChunks?: MemoryChunk[] | null, citations?: string[] | null) => void;
  updateConversationTitle: (id: string, title: string) => void;
  setMessageFeedback: (conversationId: string, messageId: string, feedback: 'up' | 'down' | null) => void;
  setStreaming: (isStreaming: boolean) => void;
  clearAll: () => void;
}

export const useChatStore = create<ChatStore>()(
  subscribeWithSelector((set) => ({
    conversations: [],
    activeConversationId: null,
    messages: {},
    isStreaming: false,
    streamingMessageId: null,

    setConversations: (conversations) => set({ conversations }),

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

    setStreaming: (isStreaming) => set({ isStreaming }),

    clearAll: () =>
      set({
        conversations: [],
        activeConversationId: null,
        messages: {},
        isStreaming: false,
        streamingMessageId: null,
      }),
  }))
);

// Convenience alias so components can import either name
export const chatStore = useChatStore;
