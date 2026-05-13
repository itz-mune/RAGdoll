import { useEffect, useState, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { listen } from '@tauri-apps/api/event';
import { readFile } from '@tauri-apps/plugin-fs';
import type { AttachedFile } from '@/types/chat';

const ACCEPTED_EXTENSIONS = ['txt', 'md', 'pdf', 'docx', 'csv', 'json'];
const MAX_BYTES = 10 * 1024 * 1024;

interface DragDropZoneProps {
  children: ReactNode;
  onFilesAccepted: (files: AttachedFile[]) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

interface TauriDragPayload {
  paths: string[];
  position: { x: number; y: number };
}

export function DragDropZone({ children, onFilesAccepted, onError, disabled }: DragDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (disabled) return;

    let unlistenEnter: (() => void) | undefined;
    let unlistenLeave: (() => void) | undefined;
    let unlistenDrop: (() => void) | undefined;

    const setup = async () => {
      unlistenEnter = await listen<TauriDragPayload>('tauri://drag-enter', () => {
        setIsDragging(true);
      });

      unlistenLeave = await listen<TauriDragPayload>('tauri://drag-leave', () => {
        setIsDragging(false);
      });

      unlistenDrop = await listen<TauriDragPayload>('tauri://drag-drop', async (event) => {
        setIsDragging(false);
        const { paths } = event.payload;
        if (!paths?.length) return;

        const accepted: AttachedFile[] = [];

        for (const path of paths) {
          const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
          const ext = name.split('.').pop()?.toLowerCase() ?? '';

          if (!ACCEPTED_EXTENSIONS.includes(ext)) {
            onError('Only .txt, .md, .pdf, .docx, .csv and .json files are supported');
            continue;
          }

          try {
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
          } catch (err) {
            console.error('[DragDrop] Failed to read file:', path, err);
          }
        }

        if (accepted.length > 0) onFilesAccepted(accepted);
      });
    };

    setup();

    return () => {
      unlistenEnter?.();
      unlistenLeave?.();
      unlistenDrop?.();
    };
  }, [disabled, onFilesAccepted, onError]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {children}

      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/60 bg-background/90 px-12 py-10 text-center shadow-lg"
            >
              <Upload className="h-10 w-10 text-primary/70" />
              <p className="text-base font-semibold text-foreground">
                Drop files to attach them to your message
              </p>
              <p className="text-xs text-muted-foreground">
                Accepted: .txt · .md · .pdf · .docx · .csv · .json · max 10 MB each
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
