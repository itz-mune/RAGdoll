import { Paperclip } from 'lucide-react';
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

export function FileUploadButton({ onFilesAccepted, onError, disabled }: FileUploadButtonProps) {
  const handleClick = async () => {
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

  return (
    <Button
      onClick={handleClick}
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      title="Attach files (.txt .md .pdf .docx .csv .json)"
      className="shrink-0 text-muted-foreground hover:text-foreground"
    >
      <Paperclip className="h-4 w-4" />
    </Button>
  );
}
