/**
 * FileOperationResult — shown after a successful write/patch/create/delete.
 * Detected via __RAGDOLL_FILE_OP__…__RAGDOLL_FILE_OP__ markers.
 */
import { useState, useCallback } from 'react';
import { CheckCircle2, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DiffViewer, type DiffResult } from './DiffViewer';

const SIDECAR = 'http://127.0.0.1:8765';

// ── Marker parsing ─────────────────────────────────────────────────────────────

const OP_MARKER = '__RAGDOLL_FILE_OP__';

export interface FileOpPayload {
  operation:   string;    // "write" | "patch" | "create" | "delete"
  path:        string;
  additions?:  number;
  deletions?:  number;
  backup_path?: string;
  diff?:       DiffResult;
  patch_errors?: string[];
}

export function parseFileOp(text: string): {
  before: string;
  payload: FileOpPayload | null;
  after: string;
} {
  const start = text.indexOf(OP_MARKER);
  if (start === -1) return { before: text, payload: null, after: '' };
  const end = text.indexOf(OP_MARKER, start + OP_MARKER.length);
  if (end === -1) return { before: text, payload: null, after: '' };

  const before = text.slice(0, start).trimEnd();
  const raw    = text.slice(start + OP_MARKER.length, end);
  const after  = text.slice(end + OP_MARKER.length).trimStart();

  try {
    return { before, payload: JSON.parse(raw) as FileOpPayload, after };
  } catch {
    return { before: text, payload: null, after: '' };
  }
}

// ── Undo button ────────────────────────────────────────────────────────────────

function UndoButton({ path }: { path: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  const handleUndo = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${SIDECAR}/files/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await r.json();
      if (data.ok) {
        toast.success('File restored from backup');
        setDone(true);
      } else {
        toast.error(data.error ?? 'Undo failed');
      }
    } catch {
      toast.error('Sidecar offline');
    } finally {
      setLoading(false);
    }
  }, [path]);

  if (done) return <span className="text-xs text-green-400">Restored ✓</span>;

  return (
    <button
      onClick={handleUndo}
      disabled={loading}
      className={cn(
        'flex items-center gap-1.5 text-xs text-muted-foreground',
        'hover:text-foreground transition-colors',
        loading && 'opacity-50 pointer-events-none',
      )}
    >
      {loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <RotateCcw className="h-3.5 w-3.5" />}
      Undo
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface FileOperationResultProps {
  payload:   FileOpPayload;
  className?: string;
}

export function FileOperationResult({ payload, className }: FileOperationResultProps) {
  const { operation, path, diff, backup_path, patch_errors } = payload;
  const isWrite  = operation === 'write' || operation === 'patch';
  const isDelete = operation === 'delete';

  return (
    <div
      className={cn(
        'my-2 rounded-xl border border-border/50 bg-muted/10 overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
        {isDelete ? (
          <Trash2 className="h-3.5 w-3.5 text-destructive/70 shrink-0" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
          {isDelete ? 'Deleted' : 'Changes applied'}
        </span>
        {isWrite && backup_path && <UndoButton path={path} />}
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {isWrite && diff ? (
          <DiffViewer diff={diff} isPending={false} />
        ) : isDelete ? (
          <p className="text-xs font-mono text-muted-foreground line-through">{path}</p>
        ) : (
          <p className="text-xs font-mono text-muted-foreground">{path}</p>
        )}

        {/* Patch errors */}
        {patch_errors && patch_errors.length > 0 && (
          <div className="mt-2 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
            <p className="text-[11px] text-amber-400 font-medium mb-1">
              {patch_errors.length} patch{patch_errors.length > 1 ? 'es' : ''} skipped:
            </p>
            {patch_errors.map((e, i) => (
              <p key={i} className="text-[11px] text-muted-foreground">• {e}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
