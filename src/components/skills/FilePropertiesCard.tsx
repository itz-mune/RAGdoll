/**
 * FilePropertiesCard — rendered when the file_rw stats operation returns.
 * Detected via __RAGDOLL_FILE_STATS__…__RAGDOLL_FILE_STATS__ markers.
 */
import {
  File, Folder, Link, Eye, Pencil, Terminal,
  ExternalLink, Clock, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Marker parsing ────────────────────────────────────────────────────────────

const STATS_MARKER = '__RAGDOLL_FILE_STATS__';

export interface FileStatsData {
  name: string;
  absolute_path: string;
  size_bytes: number;
  size_human: string;
  is_file: boolean;
  is_directory: boolean;
  is_symlink: boolean;
  is_hidden: boolean;
  extension: string;
  mime_type: string;
  created_at: string;
  modified_at: string;
  accessed_at: string;
  permissions_octal: string;
  permissions_human: string;
  owner: string;
  is_readable: boolean;
  is_writable: boolean;
  is_executable: boolean;
  child_count: number | null;
  total_size: number | null;
}

export function parseFileStats(text: string): {
  before: string;
  stats: FileStatsData | null;
  after: string;
} {
  const start = text.indexOf(STATS_MARKER);
  if (start === -1) return { before: text, stats: null, after: '' };
  const end = text.indexOf(STATS_MARKER, start + STATS_MARKER.length);
  if (end === -1) return { before: text, stats: null, after: '' };

  const before = text.slice(0, start).trimEnd();
  const raw    = text.slice(start + STATS_MARKER.length, end);
  const after  = text.slice(end + STATS_MARKER.length).trimStart();

  try {
    return { before, stats: JSON.parse(raw) as FileStatsData, after };
  } catch {
    return { before: text, stats: null, after: '' };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function BoolBadge({ value }: { value: boolean }) {
  return value ? (
    <span className="text-green-400 font-medium">✓</span>
  ) : (
    <span className="text-muted-foreground/50">✗</span>
  );
}

function Row({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="flex items-start gap-2 py-1 border-b border-border/20 last:border-0">
      <span className="text-[11px] text-muted-foreground w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-[12px] flex-1 min-w-0 font-mono break-all" title={title}>
        {value}
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface FilePropertiesCardProps {
  stats: FileStatsData;
  className?: string;
}

export function FilePropertiesCard({ stats, className }: FilePropertiesCardProps) {
  const openFolder = async () => {
    try {
      const tauri = (window as Window & {
        __TAURI__?: { shell?: { open?: (p: string) => Promise<void> } }
      }).__TAURI__;
      if (tauri?.shell?.open) {
        const parent = stats.is_directory
          ? stats.absolute_path
          : stats.absolute_path.replace(/[/\\][^/\\]+$/, '');
        await tauri.shell.open(parent);
      }
    } catch { /* not in Tauri */ }
  };

  const TypeIcon = stats.is_directory
    ? Folder
    : stats.is_symlink
    ? Link
    : File;

  return (
    <div
      className={cn(
        'my-2 rounded-xl border border-border/50 bg-muted/10 overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/40 bg-muted/20">
        <TypeIcon className="h-4 w-4 text-primary/70 shrink-0" />
        <span className="text-sm font-semibold truncate">{stats.name}</span>
        {stats.is_hidden && (
          <span className="text-[10px] text-muted-foreground border border-border/50 rounded px-1">
            hidden
          </span>
        )}
        {stats.mime_type && (
          <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
            {stats.mime_type}
          </span>
        )}
      </div>

      {/* Properties grid */}
      <div className="px-4 py-2">
        <Row
          label="Full path"
          value={
            <span className="text-[11px]" title={stats.absolute_path}>
              {stats.absolute_path}
            </span>
          }
        />
        <Row
          label="Size"
          value={`${stats.size_human} (${stats.size_bytes.toLocaleString()} bytes)`}
        />
        {stats.is_directory && stats.child_count !== null && (
          <Row label="Contents" value={`${stats.child_count} items`} />
        )}
        {stats.is_directory && stats.total_size !== null && (
          <Row label="Total size" value={`${stats.total_size.toLocaleString()} bytes`} />
        )}

        <div className="mt-1 mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide pt-1">
          <Clock className="h-3 w-3" /> Dates
        </div>
        <Row label="Modified" value={relativeTime(stats.modified_at)} title={stats.modified_at} />
        <Row label="Created"  value={relativeTime(stats.created_at)}  title={stats.created_at}  />
        <Row label="Accessed" value={relativeTime(stats.accessed_at)} title={stats.accessed_at} />

        <div className="mt-1 mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide pt-1">
          <Shield className="h-3 w-3" /> Permissions
        </div>
        <Row
          label="Mode"
          value={`${stats.permissions_human}  ${stats.permissions_octal}`}
        />
        <Row label="Owner" value={stats.owner} />
        <Row
          label="Access"
          value={
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" /> <BoolBadge value={stats.is_readable} />
              </span>
              <span className="flex items-center gap-1">
                <Pencil className="h-3 w-3" /> <BoolBadge value={stats.is_writable} />
              </span>
              <span className="flex items-center gap-1">
                <Terminal className="h-3 w-3" /> <BoolBadge value={stats.is_executable} />
              </span>
            </span>
          }
        />
      </div>

      {/* Footer */}
      <div className="border-t border-border/30 px-4 py-2">
        <button
          onClick={openFolder}
          className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in file explorer
        </button>
      </div>
    </div>
  );
}
