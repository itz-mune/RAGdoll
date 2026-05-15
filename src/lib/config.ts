// Global app config — loaded once from ragdoll.config.json.
// Never hardcode sidecar port, plugin URLs, or app metadata anywhere —
// always read from this module.

export interface SidecarConfig {
  port: number;
  host: string;
}

export interface PluginsConfig {
  registry_repo: string;
  registry_branch: string;
  registry_file: string;
  registry_url: string;
  github_api_base: string;
  raw_base: string;
  preinstalled: string[];
}

export interface MemoryConfig {
  default_max_size_mb: number;
  default_chunk_size: number;
  default_chunk_overlap: number;
}

export interface AppConfig {
  app: {
    name: string;
    version: string;
    github: string;
  };
  plugins: PluginsConfig;
  memory: MemoryConfig;
  sidecar: SidecarConfig;
}

let _config: AppConfig | null = null;

export async function getConfig(): Promise<AppConfig> {
  if (_config) return _config;
  try {
    // In a Tauri build, read the bundled resource file
    const { resolveResource } = await import('@tauri-apps/api/path');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await resolveResource('ragdoll.config.json');
    const raw = await readTextFile(path);
    _config = JSON.parse(raw) as AppConfig;
  } catch {
    // Dev server fallback — Vite serves files from project root via public/
    const res = await fetch('/ragdoll.config.json');
    if (!res.ok) throw new Error('Could not load ragdoll.config.json');
    _config = (await res.json()) as AppConfig;
  }
  return _config!;
}

/** Synchronous accessor — only valid after getConfig() has resolved once. */
export function getCachedConfig(): AppConfig | null {
  return _config;
}

/** Convenience: base URL for the sidecar (sync, returns default if not yet loaded). */
export function getSidecarUrl(): string {
  const cfg = _config?.sidecar;
  const host = cfg?.host ?? '127.0.0.1';
  const port = cfg?.port ?? 8765;
  return `http://${host}:${port}`;
}
