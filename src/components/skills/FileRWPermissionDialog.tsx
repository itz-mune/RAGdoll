/**
 * FileRWPermissionDialog — inline permission dialog for write and delete
 * operations from the File R/W skill.
 *
 * Write dialog: embeds DiffViewer in collapsed state so user can expand
 *   and review changes before approving.
 * Delete dialog: shows target info, recycle-bin vs permanent toggle,
 *   with amber border for permanent mode.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Pencil, Trash2, AlertTriangle, CheckCircle2, XCircle,
  File, Folder,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DiffViewer, type DiffResult } from './DiffViewer';

const SIDECAR = 'http://127.0.0.1:8765';
const SERVER_TIMEOUT = 60;
const WARN_AT        = 45;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FileRWPendingPermission {
  id:               string;
  files:            string[];
  is_critical:      boolean;
  permission_level: 'write' | 'delete' | 'read';
  operation:        string;          // "write" | "patch" | "delete" etc.
  diff?:            DiffResult;
  target_stats?:    Record<string, unknown>[];
  permanent_delete?: boolean;
  resolved:         boolean;
  approved:         boolean | null;
}

interface Props {
  permission: FileRWPendingPermission;
  onResolve:  (approved: boolean) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function truncatePath(path: string, max = 52): string {
  if (path.length <= max) return path;
  return '…' + path.slice(-max);
}

// ── Resolved chip ─────────────────────────────────────────────────────────────

function ResolvedChip({ approved, operation }: { approved: boolean; operation: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 text-xs text-muted-foreground py-1"
    >
      {approved ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          {operation === 'delete' ? 'Deleted' : 'Changes applied'}
        </>
      ) : (
        <>
          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          Cancelled
        </>
      )}
    </motion.div>
  );
}

// ── Write / Patch permission dialog ───────────────────────────────────────────

function WriteDialog({ permission, onResolve }: Props) {
  const [busy, setBusy]  = useState(false);
  const mountedAt = useRef(Date.now());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (permission.resolved) return;
    const iv = setInterval(() => {
      const elapsed = (Date.now() - mountedAt.current) / 1000;
      const rem = Math.max(0, SERVER_TIMEOUT - elapsed);
      if (elapsed >= WARN_AT) setSecondsLeft(Math.ceil(rem));
      if (rem <= 0) { clearInterval(iv); onResolve(false); }
    }, 500);
    return () => clearInterval(iv);
  }, [permission.resolved, onResolve]);

  const respond = useCallback(async (approved: boolean) => {
    setBusy(true);
    try {
      await fetch(`${SIDECAR}/permissions/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: permission.id, approved }),
      });
    } catch { /* best-effort */ }
    finally {
      setBusy(false);
      onResolve(approved);
    }
  }, [permission.id, onResolve]);

  const isCritical = permission.is_critical;
  const opLabel    = permission.operation === 'patch' ? 'Patch' : 'Write';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'glass my-2 w-full max-w-[520px] rounded-xl border border-border/60 pl-3.5',
        'border-l-2 shadow-lg',
      )}
      style={{ borderLeftColor: isCritical ? 'hsl(38 92% 50%)' : 'var(--accent)' }}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 pt-3.5 pr-4 pb-2">
        {isCritical ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        )}
        <div className="flex-1">
          <p className="text-sm font-semibold leading-tight">
            {opLabel} Permission
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            RAGdoll wants to modify:{' '}
            <span className="font-mono text-foreground">
              {permission.files[0]?.split(/[/\\]/).pop()}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
            {truncatePath(permission.files[0] ?? '')}
          </p>
        </div>
      </div>

      {/* Embedded diff viewer */}
      {permission.diff && (
        <div className="mx-3 mb-3">
          <DiffViewer
            diff={permission.diff}
            isPending={false}
          />
        </div>
      )}

      {secondsLeft !== null && (
        <p className="mx-4 mb-1 text-[11px] text-muted-foreground/60">
          Request will expire in {secondsLeft}s
        </p>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-2 px-4 pb-3.5 pt-1 border-t border-border/30 mt-1">
        <Button
          variant="ghost" size="sm" disabled={busy}
          onClick={() => respond(false)}
          className="text-xs h-7 px-3"
        >
          Deny
        </Button>
        <Button
          size="sm" disabled={busy}
          onClick={() => respond(true)}
          className="text-xs h-7 px-3 text-white"
          style={isCritical
            ? { background: 'hsl(38 92% 50%)' }
            : { background: 'var(--accent)' }}
        >
          {busy ? 'Working…' : `Apply ${opLabel} →`}
        </Button>
      </div>
    </motion.div>
  );
}

// ── Delete permission dialog ──────────────────────────────────────────────────

function DeleteDialog({ permission, onResolve }: Props) {
  const [busy, setBusy]       = useState(false);
  const [permanent, setPerm]  = useState(permission.permanent_delete ?? false);
  const mountedAt = useRef(Date.now());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (permission.resolved) return;
    const iv = setInterval(() => {
      const elapsed = (Date.now() - mountedAt.current) / 1000;
      const rem = Math.max(0, SERVER_TIMEOUT - elapsed);
      if (elapsed >= WARN_AT) setSecondsLeft(Math.ceil(rem));
      if (rem <= 0) { clearInterval(iv); onResolve(false); }
    }, 500);
    return () => clearInterval(iv);
  }, [permission.resolved, onResolve]);

  const respond = useCallback(async (approved: boolean) => {
    setBusy(true);
    try {
      await fetch(`${SIDECAR}/permissions/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: permission.id, approved, permanent }),
      });
    } catch { /* best-effort */ }
    finally {
      setBusy(false);
      onResolve(approved);
    }
  }, [permission.id, permanent, onResolve]);

  const stats  = permission.target_stats ?? [];
  const isCrit = permission.is_critical || permanent;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'glass my-2 w-full max-w-[520px] rounded-xl border border-border/60 pl-3.5',
        'border-l-2 shadow-lg transition-colors',
      )}
      style={{ borderLeftColor: isCrit ? 'hsl(38 92% 50%)' : 'hsl(0 72% 51%)' }}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 pt-3.5 pr-4 pb-2">
        {isCrit
          ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          : <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
        <div className="flex-1">
          <p className="text-sm font-semibold leading-tight">Delete Confirmation</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            RAGdoll wants to delete {permission.files.length === 1 ? 'this item' : `${permission.files.length} items`}:
          </p>
        </div>
      </div>

      {/* Target list */}
      <div className="mx-3 mb-3 rounded-lg bg-muted/30 px-3 py-2 space-y-1.5 max-h-40 overflow-y-auto">
        {permission.files.map((f, i) => {
          const s = stats[i] as Record<string, unknown> | undefined;
          const isDir = s?.is_directory as boolean | undefined;
          const size  = s?.size_bytes as number | undefined;
          return (
            <div key={f} className="flex items-center gap-2 min-w-0">
              {isDir
                ? <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                : <File   className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <span className="text-xs font-mono truncate block text-foreground">
                  {f.split(/[/\\]/).pop()}
                </span>
                <span className="text-[11px] text-muted-foreground/60 font-mono truncate block">
                  {truncatePath(f, 48)}
                </span>
              </div>
              {size !== undefined && (
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {humanSize(size)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Mode radio */}
      <div className="mx-4 mb-3 space-y-1.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio" name="del-mode" value="trash"
            checked={!permanent}
            onChange={() => setPerm(false)}
            className="accent-[var(--accent)]"
          />
          <span className="text-xs">Move to Recycle Bin / Trash</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio" name="del-mode" value="permanent"
            checked={permanent}
            onChange={() => setPerm(true)}
            className="accent-amber-500"
          />
          <span className={cn('text-xs', permanent && 'text-amber-400 font-medium')}>
            Delete permanently{permanent && ' — this cannot be undone'}
          </span>
        </label>
      </div>

      {secondsLeft !== null && (
        <p className="mx-4 mb-1 text-[11px] text-muted-foreground/60">
          Request will expire in {secondsLeft}s
        </p>
      )}

      {/* Buttons */}
      <div className="flex justify-end gap-2 px-4 pb-3.5 pt-1 border-t border-border/30 mt-1">
        <Button
          variant="ghost" size="sm" disabled={busy}
          onClick={() => respond(false)}
          className="text-xs h-7 px-3"
        >
          Cancel
        </Button>
        <Button
          size="sm" disabled={busy}
          onClick={() => respond(true)}
          className="text-xs h-7 px-3 text-white"
          style={{ background: permanent ? 'hsl(38 92% 50%)' : 'hsl(0 72% 51%)' }}
        >
          {busy ? 'Deleting…' : permanent ? 'Delete Forever' : 'Move to Bin'}
        </Button>
      </div>
    </motion.div>
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function FileRWPermissionDialog({ permission, onResolve }: Props) {
  if (permission.resolved) {
    return (
      <ResolvedChip
        approved={!!permission.approved}
        operation={permission.operation}
      />
    );
  }

  if (permission.permission_level === 'delete') {
    return <DeleteDialog permission={permission} onResolve={onResolve} />;
  }

  return <WriteDialog permission={permission} onResolve={onResolve} />;
}
