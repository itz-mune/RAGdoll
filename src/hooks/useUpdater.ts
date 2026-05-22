import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UpdaterInfo {
  version: string;
  body: string | null;
  date: string | null;
}

export interface UpdaterState {
  available: boolean;
  info: UpdaterInfo | null;
  /** true while downloading + installing */
  downloading: boolean;
  /** 0–100, or -1 when content-length is unknown */
  progress: number;
  error: string | null;
  install: () => Promise<void>;
  dismiss: () => void;
  recheck: () => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useUpdater(): UpdaterState {
  const [available, setAvailable] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawUpdate, setRawUpdate] = useState<any>(null);
  const [info, setInfo] = useState<UpdaterInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    try {
      // Dynamic import so the plugin is only resolved inside Tauri context
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update?.available) {
        setAvailable(true);
        setRawUpdate(update);
        setInfo({
          version: update.version,
          body: update.body ?? null,
          date: update.date ?? null,
        });
      } else {
        setAvailable(false);
        setRawUpdate(null);
        setInfo(null);
      }
    } catch (err) {
      // Silently swallow — update check must never crash the app
      console.warn('[Updater] Check failed:', err);
    }
  }, []);

  // Delay the first check by 10 s so it doesn't compete with startup
  useEffect(() => {
    const t = setTimeout(recheck, 10_000);
    return () => clearTimeout(t);
  }, [recheck]);

  const install = useCallback(async () => {
    if (!rawUpdate) return;
    setDownloading(true);
    setError(null);
    setProgress(0);
    try {
      let downloaded = 0;
      let total = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await rawUpdate.downloadAndInstall((event: any) => {
        if (event.event === 'Started') {
          total = event.data?.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data?.chunkLength ?? 0;
          setProgress(total > 0 ? Math.round((downloaded / total) * 100) : -1);
        }
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      setError(String(err));
      setDownloading(false);
    }
  }, [rawUpdate]);

  const dismiss = useCallback(() => {
    setAvailable(false);
    setRawUpdate(null);
    setInfo(null);
  }, []);

  return { available, info, downloading, progress, error, install, dismiss, recheck };
}
