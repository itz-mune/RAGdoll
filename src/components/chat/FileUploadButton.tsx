import { useEffect, useRef, useState } from 'react';
import { FileUp, Plus } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/ui/button';
import type { AttachedFile } from '@/types/chat';

const ACCEPTED_EXTENSIONS = ['txt', 'md', 'pdf', 'docx', 'csv', 'json'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface FileUploadButtonProps {
  onFilesAccepted: (files: AttachedFile[]) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

export function FileUploadButton({
  onFilesAccepted,
  onError,
  disabled,
}: FileUploadButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const openFilePicker = async () => {
    try {
      const result = await open({
        multiple: true,
        filters: [{ name: 'Documents', extensions: ACCEPTED_EXTENSIONS }],
      });
      if (!result) return;

      const paths = Array.isArray(result) ? result : [result];
      const accepted: AttachedFile[] = [];

      for (const path of paths) {
        const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
        const ext = name.split('.').pop()?.toLowerCase() ?? '';

        if (!ACCEPTED_EXTENSIONS.includes(ext)) {
          onError('Only .txt, .md, .pdf, .docx, .csv and .json files are supported');
          continue;
        }

        const data = await readFile(path);

        if (data.length > MAX_BYTES) {
          onError(`File exceeds 10 MB limit: ${name}`);
          continue;
        }

        accepted.push({
          id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name,
          extension: ext,
          size: data.length,
          data,
        });
      }

      if (accepted.length > 0) onFilesAccepted(accepted);
    } catch (err) {
      // User cancelled or plugin error — silent
      console.error('[FileUploadButton]', err);
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div ref={menuRef} className="relative">
      <Button
        onClick={() => setMenuOpen((open) => !open)}
        onDoubleClick={() => {
          setMenuOpen(false);
          void openFilePicker();
        }}
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        title="Upload documents"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
      </Button>

      {menuOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 rounded-lg border border-border/60 bg-popover shadow-lg">
          <button
            type="button"
            title="Upload documents into this chat"
            onClick={() => {
              setMenuOpen(false);
              void openFilePicker();
            }}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted w-full"
          >
            <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>Upload</span>
          </button>

          <button
            type="button"
            title="Add-ons coming soon"
            disabled
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground opacity-50 w-full cursor-not-allowed"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Add-on</span>
          </button>
        </div>
      )}
    </div>
  );
}

