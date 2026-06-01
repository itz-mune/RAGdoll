import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UpdaterInfo {
  version: string;
  body: string | null;
  date: string | null;
}

export type UpdatePhase = 'idle' | 'downloading' | 'downloaded' | 'installing';

export interface UpdaterState {
  available:      boolean;
  info:           UpdaterInfo | null;
  phase:          UpdatePhase;
  /** 0–100, or -1 when content-length is unknown */
  progress:       number;
  downloadedBytes: number;
  totalBytes:     number;
  /** Bytes per second (rolling 3-second window) */
  speedBps:       number;
  /** Estimated seconds remaining, null when unknown */
  etaSec:         number | null;
  error:          string | null;
  /** Start downloading only — shows progress, no immediate install */
  startDownload:  () => Promise<void>;
  /** Install the already-downloaded update, then relaunch the app */
  installNow:     () => Promise<void>;
  dismiss:        () => void;
  recheck:        () => Promise<boolean>;
  // ── Backward-compat aliases ────────────────────────────────────────────────
  /** @deprecated Use startDownload() + installNow() instead */
  install:        () => Promise<void>;
  /** @deprecated Use phase instead */
  downloading:    boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtBytes(b: number): string {
  if (b <= 0)      return '0 B';
  if (b < 1024)    return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export function fmtSpeed(bps: number): string {
  if (bps < 1024)    return `${Math.round(bps)} B/s`;
  if (bps < 1048576) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / 1048576).toFixed(1)} MB/s`;
}

export function fmtEta(sec: number): string {
  if (sec < 60) return `~${sec}s`;
  const m = Math.ceil(sec / 60);
  return `~${m}m`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useUpdater(): UpdaterState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawUpdate, setRawUpdate]     = useState<any>(null);
  const [available, setAvailable]     = useState(false);
  const [info, setInfo]               = useState<UpdaterInfo | null>(null);
  const [phase, setPhase]             = useState<UpdatePhase>('idle');
  const [progress, setProgress]       = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes]   = useState(0);
  const [speedBps, setSpeedBps]       = useState(0);
  const [etaSec, setEtaSec]           = useState<number | null>(null);
  const [error, setError]             = useState<string | null>(null);

  // Refs for values used inside async callbacks (avoid stale closures)
  const downloadedRef = useRef(0);
  const totalRef      = useRef(0);
  const chunksRef     = useRef<{ t: number; b: number }[]>([]);

  // ── Check ──────────────────────────────────────────────────────────────────
  const recheck = useCallback(async (): Promise<boolean> => {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update?.available) {
      setAvailable(true);
      setRawUpdate(update);
      setInfo({
        version: update.version,
        body:    update.body ?? null,
        date:    update.date ?? null,
      });
      return true;
    }
    setAvailable(false);
    setRawUpdate(null);
    setInfo(null);
    return false;
  }, []);

  // Delay first check by 10 s to avoid competing with startup
  useEffect(() => {
    const t = setTimeout(() => recheck().catch((err) => console.warn('[Updater] Auto-check failed:', err)), 10_000);
    return () => clearTimeout(t);
  }, [recheck]);

  // ── Download ───────────────────────────────────────────────────────────────
  const startDownload = useCallback(async () => {
    if (!rawUpdate) return;
    setPhase('downloading');
    setError(null);
    setProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setSpeedBps(0);
    setEtaSec(null);
    downloadedRef.current = 0;
    totalRef.current      = 0;
    chunksRef.current     = [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await rawUpdate.download((event: any) => {
        if (event.event === 'Started') {
          const cl = event.data?.contentLength ?? 0;
          totalRef.current = cl;
          setTotalBytes(cl);

        } else if (event.event === 'Progress') {
          const chunk = event.data?.chunkLength ?? 0;
          downloadedRef.current += chunk;
          const now = Date.now();

          // Rolling 3-second window for speed
          chunksRef.current.push({ t: now, b: chunk });
          const cutoff = now - 3000;
          while (chunksRef.current.length > 1 && chunksRef.current[0].t < cutoff) {
            chunksRef.current.shift();
          }
          const windowMs    = now - (chunksRef.current[0]?.t ?? now);
          const windowBytes = chunksRef.current.reduce((s, c) => s + c.b, 0);
          const speed       = windowMs > 100 ? (windowBytes / windowMs) * 1000 : 0;
          const remaining   = totalRef.current - downloadedRef.current;
          const eta         = speed > 0 && remaining > 0 ? Math.ceil(remaining / speed) : null;

          setDownloadedBytes(downloadedRef.current);
          setSpeedBps(speed);
          setEtaSec(eta);
          setProgress(
            totalRef.current > 0
              ? Math.round((downloadedRef.current / totalRef.current) * 100)
              : -1,
          );
        }
      });

      setPhase('downloaded');
    } catch (err) {
      setError(String(err));
      setPhase('idle');
    }
  }, [rawUpdate]);

  // ── Install ────────────────────────────────────────────────────────────────
  const installNow = useCallback(async () => {
    if (!rawUpdate) return;
    setPhase('installing');
    setError(null);
    try {
      await rawUpdate.install();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      setError(String(err));
      setPhase('idle');
    }
  }, [rawUpdate]);

  // ── Backward-compat combined action ───────────────────────────────────────
  const install = useCallback(async () => {
    await startDownload();
    await installNow();
  }, [startDownload, installNow]);

  // ── Dismiss ────────────────────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    setAvailable(false);
    setRawUpdate(null);
    setInfo(null);
    setPhase('idle');
    setProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setSpeedBps(0);
    setEtaSec(null);
    setError(null);
  }, []);

  return {
    available,
    info,
    phase,
    progress,
    downloadedBytes,
    totalBytes,
    speedBps,
    etaSec,
    error,
    startDownload,
    installNow,
    dismiss,
    recheck,
    // backward-compat
    install,
    downloading: phase === 'downloading' || phase === 'installing',
  };
}
