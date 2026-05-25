import { useEffect, useState } from 'react';

const SIDECAR_URL = 'http://127.0.0.1:8765';

// How many times to retry while the sidecar is completely unreachable.
// On first launch uv has to download Python 3.12 + all packages — this can
// take 10–30 minutes on a slow connection.  Subsequent launches are instant
// (venv already synced).  We wait up to 30 minutes before giving up.
const MAX_CONNECT_RETRIES = 7200;  // 7200 × 250 ms = 30 min max wait on first launch
const CONNECT_DELAY_MS = 250;  // check every 250 ms — snappy feedback once up

// Once the sidecar responds, keep polling stage updates while the model warms.
const WARMUP_POLL_MS = 500;     // poll twice per second while warming up

// Hard timeout per individual fetch — use AbortController (not AbortSignal.timeout)
// because AbortSignal.timeout has known issues in older WebView2 builds.
const FETCH_TIMEOUT_MS = 2000;

export type SidecarStatus = 'connecting' | 'ready' | 'error';
export type SidecarStage = 'starting' | 'db' | 'warming_up' | 'ready';

const STAGE_LABELS: Record<SidecarStage, string> = {
  starting: 'Starting…',
  db: 'Initialising database…',
  warming_up: 'Loading AI model…',
  ready: 'Ready',
};

/** fetch() with a hard timeout that works on all WebView2 versions. */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export function useSidecarHealth() {
  const [status, setStatus] = useState<SidecarStatus>('connecting');
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<SidecarStage>('starting');

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      // ── Phase 1: wait for the port to open ───────────────────────────────
      let connected = false;
      for (let i = 0; i < MAX_CONNECT_RETRIES; i++) {
        if (cancelled) return;
        try {
          const res = await fetchWithTimeout(`${SIDECAR_URL}/health`, FETCH_TIMEOUT_MS);
          if (res.ok) { connected = true; break; }
        } catch { /* not yet up */ }
        setAttempt(i + 1);
        await new Promise<void>((r) => setTimeout(r, CONNECT_DELAY_MS));
      }

      if (!connected) {
        if (!cancelled) setStatus('error');
        return;
      }

      // ── Phase 2: report the current stage and unlock the app immediately ─
      while (!cancelled) {
        if (cancelled) return;
        try {
          const res = await fetchWithTimeout(`${SIDECAR_URL}/health`, FETCH_TIMEOUT_MS);
          if (res.ok) {
            try {
              const data = await res.json() as { stage?: SidecarStage };
              const reported = data.stage ?? 'ready';
              setStage(reported);
              setStatus('ready');
              return;
            } catch {
              // Malformed JSON → treat as ready (older sidecar build)
              setStatus('ready');
              return;
            }
          }
        } catch { /* transient error — keep waiting */ }
        await new Promise<void>((r) => setTimeout(r, WARMUP_POLL_MS));
      }
    }

    poll();
    return () => { cancelled = true; };
  }, []);

  return { status, attempt, stage, stageLabel: STAGE_LABELS[stage] };
}
