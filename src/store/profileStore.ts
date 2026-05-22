import { create } from 'zustand';
import type { ModelProfile } from '@/types/profile';
import { tray } from '@/lib/tray';
import {
  getProfiles,
  saveProfile,
  deleteProfile as storeDeleteProfile,
  setDefaultProfile as storeSetDefault,
  getActiveProfileId,
  setActiveProfileId,
  getProfileApiKey,
  setProfileApiKey,
} from '@/lib/store';

// ── Helper ────────────────────────────────────────────────────────────────────

function generateId() {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface ProfileStoreState {
  profiles: ModelProfile[];
  activeProfileId: string | null;
  /** Controls the ProfileSwitcher popover */
  switcherOpen: boolean;

  // Async actions
  loadProfiles(): Promise<void>;
  createProfile(data: Omit<ModelProfile, 'id' | 'createdAt'>, apiKey?: string): Promise<string>;
  updateProfile(id: string, updates: Partial<Omit<ModelProfile, 'id' | 'createdAt'>>, apiKey?: string): Promise<void>;
  removeProfile(id: string): Promise<void>;
  setActiveProfile(id: string): Promise<void>;
  setDefaultProfile(id: string): Promise<void>;

  // Sync helpers
  getActiveProfile(): ModelProfile | null;
  openSwitcher(): void;
  closeSwitcher(): void;
}

export const profileStore = create<ProfileStoreState>((set, get) => ({
  profiles: [],
  activeProfileId: null,
  switcherOpen: false,

  async loadProfiles() {
    const profiles = await getProfiles();
    const savedActiveId = await getActiveProfileId();
    const activeProfileId =
      savedActiveId ?? profiles.find((p) => p.isDefault)?.id ?? profiles[0]?.id ?? null;
    set({ profiles, activeProfileId });
  },

  async createProfile(data, apiKey) {
    const id = generateId();
    const profile: ModelProfile = { ...data, id, createdAt: Date.now() };
    await saveProfile(profile);
    if (apiKey) await setProfileApiKey(id, apiKey);

    const profiles = await getProfiles();
    const current = get().activeProfileId;
    if (!current) {
      await setActiveProfileId(id);
      set({ profiles, activeProfileId: id });
    } else {
      set({ profiles });
    }
    return id;
  },

  async updateProfile(id, updates, apiKey) {
    const existing = get().profiles.find((p) => p.id === id);
    if (!existing) return;
    const updated: ModelProfile = { ...existing, ...updates };
    await saveProfile(updated);
    if (apiKey) await setProfileApiKey(id, apiKey);
    set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? updated : p)) }));
  },

  async removeProfile(id) {
    await storeDeleteProfile(id);
    const profiles = await getProfiles();
    const { activeProfileId } = get();
    let newActive = activeProfileId;
    if (activeProfileId === id) {
      newActive = profiles.find((p) => p.isDefault)?.id ?? profiles[0]?.id ?? null;
      if (newActive) await setActiveProfileId(newActive);
    }
    set({ profiles, activeProfileId: newActive });
  },

  async setActiveProfile(id) {
    await setActiveProfileId(id);
    set({ activeProfileId: id, switcherOpen: false });
    // Keep tray menu label in sync — fire-and-forget, non-fatal
    const profile = get().profiles.find((p) => p.id === id);
    if (profile) tray.updateTrayProfile(profile.displayName).catch(() => {});
  },

  async setDefaultProfile(id) {
    await storeSetDefault(id);
    const profiles = await getProfiles();
    set({ profiles });
  },

  getActiveProfile() {
    const { profiles, activeProfileId } = get();
    if (!activeProfileId) return profiles[0] ?? null;
    return profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  },

  openSwitcher() { set({ switcherOpen: true }); },
  closeSwitcher() { set({ switcherOpen: false }); },
}));

// Re-export getProfileApiKey for useChat
export { getProfileApiKey };
