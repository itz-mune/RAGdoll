import { Store } from '@tauri-apps/plugin-store';
import { appDataDir } from '@tauri-apps/api/path';
import { join } from '@tauri-apps/api/path';
import type { ModelProfile } from '@/types/profile';

export type Provider = 'openai' | 'anthropic' | 'groq' | 'google' | 'ollama' | 'huggingface' | 'openrouter';

// ── Singleton store instances ─────────────────────────────────────────────────

let storeInstance: Store | null = null;
let profileStoreInstance: Store | null = null;
let keyStoreInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    const dir = await appDataDir();
    const path = await join(dir, 'ragdoll-settings.json');
    storeInstance = await Store.load(path);
  }
  return storeInstance;
}

async function getProfileStore(): Promise<Store> {
  if (!profileStoreInstance) {
    const dir = await appDataDir();
    const path = await join(dir, 'ragdoll-profiles.json');
    profileStoreInstance = await Store.load(path);
  }
  return profileStoreInstance;
}

async function getKeyStore(): Promise<Store> {
  if (!keyStoreInstance) {
    const dir = await appDataDir();
    const path = await join(dir, 'ragdoll-keys.json');
    keyStoreInstance = await Store.load(path);
  }
  return keyStoreInstance;
}

// ── Legacy API-key helpers (kept for backward-compat) ─────────────────────────

export async function getApiKey(provider: Provider): Promise<string | null> {
  const store = await getStore();
  const key = await store.get<string>(`api_key_${provider}`);
  return key ?? null;
}

export async function setApiKey(provider: Provider, key: string): Promise<void> {
  const store = await getStore();
  await store.set(`api_key_${provider}`, key);
  await store.save();
}

export async function getSelectedProvider(): Promise<Provider | null> {
  const store = await getStore();
  const provider = await store.get<Provider>('selected_provider');
  return provider ?? null;
}

export async function setSelectedProvider(provider: Provider): Promise<void> {
  const store = await getStore();
  await store.set('selected_provider', provider);
  await store.save();
}

export async function getHuggingFaceModel(): Promise<string | null> {
  const store = await getStore();
  const model = await store.get<string>('huggingface_model');
  return model ?? null;
}

export async function setHuggingFaceModel(model: string): Promise<void> {
  const store = await getStore();
  await store.set('huggingface_model', model);
  await store.save();
}

export async function getOpenRouterModel(): Promise<string | null> {
  const store = await getStore();
  const model = await store.get<string>('openrouter_model');
  return model ?? null;
}

export async function setOpenRouterModel(model: string): Promise<void> {
  const store = await getStore();
  await store.set('openrouter_model', model);
  await store.save();
}

export async function clearApiKey(provider: Provider): Promise<void> {
  const store = await getStore();
  await store.delete(`api_key_${provider}`);
  await store.save();
}

export async function clearAllSettings(): Promise<void> {
  const store = await getStore();
  for (const provider of ['openai', 'anthropic', 'groq', 'google', 'ollama', 'huggingface', 'openrouter'] as const) {
    await store.delete(`api_key_${provider}`);
  }
  await store.delete('selected_provider');
  await store.delete('huggingface_model');
  await store.delete('openrouter_model');
  await store.save();
}

// ── Profile management ────────────────────────────────────────────────────────

export async function getProfiles(): Promise<ModelProfile[]> {
  const store = await getProfileStore();
  const profiles = await store.get<ModelProfile[]>('profiles');
  return profiles ?? [];
}

export async function saveProfile(profile: ModelProfile): Promise<void> {
  const store = await getProfileStore();
  const profiles = await getProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx >= 0) profiles[idx] = profile;
  else profiles.push(profile);
  await store.set('profiles', profiles);
  await store.save();
}

export async function deleteProfile(id: string): Promise<void> {
  const store = await getProfileStore();
  const profiles = await getProfiles();
  await store.set('profiles', profiles.filter((p) => p.id !== id));
  await store.save();
  // Purge the associated API key
  const keyStore = await getKeyStore();
  await keyStore.delete(id);
  await keyStore.save();
}

export async function getProfileApiKey(profileId: string): Promise<string | null> {
  const store = await getKeyStore();
  return (await store.get<string>(profileId)) ?? null;
}

export async function setProfileApiKey(profileId: string, apiKey: string): Promise<void> {
  const store = await getKeyStore();
  await store.set(profileId, apiKey);
  await store.save();
}

export async function getActiveProfileId(): Promise<string | null> {
  const store = await getProfileStore();
  return (await store.get<string>('activeProfileId')) ?? null;
}

export async function setActiveProfileId(id: string): Promise<void> {
  const store = await getProfileStore();
  await store.set('activeProfileId', id);
  await store.save();
}

export async function setDefaultProfile(id: string): Promise<void> {
  const store = await getProfileStore();
  const profiles = await getProfiles();
  const updated = profiles.map((p) => ({ ...p, isDefault: p.id === id }));
  await store.set('profiles', updated);
  await store.save();
}

// ── App settings (theme, send shortcut, density) ──────────────────────────────

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  messageDensity: 'comfortable' | 'compact';
  sendOnEnter: boolean;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 'medium',
  messageDensity: 'comfortable',
  sendOnEnter: false,
};

export async function getAppSettings(): Promise<AppSettings> {
  const store = await getStore();
  const saved = await store.get<Partial<AppSettings>>('app_settings');
  return { ...DEFAULT_APP_SETTINGS, ...saved };
}

export async function setAppSettings(settings: Partial<AppSettings>): Promise<void> {
  const store = await getStore();
  const current = await getAppSettings();
  await store.set('app_settings', { ...current, ...settings });
  await store.save();
}

// ── hasValidSetup — checks profiles first, falls back to legacy ───────────────

export async function hasValidSetup(): Promise<boolean> {
  // New profile format
  try {
    const profiles = await getProfiles();
    if (profiles.length > 0) {
      const def = profiles.find((p) => p.isDefault) ?? profiles[0];
      if (def.provider === 'ollama') return true;
      const key = await getProfileApiKey(def.id);
      return !!key;
    }
  } catch {
    // ignore — fall through to legacy
  }

  // Legacy format
  try {
    const provider = await getSelectedProvider();
    if (!provider) return false;
    if (provider === 'huggingface' && !(await getHuggingFaceModel())) return false;
    if (provider === 'openrouter' && !(await getOpenRouterModel())) return false;
    const key = await getApiKey(provider);
    return !!key;
  } catch {
    return false;
  }
}
