import { useRef, useState, useEffect } from 'react';
import { Send, StopCircle, Paperclip } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { chatStore } from '@/store/chatStore';
import { Button } from '@/components/ui/button';
import { FileUploadButton } from './FileUploadButton';
import { AttachedFilesList } from './AttachedFilesList';
import { ProfileSwitcher } from './ProfileSwitcher';
import type { AttachedFile, ResponseStyle } from '@/types/chat';

interface ChatInputProps {
  onNavigateToSettings?: () => void;
  /** Files dragged onto the DragDropZone get pushed here so they join the queue */
  droppedFiles?: AttachedFile[];
  onDroppedFilesConsumed?: () => void;
}

export function ChatInput({ onNavigateToSettings, droppedFiles, onDroppedFilesConsumed }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [responseStyle, setResponseStyle] = useState<ResponseStyle | null>(null);
  const [attachedFilesByConversation, setAttachedFilesByConversation] = useState<Record<string, AttachedFile[]>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const { sendMessage, stopGeneration, isStreaming } = useChat();
  const activeConversationId = chatStore((state) => state.activeConversationId);
  const attachedFiles = activeConversationId ? (attachedFilesByConversation[activeConversationId] ?? []) : [];

  const updateAttachedFiles = (
    updater: (files: AttachedFile[]) => AttachedFile[]
  ) => {
    if (!activeConversationId) return;
    setAttachedFilesByConversation((prev) => ({
      ...prev,
      [activeConversationId]: updater(prev[activeConversationId] ?? []),
    }));
  };

  // Merge externally-dropped files (from DragDropZone) into the local queue
  useEffect(() => {
    if (!activeConversationId || !droppedFiles || droppedFiles.length === 0) return;
    updateAttachedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...droppedFiles.filter((f) => !existingNames.has(f.name))];
    });
    onDroppedFilesConsumed?.();
  }, [activeConversationId, droppedFiles, onDroppedFilesConsumed]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }, [input]);

  // Focus on Ctrl+L
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Clear file error after 4 s
  useEffect(() => {
    if (!fileError) return;
    const t = setTimeout(() => setFileError(null), 4000);
    return () => clearTimeout(t);
  }, [fileError]);

  const handleSend = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isStreaming) return;
    const content = input;
    const files = attachedFiles;
    setInput('');
    await sendMessage(content, files, responseStyle);
    updateAttachedFiles((prev) => prev.filter((file) => file.persistent));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const addFiles = (files: AttachedFile[]) => {
    updateAttachedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...files.filter((f) => !existingNames.has(f.name))];
    });
  };

  const removeFile = (id: string) => updateAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  const togglePersistent = (id: string) =>
    updateAttachedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, persistent: !f.persistent } : f))
    );

  const canSend = (input.trim().length > 0 || attachedFiles.length > 0) && !isStreaming && !!activeConversationId;

  return (
    <div className="border-t border-border/50 bg-muted/20 p-4">
      <div className="mx-auto max-w-4xl space-y-2">
        {/* Character count */}
        {input.length > 500 && (
          <p className="text-right text-xs text-muted-foreground">{input.length.toLocaleString()} chars</p>
        )}

        {/* Persistent context files */}
        {attachedFiles.length > 0 && (
          <div className="rounded-lg border border-border/40 bg-muted/30 px-3 pt-2 pb-1">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Paperclip className="h-2.5 w-2.5" />
              Context documents
            </div>
            <AttachedFilesList
              files={attachedFiles}
              onRemove={removeFile}
              onTogglePersistent={togglePersistent}
            />
          </div>
        )}

        {/* File error toast */}
        {fileError && (
          <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{fileError}</p>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          {/* Left controls */}
          <div className="flex shrink-0 items-center gap-1 pb-0.5">
            <ProfileSwitcher onNavigateToSettings={onNavigateToSettings} />
            <FileUploadButton
              onFilesAccepted={addFiles}
              onError={setFileError}
              disabled={!activeConversationId}
              responseStyle={responseStyle}
              onResponseStyleChange={setResponseStyle}
            />
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!activeConversationId}
            placeholder={activeConversationId ? 'Type your message…' : 'Select or start a conversation'}
            className="flex-1 resize-none rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 min-h-[42px]"
            rows={1}
          />

          {/* Send / Stop */}
          {isStreaming ? (
            <Button onClick={stopGeneration} variant="destructive" size="icon" className="h-10 w-10 shrink-0">
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSend} disabled={!canSend} size="icon" className="h-10 w-10 shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Ctrl+Enter to send · Ctrl+P to switch profile
        </p>
      </div>
    </div>
  );
}
