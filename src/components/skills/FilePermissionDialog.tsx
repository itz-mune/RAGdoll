/**
 * FilePermissionDialog — renders inline in the message thread (not a modal overlay)
 * so the user can see the conversation context that triggered the request.
 *
 * Appears as a special chat bubble with an accent-coloured left border.
 * Transitions to a compact confirmation chip after the user decides.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Folder, File, AlertTriangle, Search, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SIDECAR = 'http://127.0.0.1:8765';
// Timeout countdown starts at WARN_AT seconds before the 60 s server timeout.
const SERVER_TIMEOUT = 60;
const WARN_AT = 45;

interface PendingPermission {
  id: string;
  files: string[];
  is_critical: boolean;
  resolved: boolean;
  approved: boolean | null;
}

interface Props {
  permission: PendingPermission;
  onResolve: (approved: boolean) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDir(path: string): boolean {
  // Treat paths with no extension (or ending in separator) as directories
  const base = path.split(/[/\\]/).pop() ?? '';
  return !base.includes('.') || path.endsWith('/') || path.endsWith('\\');
}

function truncateMid(path: string, maxLen = 48): string {
  if (path.length <= maxLen) return path;
  const half = Math.floor((maxLen - 3) / 2);
  return path.slice(0, half) + '…' + path.slice(-half);
}

function ExtIcon({ extension }: { extension: string }) {
  const cls = 'h-3.5 w-3.5 shrink-0 text-muted-foreground';
  if (!extension) return <File className={cls} />;
  return <File className={cls} />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FilePermissionDialog({ permission, onResolve }: Props) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedAt = useRef(Date.now());

  // Countdown timer (only shows in the last 15 s before expiry)
  useEffect(() => {
    if (permission.resolved) return;
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - mountedAt.current) / 1000;
      const remaining = Math.max(0, SERVER_TIMEOUT - elapsed);
      if (elapsed >= WARN_AT) {
        setSecondsLeft(Math.ceil(remaining));
      }
      if (remaining <= 0) {
        clearInterval(intervalRef.current!);
        // The sidecar already timed-out and returned false; treat as denied.
        onResolve(false);
      }
    }, 500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [permission.resolved, onResolve]);

  const respond = useCallback(
    async (approved: boolean) => {
      setBusy(true);
      try {
        await fetch(`${SIDECAR}/permissions/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: permission.id, approved }),
        });
      } catch {
        /* best-effort — sidecar may have already timed out */
      } finally {
        setBusy(false);
        onResolve(approved);
      }
    },
    [permission.id, onResolve]
  );

  // ── Resolved state (compact chip) ─────────────────────────────────────────
  if (permission.resolved) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 text-xs text-muted-foreground py-1"
      >
        {permission.approved ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            Access granted — searching…
          </>
        ) : (
          <>
            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            Access denied
          </>
        )}
      </motion.div>
    );
  }

  const { files, is_critical } = permission;
  const shown = expanded ? files : files.slice(0, 3);
  const hidden = files.length - 3;

  const accentStyle = is_critical
    ? { borderLeftColor: 'hsl(38 92% 50%)' }
    : { borderLeftColor: 'var(--accent)' };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'glass my-2 w-full max-w-[520px] mx-auto rounded-xl border border-border/60 pl-3.5',
        'border-l-2 shadow-lg'
      )}
      style={accentStyle}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 pt-3.5 pr-4 pb-2">
        {is_critical ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <Search className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        )}
        <div className="flex-1">
          <p className="text-sm font-semibold leading-tight">
            {is_critical ? 'Sensitive Directory Access' : 'File Access Request'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {is_critical
              ? 'RAGdoll is requesting access to a system directory. This area contains critical operating system files.'
              : 'RAGdoll wants to search the following location(s):'}
          </p>
        </div>
      </div>

      {/* File list */}
      <div className="mx-1 mb-2 rounded-lg bg-muted/30 px-3 py-2 space-y-1.5">
        {shown.map((f) => (
          <div key={f} className="flex items-center gap-2 min-w-0">
            {isDir(f) ? (
              <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />
            ) : (
              <ExtIcon extension={f.split('.').pop() ?? ''} />
            )}
            <span
              className={cn(
                'truncate text-xs font-mono',
                is_critical ? 'text-amber-500' : 'text-foreground'
              )}
              title={f}
            >
              {truncateMid(f)}
            </span>
          </div>
        ))}

        {!expanded && hidden > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
          >
            <ChevronDown className="h-3 w-3" />
            Show {hidden} more
          </button>
        )}
        {expanded && files.length > 3 && (
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-0.5"
          >
            <ChevronUp className="h-3 w-3" />
            Show fewer
          </button>
        )}
      </div>

      {is_critical && (
        <p className="mx-4 mb-2 text-xs text-muted-foreground leading-relaxed">
          Allowing access here is generally safe for read-only searches, but
          proceed with caution.
        </p>
      )}

      {/* Timeout warning */}
      {secondsLeft !== null && (
        <p className="mx-4 mb-1 text-[11px] text-muted-foreground/70">
          Request will expire in {secondsLeft}s
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 px-4 pb-3.5 pt-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => respond(false)}
          className="text-xs h-7 px-3"
        >
          {is_critical ? 'Cancel' : 'Deny'}
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => respond(true)}
          className="text-xs h-7 px-3 text-white"
          style={
            is_critical
              ? { background: 'hsl(38 92% 50%)' }
              : { background: 'var(--accent)' }
          }
        >
          {busy ? 'Working…' : is_critical ? 'Proceed Anyway →' : 'Allow Access →'}
        </Button>
      </div>
    </motion.div>
  );
}
