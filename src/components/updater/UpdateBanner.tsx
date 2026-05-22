import { X, Download, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import type { UpdaterState } from '@/hooks/useUpdater';

interface UpdateBannerProps {
  updater: UpdaterState;
}

/**
 * Slim top-of-screen banner that slides down when a new version is available.
 * Rendered inside an AnimatePresence block in App.tsx.
 */
export function UpdateBanner({ updater }: UpdateBannerProps) {
  if (!updater.available) return null;

  return (
    <motion.div
      initial={{ y: -48 }}
      animate={{ y: 0 }}
      exit={{ y: -48 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="fixed left-0 right-0 top-0 z-50 flex items-center gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2 text-sm backdrop-blur-sm"
    >
      <RefreshCw className="h-3.5 w-3.5 shrink-0 text-primary" />

      <span className="flex-1 text-foreground">
        RAGdoll{' '}
        <span className="font-semibold text-primary">{updater.info?.version}</span>{' '}
        is available.
      </span>

      <button
        onClick={updater.install}
        disabled={updater.downloading}
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        <Download className="h-3 w-3" />
        {updater.downloading
          ? updater.progress > 0
            ? `${updater.progress}%`
            : 'Downloading…'
          : 'Install & restart'}
      </button>

      <button
        onClick={updater.dismiss}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss update notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}
