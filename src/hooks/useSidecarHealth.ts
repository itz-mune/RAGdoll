import { useEffect, useState } from 'react';

const SIDECAR_URL = 'http://127.0.0.1:8765';
const MAX_RETRIES = 20;
const RETRY_DELAY_MS = 500;

export type SidecarStatus = 'connecting' | 'ready' | 'error';

export function useSidecarHealth() {
  const [status, setStatus] = useState<SidecarStatus>('connecting');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      for (let i = 0; i < MAX_RETRIES; i++) {
        if (cancelled) return;
        try {
          const res = await fetch(`${SIDECAR_URL}/health`, {
            signal: AbortSignal.timeout(1000),
          });
          if (res.ok) {
            setStatus('ready');
            return;
          }
        } catch {
          // sidecar not ready yet, keep retrying
        }
        setAttempt(i + 1);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
      if (!cancelled) setStatus('error');
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, []);

  return { status, attempt };
}
