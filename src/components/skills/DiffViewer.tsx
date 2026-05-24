/**
 * DiffViewer — expandable/collapsible inline diff view.
 *
 * Collapsed: single row showing filename, +N -N badges, and (if pending)
 *   Approve / Deny buttons.
 * Expanded: full hunk-by-hunk diff with line numbers, syntax token coloring,
 *   and character-level highlighting for similar adjacent delete/insert pairs.
 *
 * Embedded by FileRWPermissionDialog (pending=true) and
 * FileOperationResult (pending=false, read-only).
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, FileText, Clipboard, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ── Types (mirrored from diff_engine.py DiffResult.to_dict) ──────────────────

/** [cssClass, text] tuple — emitted by diff_engine.py Pygments tokenizer */
export type DiffToken = [string, string];

export interface DiffLineData {
  type: 'context' | 'insert' | 'delete';
  content: string;
  original_lineno: number | null;
  modified_lineno: number | null;
  tokens: DiffToken[];
}

export interface DiffHunkData {
  original_start: number;
  original_count: number;
  modified_start: number;
  modified_count: number;
  lines: DiffLineData[];
}

export interface DiffResult {
  filename: string;
  is_binary: boolean;
  partial: boolean;
  simplified: boolean;
  additions: number;
  deletions: number;
  original_lines: number;
  modified_lines: number;
  original_size: number;
  modified_size: number;
  diff_ratio: number;
  syntax_language: string;
  hunks: DiffHunkData[];
}

// ── Character-level diff helper ────────────────────────────────────────────────
// When a delete line is immediately followed by an insert line and they are
// similar (ratio > 0.4), we highlight the specific changed characters.

function charLevelDiff(
  a: string,
  b: string,
): { aSpans: { text: string; changed: boolean }[]; bSpans: { text: string; changed: boolean }[] } {
  // LCS-based character diff
  const m = a.length, n = b.length;
  if (m === 0 && n === 0) return { aSpans: [], bSpans: [] };

  // Build LCS table (limit to 300 chars to stay fast)
  const A = a.slice(0, 300), B = b.slice(0, 300);
  const dp: number[][] = Array.from({ length: A.length + 1 }, () =>
    new Array(B.length + 1).fill(0)
  );
  for (let i = 1; i <= A.length; i++)
    for (let j = 1; j <= B.length; j++)
      dp[i][j] = A[i - 1] === B[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  // Backtrack
  const aChanged: boolean[] = new Array(A.length).fill(true);
  const bChanged: boolean[] = new Array(B.length).fill(true);
  let i = A.length, j = B.length;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) { aChanged[i - 1] = false; bChanged[j - 1] = false; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }

  const toSpans = (text: string, changed: boolean[]) => {
    const spans: { text: string; changed: boolean }[] = [];
    let cur = '';
    let curChanged = changed[0] ?? false;
    for (let k = 0; k < text.length; k++) {
      if ((changed[k] ?? false) !== curChanged && cur) {
        spans.push({ text: cur, changed: curChanged });
        cur = ''; curChanged = changed[k] ?? false;
      }
      cur += text[k];
    }
    if (cur) spans.push({ text: cur, changed: curChanged });
    return spans;
  };

  return { aSpans: toSpans(A, aChanged), bSpans: toSpans(B, bChanged) };
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const longer = Math.max(a.length, b.length);
  let common = 0;
  const bSet = new Set(b);
  for (const c of a) if (bSet.has(c)) common++;
  return common / longer;
}

// ── File icon by extension ─────────────────────────────────────────────────────

function FileIcon({ filename: _filename }: { filename: string }) {
  return <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

// ── Token-colored line content ────────────────────────────────────────────────

function TokenLine({ tokens, content }: { tokens: DiffToken[]; content: string }) {
  if (!tokens || tokens.length === 0) return <>{content}</>;
  return (
    <>
      {tokens.map(([cls, text], i) =>
        cls ? (
          <span key={i} className={`diff-token-${cls}`}>{text}</span>
        ) : (
          <span key={i}>{text}</span>
        )
      )}
    </>
  );
}

// ── Single diff line ──────────────────────────────────────────────────────────

function DiffLineRow({
  line,
  charSpans,
}: {
  line: DiffLineData;
  charSpans?: { text: string; changed: boolean }[];
}) {
  const isDelete  = line.type === 'delete';
  const isInsert  = line.type === 'insert';
  const isContext = line.type === 'context';

  const gutter = isDelete ? '−' : isInsert ? '+' : ' ';
  const origNo = line.original_lineno ?? '';
  const modNo  = line.modified_lineno ?? '';

  return (
    <div
      className={cn(
        'flex text-[12.5px] font-mono leading-5 select-text min-w-0',
        isDelete  && 'bg-red-500/10',
        isInsert  && 'bg-green-500/10',
        isContext && 'opacity-60',
      )}
    >
      {/* Gutter: +/−/space */}
      <span
        className={cn(
          'w-5 shrink-0 text-center select-none',
          isDelete && 'text-red-400',
          isInsert && 'text-green-400',
        )}
      >
        {gutter}
      </span>

      {/* Line numbers */}
      <span className="w-10 shrink-0 text-right pr-2 text-muted-foreground/50 select-none">
        {origNo}
      </span>
      <span className="w-10 shrink-0 text-right pr-3 text-muted-foreground/50 select-none">
        {modNo}
      </span>

      {/* Content */}
      <span
        className={cn(
          'flex-1 whitespace-pre-wrap break-all',
          isDelete && 'text-red-300',
          isInsert && 'text-green-300',
        )}
      >
        {charSpans ? (
          charSpans.map((s, i) => (
            <span
              key={i}
              className={s.changed ? (isDelete ? 'diff-char-delete' : 'diff-char-insert') : ''}
            >
              {s.text}
            </span>
          ))
        ) : (
          <TokenLine tokens={line.tokens} content={line.content} />
        )}
      </span>
    </div>
  );
}

// ── Hunk header ────────────────────────────────────────────────────────────────

function HunkHeader({ hunk }: { hunk: DiffHunkData }) {
  return (
    <div className="flex items-center gap-1 bg-muted/30 px-3 py-0.5 text-[11px] text-muted-foreground font-mono border-y border-border/20">
      <span className="text-blue-400/70">
        @@ -{hunk.original_start},{hunk.original_count} +{hunk.modified_start},{hunk.modified_count} @@
      </span>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface DiffViewerProps {
  diff: DiffResult;
  isPending?: boolean;
  onApprove?: () => void;
  onDeny?: () => void;
  className?: string;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DiffViewer({
  diff,
  isPending = false,
  onApprove,
  onDeny,
  className,
}: DiffViewerProps) {
  const [expanded, setExpanded]   = useState(false);
  const [copied, setCopied]       = useState(false);

  const toggleExpand = useCallback(() => setExpanded((p) => !p), []);

  const copyDiff = useCallback(async () => {
    const lines: string[] = [];
    for (const hunk of diff.hunks) {
      lines.push(
        `@@ -${hunk.original_start},${hunk.original_count} +${hunk.modified_start},${hunk.modified_count} @@`
      );
      for (const l of hunk.lines) {
        const prefix = l.type === 'insert' ? '+' : l.type === 'delete' ? '-' : ' ';
        lines.push(prefix + l.content);
      }
    }
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [diff]);

  const { filename, additions, deletions, is_binary, simplified, partial, hunks } = diff;

  // Pre-compute character-level spans for adjacent delete+insert pairs
  const charSpanMap = new Map<number, { text: string; changed: boolean }[]>();
  if (!is_binary && !simplified) {
    for (const hunk of hunks) {
      for (let li = 0; li < hunk.lines.length - 1; li++) {
        const cur  = hunk.lines[li];
        const next = hunk.lines[li + 1];
        if (cur.type === 'delete' && next.type === 'insert') {
          const sim = similarity(cur.content, next.content);
          if (sim > 0.4) {
            const { aSpans, bSpans } = charLevelDiff(cur.content, next.content);
            charSpanMap.set(li, aSpans);          // delete line
            charSpanMap.set(li + 1, bSpans);      // insert line (relative to hunk, needs global key)
          }
        }
      }
    }
  }

  // ── Collapsed header ──────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'rounded-lg border border-border/50 overflow-hidden bg-background/60',
        className,
      )}
    >
      {/* Collapsed row — always visible */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={toggleExpand}
        role="button"
        aria-expanded={expanded}
      >
        <FileIcon filename={filename} />
        <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">
          {filename}
        </span>

        {/* Stats badges */}
        <span className="text-xs font-mono text-green-400 shrink-0">+{additions}</span>
        <span className="text-xs font-mono text-red-400 shrink-0">−{deletions}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {diff.original_lines} → {diff.modified_lines} lines
        </span>

        {/* Pending buttons (visible even in collapsed state) */}
        {isPending && (
          <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={onDeny}
            >
              Deny
            </Button>
            <Button
              size="sm"
              className="h-6 px-2 text-xs text-white"
              style={{ background: 'var(--accent)' }}
              onClick={onApprove}
            >
              Apply →
            </Button>
          </div>
        )}

        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="diff-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            {/* Toolbar */}
            <div className="flex items-center justify-end gap-1 border-t border-border/30 px-2 py-1 bg-muted/20">
              <button
                onClick={copyDiff}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
                title="Copy unified diff"
              >
                {copied ? <Check className="h-3 w-3 text-green-400" /> : <Clipboard className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy diff'}
              </button>
            </div>

            {/* Diff body */}
            <div className="overflow-y-auto max-h-[400px] border-t border-border/20">
              {is_binary ? (
                <div className="px-4 py-3 text-xs text-muted-foreground">
                  <p>Binary file — diff not available</p>
                  <p className="mt-1">
                    Size: {diff.original_size} → {diff.modified_size} bytes
                  </p>
                </div>
              ) : simplified ? (
                <div className="px-4 py-3 text-xs text-muted-foreground">
                  <p>File too large for inline diff</p>
                  <p className="mt-1 text-green-400">+{additions} lines added</p>
                  <p className="text-red-400">−{deletions} lines removed</p>
                </div>
              ) : (
                <>
                  {hunks.map((hunk, hi) => {
                    return (
                      <div key={hi}>
                        <HunkHeader hunk={hunk} />
                        {hunk.lines.map((line, li) => {
                          const globalKey = `${hi}-${li}`;
                          // Find char spans if available
                          // We track consecutive pairs within the hunk
                          const spans = charSpanMap.get(li) as
                            | { text: string; changed: boolean }[]
                            | undefined;
                          return (
                            <DiffLineRow
                              key={globalKey}
                              line={line}
                              charSpans={spans}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                  <div className="border-t border-border/20 px-3 py-1.5 text-[11px] text-muted-foreground flex gap-3">
                    <span className="text-green-400">+{additions} additions</span>
                    <span className="text-red-400">−{deletions} deletions</span>
                    {partial && <span>· Partial diff (large file)</span>}
                  </div>
                </>
              )}
            </div>

            {/* Sticky approval footer */}
            {isPending && (
              <div className="border-t border-border/40 bg-muted/20 px-3 py-2.5 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Review the changes above, then:
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={onDeny}
                  >
                    Deny changes
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs h-7 text-white"
                    style={{ background: 'var(--accent)' }}
                    onClick={onApprove}
                  >
                    Apply changes →
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
