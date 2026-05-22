import { X, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UpdaterState } from '@/hooks/useUpdater';

interface UpdateModalProps {
  updater: UpdaterState;
  onClose: () => void;
}

/**
 * Full-screen overlay modal for reviewing changelog + triggering install.
 * Opened from the Settings → About section.
 */
export function UpdateModal({ updater, onClose }: UpdateModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[440px] max-w-[95vw] rounded-2xl border border-border/60 bg-background p-6 shadow-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          disabled={updater.downloading}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <RefreshCw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Update available</h2>
            <p className="text-xs text-muted-foreground">
              RAGdoll {updater.info?.version}
              {updater.info?.date
                ? ` · ${new Date(updater.info.date).toLocaleDateString()}`
                : ''}
            </p>
          </div>
        </div>

        {/* Release notes */}
        {updater.info?.body && (
          <div className="mb-4 max-h-44 overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {updater.info.body}
            </p>
          </div>
        )}

        {/* Error */}
        {updater.error && (
          <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {updater.error}
          </p>
        )}

        {/* Progress bar */}
        {updater.downloading && (
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Downloading…</span>
              {updater.progress > 0 && (
                <span className="text-xs font-medium text-primary">{updater.progress}%</span>
              )}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{
                  width: updater.progress > 0 ? `${updater.progress}%` : '100%',
                  animation: updater.progress <= 0 ? 'pulse 1.5s ease-in-out infinite' : undefined,
                }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              RAGdoll will restart automatically after the update is applied.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={updater.downloading}
          >
            Later
          </Button>
          <Button
            size="sm"
            onClick={updater.install}
            disabled={updater.downloading || !updater.info}
            className="gap-1.5"
          >
            {updater.downloading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {updater.downloading ? 'Installing…' : 'Download & install'}
          </Button>
        </div>
      </div>
    </div>
  );
}
