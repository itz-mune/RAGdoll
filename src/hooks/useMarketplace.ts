import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getConfig } from '@/lib/config';

const SIDECAR_URL = 'http://127.0.0.1:8765';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegistryPlugin {
  id: string;
  name: string;
  category: 'skill' | 'style' | 'addon';
  author: string;
  version: string;
  description: string;
  icon: string;
  logo?: string;   // filename of logo image (e.g. "logo.png") — fetched from raw_base/path/logo
  stars: number;
  downloads: number;
  path: string;
  entry: string;
  min_ragdoll_version: string;
  tags: string[];
  preinstalled?: boolean;
}

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  category: 'skill' | 'style' | 'addon';
  author: string;
  description: string;
  icon: string;
  entry: string;
  min_ragdoll_version: string;
  tags: string[];
  long_description: string;
  changelog: Record<string, string>;
  config_fields: ConfigField[];
  is_enabled: boolean;
  is_preinstalled: boolean;
  installed_at: number;
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number';
  placeholder?: string;
  help?: string;
}

// ── Version helpers ───────────────────────────────────────────────────────────

/** Returns true if registryVersion is strictly newer than installedVersion. */
function hasNewerVersion(installedVersion: string, registryVersion: string): boolean {
  if (installedVersion === registryVersion) return false;
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [ia, ib, ic] = parse(installedVersion);
  const [ra, rb, rc] = parse(registryVersion);
  if (ra !== ia) return ra > ia;
  if (rb !== ib) return rb > ib;
  return rc > ic;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseMarketplaceReturn {
  registry: RegistryPlugin[];
  installed: InstalledPlugin[];
  activeStyle: string | null;
  isLoading: boolean;
  installProgress: string | null;
  installing: string | null;   // plugin ID being installed
  updating: string | null;     // plugin ID being updated
  error: string | null;
  availableUpdates: Set<string>; // set of plugin IDs with a newer registry version
  installPlugin: (plugin: RegistryPlugin) => Promise<void>;
  updatePlugin: (plugin: RegistryPlugin) => Promise<void>;
  uninstallPlugin: (pluginId: string) => Promise<void>;
  enablePlugin: (pluginId: string) => Promise<void>;
  disablePlugin: (pluginId: string) => Promise<void>;
  activateStyle: (pluginId: string) => Promise<void>;
  clearStyle: () => Promise<void>;
  setPluginConfig: (pluginId: string, config: Record<string, string>) => Promise<void>;
  refresh: () => void;
}

const _registryCache: { data: RegistryPlugin[] | null; ts: number } = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function useMarketplace(): UseMarketplaceReturn {
  const [registry, setRegistry] = useState<RegistryPlugin[]>([]);
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [activeStyle, setActiveStyle] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [installProgress, setInstallProgress] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Computed: which installed plugins have a newer version in the registry ──
  const availableUpdates = useMemo<Set<string>>(() => {
    const installedMap = Object.fromEntries(installed.map((p) => [p.id, p.version]));
    const updates = new Set<string>();
    for (const reg of registry) {
      const installedVersion = installedMap[reg.id];
      if (installedVersion && hasNewerVersion(installedVersion, reg.version)) {
        updates.add(reg.id);
      }
    }
    return updates;
  }, [registry, installed]);

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const fetchInstalled = useCallback(async () => {
    try {
      const r = await fetch(`${SIDECAR_URL}/plugins`);
      if (!r.ok) return;
      const data = await r.json();
      if (mountedRef.current) {
        setInstalled(data.plugins ?? []);
        setActiveStyle(data.active_style ?? null);
      }
    } catch { /* sidecar offline */ }
  }, []);

  const fetchRegistry = useCallback(async () => {
    if (_registryCache.data && Date.now() - _registryCache.ts < CACHE_TTL) {
      setRegistry(_registryCache.data);
      return;
    }
    try {
      const config = await getConfig();
      const r = await fetch(config.plugins.registry_url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Registry returned ${r.status}`);
      const data = await r.json();
      const plugins: RegistryPlugin[] = data.plugins ?? [];
      _registryCache.data = plugins;
      _registryCache.ts = Date.now();
      if (mountedRef.current) setRegistry(plugins);
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    await Promise.all([fetchRegistry(), fetchInstalled()]);
    if (mountedRef.current) setIsLoading(false);
  }, [fetchRegistry, fetchInstalled]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Core install/update flow ───────────────────────────────────────────────

  const _runInstallFlow = useCallback(async (
    plugin: RegistryPlugin,
    mode: 'install' | 'update',
  ) => {
    const setActive = mode === 'update' ? setUpdating : setInstalling;
    setActive(plugin.id);
    setError(null);
    try {
      const config = await getConfig();
      const apiBase = config.plugins.github_api_base;
      const rawBase = config.plugins.raw_base;

      setInstallProgress(`Fetching plugin files…`);
      const listRes = await fetch(`${apiBase}/contents/${plugin.path}`);
      if (!listRes.ok) throw new Error(`GitHub API ${listRes.status}`);
      const fileList: { name: string; download_url: string }[] = await listRes.json();

      setInstallProgress(mode === 'update' ? `Updating ${plugin.name}…` : `Installing ${plugin.name}…`);
      const files: { path: string; content: string }[] = [];
      for (const file of fileList) {
        if (!file.download_url) continue;
        const raw = await fetch(`${rawBase}/${plugin.path}/${file.name}`);
        if (!raw.ok) continue;
        const text = await raw.text();
        files.push({ path: file.name, content: text });
      }

      const installRes = await fetch(`${SIDECAR_URL}/plugins/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plugin.id, files }),
      });
      const result = await installRes.json();
      if (!result.success) throw new Error(result.error ?? `${mode} failed`);

      // Bust registry cache so updated version is reflected immediately
      if (mode === 'update') {
        _registryCache.ts = 0;
      }

      setInstallProgress(mode === 'update' ? `Updated ✓` : `Done ✓`);
      await fetchInstalled();
      setTimeout(() => {
        if (mountedRef.current) setInstallProgress(null);
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setInstallProgress(null);
    } finally {
      if (mountedRef.current) setActive(null);
    }
  }, [fetchInstalled]);

  const installPlugin = useCallback(
    (plugin: RegistryPlugin) => _runInstallFlow(plugin, 'install'),
    [_runInstallFlow],
  );

  const updatePlugin = useCallback(
    (plugin: RegistryPlugin) => _runInstallFlow(plugin, 'update'),
    [_runInstallFlow],
  );

  // ── Other mutations ────────────────────────────────────────────────────────

  const uninstallPlugin = useCallback(async (pluginId: string) => {
    await fetch(`${SIDECAR_URL}/plugins/${pluginId}/uninstall`, { method: 'POST' });
    await fetchInstalled();
  }, [fetchInstalled]);

  const enablePlugin = useCallback(async (pluginId: string) => {
    await fetch(`${SIDECAR_URL}/plugins/${pluginId}/enable`, { method: 'POST' });
    await fetchInstalled();
  }, [fetchInstalled]);

  const disablePlugin = useCallback(async (pluginId: string) => {
    await fetch(`${SIDECAR_URL}/plugins/${pluginId}/disable`, { method: 'POST' });
    await fetchInstalled();
  }, [fetchInstalled]);

  const activateStyle = useCallback(async (pluginId: string) => {
    await fetch(`${SIDECAR_URL}/plugins/style/${pluginId}/activate`, { method: 'POST' });
    if (mountedRef.current) setActiveStyle(pluginId);
  }, []);

  const clearStyle = useCallback(async () => {
    await fetch(`${SIDECAR_URL}/plugins/style/clear`, { method: 'POST' });
    if (mountedRef.current) setActiveStyle(null);
  }, []);

  const setPluginConfig = useCallback(async (pluginId: string, config: Record<string, string>) => {
    await fetch(`${SIDECAR_URL}/plugins/${pluginId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
  }, []);

  return {
    registry, installed, activeStyle, isLoading,
    installProgress, installing, updating, error,
    availableUpdates,
    installPlugin, updatePlugin,
    uninstallPlugin, enablePlugin, disablePlugin,
    activateStyle, clearStyle, setPluginConfig,
    refresh: loadAll,
  };
}
