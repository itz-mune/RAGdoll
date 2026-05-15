/**
 * Lightweight hook used by the Sidebar to show a badge count of available
 * plugin updates. Runs independently of the full useMarketplace hook so the
 * Sidebar doesn't need to mount the whole marketplace state.
 *
 * Re-checks every 10 minutes while the app is open.
 */
import { useEffect, useRef, useState } from 'react';
import { getConfig } from '@/lib/config';

const SIDECAR_URL = 'http://127.0.0.1:8765';
const POLL_INTERVAL = 10 * 60 * 1000; // 10 min

function newerVersion(installed: string, registry: string): boolean {
  if (installed === registry) return false;
  const p = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [ia, ib, ic] = p(installed);
  const [ra, rb, rc] = p(registry);
  if (ra !== ia) return ra > ia;
  if (rb !== ib) return rb > ib;
  return rc > ic;
}

export function usePluginUpdateCount(): number {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = async () => {
    try {
      const [installedRes, config] = await Promise.all([
        fetch(`${SIDECAR_URL}/plugins`),
        getConfig(),
      ]);
      if (!installedRes.ok) return;
      const installedData = await installedRes.json();
      const installed: { id: string; version: string }[] = installedData.plugins ?? [];
      if (installed.length === 0) return;

      const regRes = await fetch(config.plugins.registry_url, { cache: 'no-store' });
      if (!regRes.ok) return;
      const regData = await regRes.json();
      const registry: { id: string; version: string }[] = regData.plugins ?? [];

      const installedMap = Object.fromEntries(installed.map((p) => [p.id, p.version]));
      let updates = 0;
      for (const reg of registry) {
        const iv = installedMap[reg.id];
        if (iv && newerVersion(iv, reg.version)) updates++;
      }
      setCount(updates);
    } catch { /* offline or registry unreachable — ignore */ }
  };

  useEffect(() => {
    check();
    timerRef.current = setInterval(check, POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return count;
}
