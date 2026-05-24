/**
 * FileResultDisplay — renders the structured file results emitted by the
 * universal-file-access skill as a card list instead of raw markdown.
 *
 * The skill embeds its results between __RAGDOLL_FILES__…__RAGDOLL_FILES__
 * markers.  MessageThread detects this pattern, splits the content, and
 * renders this component for the marked section.
 */
import { useState } from 'react';
import {
  FileText, FileSpreadsheet, FileCode, Image, Film, Archive,
  File, FolderOpen, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Marker parsing ────────────────────────────────────────────────────────────

const MARKER = '__RAGDOLL_FILES__';

export interface FileResultEntry {
  path: string;
  name: string;
  extension: string;
  score: number;
  modified_at: number;
  size_bytes: number;
  match_reason: string;
}

export function parseFileResults(text: string): {
  before: string;
  results: FileResultEntry[] | null;
  after: string;
} {
  const start = text.indexOf(MARKER);
  if (start === -1) return { before: text, results: null, after: '' };
  const end = text.indexOf(MARKER, start + MARKER.length);
  if (end === -1) return { before: text, results: null, after: '' };

  const before = text.slice(0, start).trimEnd();
  const json   = text.slice(start + MARKER.length, end);
  const after  = text.slice(end + MARKER.length).trimStart();

  try {
    const results = JSON.parse(json) as FileResultEntry[];
    return { before, results, after };
  } catch {
    return { before: text, results: null, after: '' };
  }
}

// ── File type icon ────────────────────────────────────────────────────────────

function FileIcon({ ext, className }: { ext: string; className?: string }) {
  const cls = cn('h-4 w-4 shrink-0', className);
  const e = ext.toLowerCase();
  if (['docx', 'doc', 'odt', 'rtf', 'txt', 'md', 'pdf'].includes(e))
    return <FileText className={cls} />;
  if (['xlsx', 'xls', 'csv', 'numbers'].includes(e))
    return <FileSpreadsheet className={cls} />;
  if (['pptx', 'ppt', 'key'].includes(e))
    return <FileCode className={cls} />;
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'heic'].includes(e))
    return <Image className={cls} />;
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(e))
    return <Film className={cls} />;
  if (['zip', '7z', 'tar', 'gz', 'rar'].includes(e))
    return <Archive className={cls} />;
  if (['py', 'js', 'ts', 'rs', 'cpp', 'c', 'h', 'java', 'go', 'sh', 'ps1'].includes(e))
    return <FileCode className={cls} />;
  return <File className={cls} />;
}

// ── Score dot ─────────────────────────────────────────────────────────────────

function ScoreDot({ score }: { score: number }) {
  const color =
    score >= 0.8 ? 'bg-green-500' :
    score >= 0.5 ? 'bg-amber-400' :
                   'bg-muted-foreground/40';
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full shrink-0', color)}
      title={`Match: ${Math.round(score * 100)}%`}
    />
  );
}

// ── Human-readable helpers ────────────────────────────────────────────────────

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function humanDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function parentDir(path: string): string {
  const sep = path.includes('\\') ? '\\' : '/';
  const parts = path.split(sep);
  parts.pop();
  return parts.join(sep) || sep;
}

// ── Row ───────────────────────────────────────────────────────────────────────

function FileRow({ entry }: { entry: FileResultEntry }) {
  const [opening, setOpening] = useState(false);

  const handleOpen = async () => {
    setOpening(true);
    try {
      // Use the Tauri core invoke bridge to open a folder without importing
      // plugin-shell (which may not be in node_modules in all setups).
      // Falls back silently in browser / dev mode.
      const tauri = (window as Window & { __TAURI__?: { shell?: { open?: (p: string) => Promise<void> } } }).__TAURI__;
      if (tauri?.shell?.open) {
        await tauri.shell.open(parentDir(entry.path));
      }
    } catch {
      /* not in Tauri runtime — ignore */
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/40">
      {/* Icon */}
      <FileIcon
        ext={entry.extension}
        className="text-primary/70"
      />

      {/* Name + path */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          {entry.name}{entry.extension ? `.${entry.extension}` : ''}
        </p>
        <p
          className="truncate text-[11px] text-muted-foreground font-mono"
          title={entry.path}
        >
          {entry.path.length > 56
            ? '…' + entry.path.slice(-56)
            : entry.path}
        </p>
      </div>

      {/* Meta */}
      <div className="hidden shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted-foreground sm:flex">
        <span>{humanDate(entry.modified_at)}</span>
        <span>{humanSize(entry.size_bytes)}</span>
      </div>

      {/* Score dot */}
      <ScoreDot score={entry.score} />

      {/* Open folder button */}
      <button
        onClick={handleOpen}
        disabled={opening}
        title="Open containing folder"
        className={cn(
          'ml-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity',
          'hover:bg-muted hover:text-foreground group-hover:opacity-100',
          opening && 'animate-pulse'
        )}
      >
        <FolderOpen className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface FileResultDisplayProps {
  results: FileResultEntry[];
  className?: string;
}

export function FileResultDisplay({ results, className }: FileResultDisplayProps) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? results : results.slice(0, 6);

  if (results.length === 0) return null;

  return (
    <div
      className={cn(
        'my-2 rounded-xl border border-border/50 bg-muted/10 overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <ExternalLink className="h-3.5 w-3.5 text-primary/70" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {results.length} file{results.length !== 1 ? 's' : ''} found
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/20">
        {visible.map((entry, i) => (
          <FileRow key={`${entry.path}-${i}`} entry={entry} />
        ))}
      </div>

      {/* Show more */}
      {!showAll && results.length > 6 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2 text-xs text-primary hover:bg-muted/30 transition-colors"
        >
          Show {results.length - 6} more result{results.length - 6 !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}
