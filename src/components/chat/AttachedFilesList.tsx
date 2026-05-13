import { X, FileText, FileCode, FileSpreadsheet, Braces } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AttachedFile } from '@/types/chat';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ ext }: { ext: string }) {
  switch (ext) {
    case 'pdf':
      return <FileText className="h-3 w-3 text-red-400 shrink-0" />;
    case 'csv':
      return <FileSpreadsheet className="h-3 w-3 text-green-400 shrink-0" />;
    case 'json':
      return <Braces className="h-3 w-3 text-yellow-400 shrink-0" />;
    case 'md':
      return <FileCode className="h-3 w-3 text-blue-400 shrink-0" />;
    default:
      return <FileText className="h-3 w-3 text-muted-foreground shrink-0" />;
  }
}

function truncateName(name: string, max = 24): string {
  if (name.length <= max) return name;
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';
  const base = name.slice(0, max - ext.length - 1);
  return `${base}…${ext}`;
}

interface AttachedFilesListProps {
  files: AttachedFile[];
  onRemove: (id: string) => void;
  onTogglePersistent?: (id: string) => void;
}

export function AttachedFilesList({ files, onRemove, onTogglePersistent }: AttachedFilesListProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-1 pt-1 pb-0">
      <AnimatePresence initial={false}>
        {files.map((f) => (
          <motion.div
            key={f.id}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs"
          >
            <FileIcon ext={f.extension} />
            <span className="max-w-[10rem] truncate font-medium text-foreground/80">
              {truncateName(f.name)}
            </span>
            <span className="text-muted-foreground">{formatBytes(f.size)}</span>
            {onTogglePersistent && (
              <button
                type="button"
                onClick={() => onTogglePersistent(f.id)}
                title={f.persistent ? 'Persistent: this document stays attached for future messages in this chat' : 'One-shot: this document is removed after your next message'}
                aria-label={f.persistent ? `Disable persistence for ${f.name}` : `Keep ${f.name} attached for future messages`}
                aria-pressed={!!f.persistent}
                className={`ml-0.5 flex h-3.5 w-6 items-center rounded-full px-0.5 transition-colors ${
                  f.persistent ? 'justify-end bg-primary/80' : 'justify-start bg-muted-foreground/25'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-background shadow-sm" />
              </button>
            )}
            <button
              onClick={() => onRemove(f.id)}
              className="ml-0.5 text-muted-foreground/60 hover:text-foreground transition-colors"
              aria-label={`Remove ${f.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
