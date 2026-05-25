/**
 * UpdateModal — full-screen overlay used when an update is triggered from
 * outside the Settings page (e.g. the top banner).
 *
 * Phase 1 (idle)        : release notes + "Download" button
 * Phase 2 (downloading) : progress bar + speed + ETA
 * Phase 3 (downloaded)  : "Install & restart" button
 * Phase 4 (installing)  : spinner
 */
import { X, Download, RefreshCw, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fmtBytes, fmtSpeed, fmtEta, type UpdaterState } from '@/hooks/useUpdater';

interface UpdateModalProps {
  updater: UpdaterState;
  onClose: () => void;
}

export function UpdateModal({ updater, onClose }: UpdateModalProps) {
  const { phase, info, progress, downloadedBytes, totalBytes, speedBps, etaSec, error } = updater;
  const busy = phase === 'downloading' || phase === 'installing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[440px] max-w-[95vw] rounded-2xl border border-border/60 bg-background p-6 shadow-2xl space-y-4">

        {/* Close */}
        <button
          onClick={onClose}
          disabled={busy}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            {phase === 'downloaded'
              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : <RefreshCw className={cn('h-5 w-5 text-primary', phase === 'installing' && 'animate-spin')} />
            }
          </div>
          <div>
            <h2 className="font-semibold text-foreground">
              {phase === 'idle'        && 'Update available'}
              {phase === 'downloading' && 'Downloading update…'}
              {phase === 'downloaded'  && 'Ready to install'}
              {phase === 'installing'  && 'Installing…'}
            </h2>
            <p className="text-xs text-muted-foreground">
              RAGdoll {info?.version}
              {info?.date ? ` · ${new Date(info.date).toLocaleDateString()}` : ''}
            </p>
          </div>
        </div>

        {/* Release notes — only shown before download starts */}
        {phase === 'idle' && info?.body && (
          <div className="max-h-44 overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {info.body}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {/* ── Downloading progress ── */}
        {phase === 'downloading' && (
          <div className="space-y-2">
            {/* Size + speed + ETA */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {fmtBytes(downloadedBytes)}
                {totalBytes > 0 && ` / ${fmtBytes(totalBytes)}`}
              </span>
              <span className="flex items-center gap-2">
                {speedBps > 0  && <span className="tabular-nums">{fmtSpeed(speedBps)}</span>}
                {etaSec !== null && <span className="tabular-nums">{fmtEta(etaSec)} left</span>}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              {progress > 0 ? (
                <div
                  className="h-full rounded-full bg-primary transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              ) : (
                <div className="h-full w-full animate-pulse rounded-full bg-primary/60" />
              )}
            </div>

            {progress > 0 && (
              <p className="text-right text-[11px] tabular-nums text-muted-foreground">
                {progress}%
              </p>
            )}
          </div>
        )}

        {/* ── Downloaded ── */}
        {phase === 'downloaded' && (
          <p className="text-xs text-muted-foreground">
            {totalBytes > 0 ? `${fmtBytes(totalBytes)} downloaded. ` : ''}
            The app will close and reopen automatically after installation.
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          {(phase === 'idle' || phase === 'downloaded') && (
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Later
            </Button>
          )}

          {phase === 'idle' && (
            <Button size="sm" onClick={updater.startDownload} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Download v{info?.version}
            </Button>
          )}

          {phase === 'downloaded' && (
            <Button size="sm" onClick={updater.installNow} className="gap-1.5">
              <ArrowRight className="h-3.5 w-3.5" />
              Install &amp; restart
            </Button>
          )}

          {phase === 'installing' && (
            <Button size="sm" disabled className="gap-1.5 opacity-70">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Installing…
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
