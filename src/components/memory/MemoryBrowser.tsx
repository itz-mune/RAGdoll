import { useCallback, useEffect, useState } from 'react';
import {
  Brain, FileText, FileSpreadsheet, Braces, FileCode,
  Search, Trash2, RefreshCw, Plus, ChevronDown, ChevronUp,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const SIDECAR_URL = 'http://127.0.0.1:8765';
const ACCEPTED_EXTENSIONS = ['txt', 'md', 'pdf', 'docx', 'csv', 'json'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemoryStats {
  semantic_count: number;
  document_count: number;
  total_size_mb: number;
}

interface MemoryChunkRow {
  id: string;
  text: string;
  score: number;
  source: string;
  role: string;
  importance: number;
  access_count: number;
  is_compacted: boolean;
  conversation_id: string;
}

interface DocumentRow {
  filename: string;
  chunk_count: number;
  created_at: number;
  total_chars: number;
}

// ── File icon helper ──────────────────────────────────────────────────────────

function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const base = cn('h-4 w-4 shrink-0', className);
  if (ext === 'pdf') return <FileText className={cn(base, 'text-red-400')} />;
  if (ext === 'csv') return <FileSpreadsheet className={cn(base, 'text-green-400')} />;
  if (ext === 'json') return <Braces className={cn(base, 'text-yellow-400')} />;
  if (ext === 'md') return <FileCode className={cn(base, 'text-blue-400')} />;
  return <FileText className={base} />;
}

// ── Importance bar ────────────────────────────────────────────────────────────

function ImportanceBar({ value }: { value: number }) {
  const color = value > 0.7 ? 'bg-green-500' : value > 0.4 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div
      className="flex items-center gap-1.5"
      title={`Memory importance: ${(value * 100).toFixed(0)}% — higher values are retrieved more often during conversation`}
    >
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value * 100}%` }} />
      </div>
      <span className="tabular-nums text-[10px] text-muted-foreground">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MemoryBrowserProps {
  initialTab?: 'conversations' | 'documents';
}

export function MemoryBrowser({ initialTab = 'conversations' }: MemoryBrowserProps) {
  const [tab, setTab] = useState<'conversations' | 'documents'>(initialTab);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [query, setQuery] = useState('');
  const [chunks, setChunks] = useState<MemoryChunkRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearAllConfirm, setClearAllConfirm] = useState('');
  const [deleteDocTarget, setDeleteDocTarget] = useState<string | null>(null);
  const [deleteChunkTarget, setDeleteChunkTarget] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${SIDECAR_URL}/memory/stats`);
      if (r.ok) setStats(await r.json());
    } catch { /* sidecar not running */ }
  }, []);

  const fetchRecent = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${SIDECAR_URL}/memory/recent?limit=20`);
      if (r.ok) setChunks(await r.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const fetchChunks = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const r = await fetch(`${SIDECAR_URL}/memory/search?q=${encodeURIComponent(q)}&limit=20`);
      if (r.ok) setChunks(await r.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${SIDECAR_URL}/memory/documents`);
      if (r.ok) setDocuments(await r.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (tab === 'documents') fetchDocuments();
  }, [tab, fetchDocuments]);

  // Load conversations tab: recent on mount / tab-switch, search when typing
  useEffect(() => {
    if (tab !== 'conversations') return;
    if (!query.trim()) {
      fetchRecent();
      return;
    }
    const t = setTimeout(() => fetchChunks(query), 300);
    return () => clearTimeout(t);
  }, [query, tab, fetchChunks, fetchRecent]);

  const handleCompact = async () => {
    setCompacting(true);
    try {
      await fetch(`${SIDECAR_URL}/memory/compact`, { method: 'POST' });
      await fetchStats();
    } finally { setCompacting(false); }
  };

  const handleDeleteChunk = async () => {
    if (!deleteChunkTarget) return;
    await fetch(`${SIDECAR_URL}/memory/chunks/${deleteChunkTarget}`, { method: 'DELETE' });
    setChunks((prev) => prev.filter((c) => c.id !== deleteChunkTarget));
    setDeleteChunkTarget(null);
    fetchStats();
  };

  const handleDeleteDoc = async () => {
    if (!deleteDocTarget) return;
    await fetch(`${SIDECAR_URL}/memory/documents/${encodeURIComponent(deleteDocTarget)}`, { method: 'DELETE' });
    setDocuments((prev) => prev.filter((d) => d.filename !== deleteDocTarget));
    setDeleteDocTarget(null);
    fetchStats();
  };

  const handleClearAll = async () => {
    if (clearAllConfirm.toLowerCase() !== 'clear') return;
    await fetch(`${SIDECAR_URL}/memory/all`, { method: 'DELETE' });
    setChunks([]);
    setClearAllOpen(false);
    setClearAllConfirm('');
    fetchStats();
  };

  const handleAddDocument = async () => {
    setUploadError(null);
    setUploading(true);
    try {
      const result = await open({
        multiple: true,
        filters: [{ name: 'Documents', extensions: ACCEPTED_EXTENSIONS }],
      });
      if (!result) return; // user cancelled
      const paths = Array.isArray(result) ? result : [result];
      const errors: string[] = [];
      for (const path of paths) {
        const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
        try {
          const data = await readFile(path);
          const form = new FormData();
          form.append('files', new Blob([data], { type: 'application/octet-stream' }), name);
          const r = await fetch(`${SIDECAR_URL}/files/process?store_permanently=true`, {
            method: 'POST',
            body: form,
          });
          if (!r.ok) {
            errors.push(`${name}: server error ${r.status}`);
            continue;
          }
          const json = await r.json();
          const fileResult = json.files?.[0];
          if (fileResult?.error) errors.push(`${name}: ${fileResult.error}`);
        } catch (fileErr) {
          errors.push(`${name}: ${fileErr instanceof Error ? fileErr.message : String(fileErr)}`);
        }
      }
      if (errors.length > 0) setUploadError(errors.join('\n'));
      await fetchDocuments();
      await fetchStats();
    } catch (err) {
      // only network-level or dialog errors reach here
      if (err instanceof Error && !err.message.includes('cancel')) {
        setUploadError(`Upload failed: ${err.message}`);
      }
    } finally { setUploading(false); }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Stats bar */}
      <div className="flex shrink-0 items-center gap-4 border-b border-border/50 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
        <Brain className="h-3.5 w-3.5 shrink-0 text-primary/70" />
        {stats ? (
          <>
            <span><strong className="text-foreground">{stats.semantic_count}</strong> memories</span>
            <span><strong className="text-foreground">{stats.document_count}</strong> doc chunks</span>
            <span><strong className="text-foreground">{stats.total_size_mb}</strong> MB</span>
          </>
        ) : (
          <span>Loading stats…</span>
        )}
        <div className="ml-auto flex gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            onClick={handleCompact}
            disabled={compacting}
            className="h-6 gap-1 px-2 text-[11px]"
          >
            <RefreshCw className={cn('h-3 w-3', compacting && 'animate-spin')} />
            {compacting ? 'Optimising…' : 'Optimise'}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setClearAllOpen(true)}
            className="h-6 gap-1 px-2 text-[11px] text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
            Clear all
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-border/50">
        {(['conversations', 'documents'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 text-xs font-medium capitalize transition-colors',
              tab === t
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'conversations' ? (
          <ConversationsTab
            query={query}
            onQueryChange={setQuery}
            chunks={chunks}
            loading={loading}
            onDeleteChunk={setDeleteChunkTarget}
          />
        ) : (
          <DocumentsTab
            documents={documents}
            loading={loading}
            uploading={uploading}
            uploadError={uploadError}
            onAddDocument={handleAddDocument}
            onDismissError={() => setUploadError(null)}
            onDeleteDocument={setDeleteDocTarget}
          />
        )}
      </div>

      {/* Delete chunk dialog */}
      <AlertDialog open={!!deleteChunkTarget} onOpenChange={(o) => { if (!o) setDeleteChunkTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this memory?</AlertDialogTitle>
            <AlertDialogDescription>This chunk will be permanently removed from your knowledge base.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChunk} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete document dialog */}
      <AlertDialog open={!!deleteDocTarget} onOpenChange={(o) => { if (!o) setDeleteDocTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove document?</AlertDialogTitle>
            <AlertDialogDescription>
              All {documents.find((d) => d.filename === deleteDocTarget)?.chunk_count ?? ''} chunks
              for <strong>{deleteDocTarget}</strong> will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDoc} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear all dialog — requires typing "clear" */}
      <AlertDialog open={clearAllOpen} onOpenChange={(o) => { if (!o) { setClearAllOpen(false); setClearAllConfirm(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all semantic memory?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every conversation memory chunk. Documents are kept.
              Type <strong>clear</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            className="mx-6 rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
            placeholder="Type 'clear' to confirm"
            value={clearAllConfirm}
            onChange={(e) => setClearAllConfirm(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              disabled={clearAllConfirm.toLowerCase() !== 'clear'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
            >
              Clear all memory
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Conversations tab ─────────────────────────────────────────────────────────

function ConversationsTab({
  query,
  onQueryChange,
  chunks,
  loading,
  onDeleteChunk,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  chunks: MemoryChunkRow[];
  loading: boolean;
  onDeleteChunk: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search your memories…"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {loading && (
          <p className="py-8 text-center text-xs text-muted-foreground">{query ? 'Searching…' : 'Loading…'}</p>
        )}
        {!loading && chunks.length === 0 && query && (
          <p className="py-8 text-center text-xs text-muted-foreground">No memories found for this query.</p>
        )}
        {!loading && chunks.length === 0 && !query && (
          <p className="py-8 text-center text-xs text-muted-foreground">No memories stored yet.</p>
        )}
        {!loading && chunks.length > 0 && (
          <p className="pt-1 pb-0.5 text-[10px] text-muted-foreground/60">
            {query ? `${chunks.length} result${chunks.length !== 1 ? 's' : ''}` : 'Recent memories'}
          </p>
        )}
        {chunks.map((chunk) => (
          <ChunkCard key={chunk.id} chunk={chunk} onDelete={onDeleteChunk} />
        ))}
      </div>
    </div>
  );
}

function ChunkCard({ chunk, onDelete }: { chunk: MemoryChunkRow; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = chunk.text.length > 160;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5 text-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground capitalize">
              {chunk.source}
            </span>
            {chunk.is_compacted && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">compacted</span>
            )}
            {chunk.access_count > 0 && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                Retrieved {chunk.access_count}×
              </span>
            )}
          </div>
          <ImportanceBar value={chunk.importance} />
        </div>
        <button
          onClick={() => onDelete(chunk.id)}
          className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <p className={cn('leading-relaxed text-muted-foreground', !expanded && isLong && 'line-clamp-3')}>
        {chunk.text}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-0.5 text-[10px] text-primary hover:underline"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

// ── Documents tab ─────────────────────────────────────────────────────────────

function DocumentsTab({
  documents,
  loading,
  uploading,
  uploadError,
  onAddDocument,
  onDismissError,
  onDeleteDocument,
}: {
  documents: DocumentRow[];
  loading: boolean;
  uploading: boolean;
  uploadError: string | null;
  onAddDocument: () => void;
  onDismissError: () => void;
  onDeleteDocument: (filename: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 flex items-center justify-between px-3 pt-3 pb-2">
        <p className="text-xs text-muted-foreground">
          {documents.length === 0 ? 'No documents stored' : `${documents.length} document${documents.length !== 1 ? 's' : ''}`}
        </p>
        <Button
          variant="outline"
          size="xs"
          onClick={onAddDocument}
          disabled={uploading}
          className="h-6 gap-1 px-2 text-[11px]"
        >
          <Plus className="h-3 w-3" />
          {uploading ? 'Uploading…' : 'Add document'}
        </Button>
      </div>

      {uploadError && (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="flex-1 whitespace-pre-wrap">{uploadError}</span>
          <button onClick={onDismissError} className="shrink-0 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {loading && <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>}
        {!loading && documents.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 py-10 text-center">
            <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              No documents in the knowledge base yet.
              <br />
              Click &#8220;Add document&#8221; to store one permanently.
            </p>
          </div>
        )}
        {documents.map((doc) => (
          <DocumentCard key={doc.filename} doc={doc} onDelete={onDeleteDocument} />
        ))}
      </div>
    </div>
  );
}

function DocumentCard({
  doc,
  onDelete,
}: {
  doc: DocumentRow;
  onDelete: (filename: string) => void;
}) {
  const date = new Date(doc.created_at * 1000).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const kb = Math.round(doc.total_chars / 1024);

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/20 p-2.5">
      <FileIcon name={doc.filename} className="mt-0.5" />
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="truncate text-xs font-medium">{doc.filename}</p>
        <p className="text-[10px] text-muted-foreground">
          {doc.chunk_count} chunks · {kb} KB · stored {date}
        </p>
      </div>
      <button
        onClick={() => onDelete(doc.filename)}
        className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
