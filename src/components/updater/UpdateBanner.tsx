import { X, Download, RefreshCw, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fmtSpeed, fmtEta, type UpdaterState } from '@/hooks/useUpdater';

interface UpdateBannerProps {
  updater: UpdaterState;
}

/**
 * Slim top-of-screen banner that slides down when a new version is available.
 * Shows inline progress while downloading and an Install button when ready.
 */
export function UpdateBanner({ updater }: UpdateBannerProps) {
  if (!updater.available) return null;

  const { phase, info, progress, speedBps, etaSec } = updater;
  const isDownloading = phase === 'downloading';
  const isDownloaded  = phase === 'downloaded';
  const isInstalling  = phase === 'installing';

  return (
    <motion.div
      initial={{ y: -48 }}
      animate={{ y: 0 }}
      exit={{ y: -48 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="fixed left-0 right-0 top-0 z-50 border-b border-primary/30 bg-primary/10 backdrop-blur-sm"
    >
      {/* Download progress bar — sits at the very bottom of the banner */}
      {isDownloading && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/20">
          {progress > 0 ? (
            <div
              className="h-full bg-primary transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          ) : (
            <div className="h-full animate-pulse bg-primary/60" />
          )}
        </div>
      )}

      <div className="flex items-center gap-3 px-4 py-2 text-sm">
        {isInstalling
          ? <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          : <RefreshCw className="h-3.5 w-3.5 shrink-0 text-primary" />
        }

        {/* Message */}
        <span className="flex-1 text-foreground">
          {(phase === 'idle') && (
            <>RAGdoll <span className="font-semibold text-primary">{info?.version}</span> is available.</>
          )}
          {isDownloading && (
            <span className="flex items-center gap-2">
              <span>Downloading {info?.version}…</span>
              {progress > 0 && (
                <span className="tabular-nums text-primary font-medium">{progress}%</span>
              )}
              {speedBps > 0 && (
                <span className="tabular-nums text-muted-foreground text-xs">{fmtSpeed(speedBps)}</span>
              )}
              {etaSec !== null && (
                <span className={cn('text-xs text-muted-foreground', 'tabular-nums')}>
                  {fmtEta(etaSec)} left
                </span>
              )}
            </span>
          )}
          {isDownloaded && (
            <>RAGdoll <span className="font-semibold text-primary">{info?.version}</span> is ready to install.</>
          )}
          {isInstalling && (
            <span className="text-muted-foreground">Installing RAGdoll {info?.version}…</span>
          )}
        </span>

        {/* Action button */}
        {phase === 'idle' && (
          <button
            onClick={updater.startDownload}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Download className="h-3 w-3" />
            Download
          </button>
        )}

        {isDownloaded && (
          <button
            onClick={updater.installNow}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ArrowRight className="h-3 w-3" />
            Install &amp; restart
          </button>
        )}

        {isInstalling && (
          <span className="rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground opacity-60">
            Installing…
          </span>
        )}

        {/* Dismiss — hide while busy */}
        {!isInstalling && (
          <button
            onClick={updater.dismiss}
            disabled={isDownloading}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            aria-label="Dismiss update notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
