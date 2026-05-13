import { useEffect, useRef, useState } from 'react';
import { FileUp, Plus } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/ui/button';
import { RESPONSE_STYLES } from '@/lib/responseStyles';
import type { AttachedFile, ResponseStyle } from '@/types/chat';

const ACCEPTED_EXTENSIONS = ['txt', 'md', 'pdf', 'docx', 'csv', 'json'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface FileUploadButtonProps {
  onFilesAccepted: (files: AttachedFile[]) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
  responseStyle: ResponseStyle | null;
  onResponseStyleChange: (style: ResponseStyle | null) => void;
}

export function FileUploadButton({
  onFilesAccepted,
  onError,
  disabled,
  responseStyle,
  onResponseStyleChange,
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
        title="Upload documents or adjust style"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
      </Button>

      {menuOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 rounded-lg border border-border/60 bg-popover shadow-lg p-2 space-y-2 min-w-max">
          <button
            type="button"
            title="Upload documents into this chat"
            onClick={() => {
              setMenuOpen(false);
              void openFilePicker();
            }}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted w-full"
          >
            <FileUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>Upload</span>
          </button>

          <div className="border-t border-border/50 pt-1.5">
            <p className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Style
            </p>
            <div className="flex items-center gap-1 px-1">
              {RESPONSE_STYLES.map((style) => {
                const Icon = style.icon;
                const isActive = responseStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    title={`${style.label}: ${style.description}`}
                    onClick={() => {
                      onResponseStyleChange(isActive ? null : style.id);
                    }}
                    className={`p-1 rounded transition-all ${
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            title="Add-ons coming soon"
            disabled
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground opacity-50 w-full cursor-not-allowed border-t border-border/50 pt-2"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>Add-on</span>
          </button>
        </div>
      )}
    </div>
  );
}


