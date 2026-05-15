import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';

interface PdfTextItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}
import {
  X, FileText, FileSpreadsheet, Braces, FileCode,
  AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

const SIDECAR_URL = 'http://127.0.0.1:8765';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocViewerProps {
  filename: string;
  chunkTexts: string[];
  onClose: () => void;
}

type Status = 'loading' | 'ready' | 'not-found' | 'error';

interface Segment { text: string; highlight: boolean }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileExt(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function DocIcon({ filename, size = 'sm' }: { filename: string; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
  const ext = fileExt(filename);
  if (ext === 'pdf')  return <FileText className={cn(cls, 'text-red-400')} />;
  if (ext === 'csv')  return <FileSpreadsheet className={cn(cls, 'text-green-400')} />;
  if (ext === 'json') return <Braces className={cn(cls, 'text-yellow-400')} />;
  if (ext === 'md')   return <FileCode className={cn(cls, 'text-blue-400')} />;
  if (ext === 'docx') return <FileText className={cn(cls, 'text-blue-600')} />;
  return <FileText className={cls} />;
}

/**
 * Find a normalised chunk inside `content` (which may have different whitespace).
 * Returns [startIndex, endIndex] in the original content, or null if not found.
 */
function findChunkInContent(content: string, normChunk: string): [number, number] | null {
  if (normChunk.length < 8) return null;

  // Build a regex from the first 80 chars of the normalised chunk, treating spaces as \s+
  const probe = normChunk.slice(0, 80);
  const escaped = probe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/ /g, '\\s+');

  let regex: RegExp;
  try { regex = new RegExp(pattern, 'i'); }
  catch { return null; }

  const match = regex.exec(content);
  if (!match) return null;

  // Walk forward from the start position, matching normChunk char-by-char with flexible whitespace
  const start = match.index;
  let ci = start; // cursor in original content
  let ni = 0;     // cursor in normalised chunk

  while (ni < normChunk.length && ci < content.length) {
    const nc = normChunk[ni];
    const cc = content[ci];
    if (nc === ' ') {
      // Chunk has a space — skip ALL whitespace in content
      if (!/\s/.test(cc)) break;
      ni++;
      while (ci < content.length && /\s/.test(content[ci])) ci++;
    } else if (nc.toLowerCase() === cc.toLowerCase()) {
      ni++; ci++;
    } else {
      break;
    }
  }

  return [start, ci];
}

/** Split `content` into plain / highlighted segments based on chunk matches. */
function buildSegments(content: string, chunkTexts: string[]): Segment[] {
  const ranges: [number, number][] = [];

  for (const chunk of chunkTexts) {
    if (!chunk.trim()) continue;
    const normChunk = chunk.replace(/\s+/g, ' ').trim();
    const result = findChunkInContent(content, normChunk);
    if (result) ranges.push(result);
  }

  if (ranges.length === 0) return [{ text: content, highlight: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }

  const segs: Segment[] = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (cursor < s) segs.push({ text: content.slice(cursor, s), highlight: false });
    segs.push({ text: content.slice(s, e), highlight: true });
    cursor = e;
  }
  if (cursor < content.length) segs.push({ text: content.slice(cursor), highlight: false });
  return segs;
}

// ── PDF Viewer ─────────────────────────────────────────────────────────────────

/** Draw amber highlight rectangles on the canvas for matching text items. */
function applyPdfHighlights(
  ctx: CanvasRenderingContext2D,
  items: PdfTextItem[],
  viewport: PageViewport,
  chunkTexts: string[],
) {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const haystacks = chunkTexts.map(norm);

  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = '#FBBF24';

  for (const item of items) {
    if (!item.str || item.str.trim().length < 3) continue;
    const needle = norm(item.str);
    if (!haystacks.some(h => h.includes(needle))) continue;

    // item.transform = [a, b, c, d, tx, ty] in PDF user space
    // viewport converts: canvasX = tx * scale, canvasY = height - ty * scale
    const [, , , d, tx, ty] = item.transform;
    const s = viewport.scale;
    const canvasX = tx * s;
    const canvasY = viewport.height - ty * s;
    const w = item.width * s;
    const h = Math.max((item.height || Math.abs(d)) * s, 4);

    ctx.fillRect(canvasX, canvasY - h, w, h);
  }

  ctx.restore();
}

function PdfPageCanvas({
  doc,
  pageNum,
  chunkTexts,
}: {
  doc: PDFDocumentProxy;
  pageNum: number;
  chunkTexts: string[];
}) {
  const wrapRef  = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageNum);
      if (cancelled) return;

      const containerW = wrapRef.current?.clientWidth ?? 760;
      const baseVp = page.getViewport({ scale: 1 });
      const scale = Math.min((containerW - 2) / baseVp.width, 2.5);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current!;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const ctx = canvas.getContext('2d')!;
      await page.render({ canvas: canvasRef.current!, canvasContext: ctx, viewport }).promise;
      if (cancelled) return;

      if (chunkTexts.length > 0) {
        const tc = await page.getTextContent();
        if (!cancelled) {
          applyPdfHighlights(
            ctx,
            tc.items.filter((i) => 'str' in i) as PdfTextItem[],
            viewport,
            chunkTexts,
          );
        }
      }

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [doc, pageNum, chunkTexts]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        className="block w-full rounded border border-border/20 shadow-sm"
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded bg-muted/20">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      )}
    </div>
  );
}

function PdfView({ filename, chunkTexts }: { filename: string; chunkTexts: string[] }) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState('');
  const url = `${SIDECAR_URL}/memory/documents/${encodeURIComponent(filename)}/file`;

  useEffect(() => {
    let cancelled = false;
    pdfjsLib.getDocument({ url, withCredentials: false }).promise
      .then(doc => { if (!cancelled) setPdfDoc(doc); })
      .catch(e => { if (!cancelled) setPdfError(e.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [url]);

  if (pdfError) return (
    <div className="space-y-4 p-5">
      <div className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-xs text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>Failed to load PDF: {pdfError}</span>
      </div>
      {chunkTexts.length > 0 && <ExcerptList chunkTexts={chunkTexts} />}
    </div>
  );

  if (!pdfDoc) return (
    <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
      Loading PDF…
    </div>
  );

  return (
    <div className="h-full overflow-auto p-5">
      {chunkTexts.length > 0 && (
        <p className="mb-3 text-center text-[10px] text-amber-500">
          {chunkTexts.length} excerpt{chunkTexts.length !== 1 ? 's' : ''} highlighted in amber
        </p>
      )}
      <div className="space-y-5">
        {Array.from({ length: pdfDoc.numPages }, (_, i) => (
          <PdfPageCanvas key={i + 1} doc={pdfDoc} pageNum={i + 1} chunkTexts={chunkTexts} />
        ))}
      </div>
      <p className="mt-3 text-center text-[10px] text-muted-foreground/50">
        {pdfDoc.numPages} page{pdfDoc.numPages !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

// ── CSV → table renderer ──────────────────────────────────────────────────────

function CsvView({ text, chunkTexts }: { text: string; chunkTexts: string[] }) {
  const rows = text.split('\n').filter(Boolean).map((r) => r.split('|').map((c) => c.trim()));
  const segs = buildSegments(text, chunkTexts);

  if (rows.length < 2) return <PlainTextView text={text} chunkTexts={chunkTexts} />;

  const [header, sep, ...data] = rows;
  void sep;

  const highlightedRows = new Set<number>();
  segs.filter((s) => s.highlight).forEach((s) => {
    data.forEach((row, i) => {
      if (row.some((cell) => s.text.includes(cell))) highlightedRows.add(i);
    });
  });

  return (
    <div className="overflow-auto p-4">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {header.filter(Boolean).map((h, i) => (
              <th key={i} className="border border-border/40 bg-muted/40 px-2 py-1.5 text-left font-medium text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 500).map((row, ri) => (
            <tr key={ri} className={highlightedRows.has(ri) ? 'bg-amber-400/15' : ri % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
              {row.map((cell, ci) => (
                <td key={ci} className="border border-border/30 px-2 py-1 text-foreground/80">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 500 && (
        <p className="mt-2 text-center text-[10px] text-muted-foreground">Showing first 500 rows of {data.length}</p>
      )}
    </div>
  );
}

// ── JSON renderer ─────────────────────────────────────────────────────────────

function JsonView({ text, chunkTexts }: { text: string; chunkTexts: string[] }) {
  let pretty = text;
  try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* use raw */ }
  return <PlainTextView text={pretty} chunkTexts={chunkTexts} mono />;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownView({ text, chunkTexts }: { text: string; chunkTexts: string[] }) {
  const [viewSource, setViewSource] = useState(false);
  const hasHighlights = chunkTexts.some((c) => text.includes(c.slice(0, 60)));

  return (
    <div className="flex flex-col h-full">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/30 px-4 py-2">
        <button
          onClick={() => setViewSource(false)}
          className={cn('text-[11px] px-2 py-0.5 rounded transition-colors',
            !viewSource ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Rendered
        </button>
        <button
          onClick={() => setViewSource(true)}
          className={cn('text-[11px] px-2 py-0.5 rounded transition-colors',
            viewSource ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Source
        </button>
        {hasHighlights && !viewSource && (
          <span className="ml-auto text-[10px] text-amber-500">
            Referenced excerpts shown below
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-5">
        {viewSource ? (
          <PlainTextView text={text} chunkTexts={chunkTexts} mono />
        ) : (
          <>
            <div className="prose prose-sm max-w-none dark:prose-invert
              prose-headings:text-foreground prose-p:text-foreground/80
              prose-code:bg-muted prose-code:px-1 prose-code:rounded
              prose-pre:bg-muted prose-pre:border prose-pre:border-border/40
              prose-blockquote:border-primary/40 prose-blockquote:text-muted-foreground
              prose-table:text-xs prose-th:bg-muted/40
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            </div>
            {chunkTexts.length > 0 && <ExcerptList chunkTexts={chunkTexts} />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Plain text renderer ───────────────────────────────────────────────────────

function PlainTextView({ text, chunkTexts, mono = false }: { text: string; chunkTexts: string[]; mono?: boolean }) {
  const segs = useMemo(() => buildSegments(text, chunkTexts), [text, chunkTexts]);
  return (
    <pre className={cn(
      'p-5 text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground/80 h-full',
      mono && 'font-mono',
    )}>
      {segs.map((seg, i) =>
        seg.highlight ? (
          <mark key={i} className="rounded-[3px] bg-amber-400/40 text-foreground px-0.5 [text-decoration:none] not-italic">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </pre>
  );
}

// ── Excerpt list ──────────────────────────────────────────────────────────────

function ExcerptList({ chunkTexts }: { chunkTexts: string[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-6 rounded-xl border border-amber-500/25 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 bg-amber-500/8 text-xs font-medium text-amber-500 hover:bg-amber-500/12 transition-colors"
      >
        <span>Referenced excerpts ({chunkTexts.length})</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="divide-y divide-border/20">
          {chunkTexts.map((text, i) => (
            <p key={i} className="px-4 py-3 text-xs leading-relaxed text-foreground/80">{text}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Not-found fallback ────────────────────────────────────────────────────────

function NotFoundView({ filename, chunkTexts }: { filename: string; chunkTexts: string[] }) {
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-xs text-amber-500">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>{filename}</strong> was not found on disk — it may have been attached before
          this session or the sidecar was restarted. Re-attach the file to make it viewable.
          Showing the retrieved excerpts below.
        </span>
      </div>
      {chunkTexts.length > 0 && <ExcerptList chunkTexts={chunkTexts} />}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function DocumentViewerModal({ filename, chunkTexts, onClose }: DocViewerProps) {
  const ext = fileExt(filename);
  const isPdf = ext === 'pdf';
  const matchCount = chunkTexts.length;

  // Non-PDF files: fetch extracted text from sidecar
  const [status, setStatus] = useState<Status>(isPdf ? 'ready' : 'loading');
  const [fullText, setFullText] = useState('');

  useEffect(() => {
    if (isPdf) return;
    const url = `${SIDECAR_URL}/memory/documents/${encodeURIComponent(filename)}/text`;
    fetch(url)
      .then(async (r) => {
        if (r.status === 404) { setStatus('not-found'); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setFullText(data.text ?? '');
        setStatus('ready');
      })
      .catch((e) => { console.error('[DocViewer]', e); setStatus('error'); });
  }, [filename, isPdf]);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const textContentNode = useMemo(() => {
    if (status !== 'ready' || isPdf) return null;
    switch (ext) {
      case 'md':   return <MarkdownView text={fullText} chunkTexts={chunkTexts} />;
      case 'csv':  return <CsvView text={fullText} chunkTexts={chunkTexts} />;
      case 'json': return <JsonView text={fullText} chunkTexts={chunkTexts} />;
      default:     return <PlainTextView text={fullText} chunkTexts={chunkTexts} />;
    }
  }, [status, isPdf, ext, fullText, chunkTexts]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/55 backdrop-blur-[3px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 8 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="relative flex flex-col w-full max-w-4xl h-[88vh] rounded-2xl border border-border/50 bg-background shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-5 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <DocIcon filename={filename} />
            <span className="text-sm font-semibold truncate">{filename}</span>
            {matchCount > 0 && (
              <span className="shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                {matchCount} excerpt{matchCount !== 1 ? 's' : ''} highlighted
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon-xs" onClick={onClose} className="h-7 w-7 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-background">
          {isPdf ? (
            <PdfView filename={filename} chunkTexts={chunkTexts} />
          ) : (
            <>
              {status === 'loading' && (
                <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
                  Loading…
                </div>
              )}
              {status === 'error' && (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-destructive">Failed to load document.</p>
                </div>
              )}
              {status === 'not-found' && (
                <NotFoundView filename={filename} chunkTexts={chunkTexts} />
              )}
              {status === 'ready' && (
                ext === 'md' ? textContentNode : (
                  <div className="h-full overflow-auto">{textContentNode}</div>
                )
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
