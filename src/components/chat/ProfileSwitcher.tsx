import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { profileStore } from '@/store/profileStore';
import { ProfileForm } from '@/components/settings/ProfileForm';
import type { ModelProfile } from '@/types/profile';

// ── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

function getProfileColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

const PROVIDER_ABBR: Record<string, string> = {
  openai: 'OAI',
  anthropic: 'ANT',
  groq: 'GRQ',
  google: 'GGL',
  huggingface: 'HF',
  openrouter: 'OR',
  ollama: 'OLL',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ProfileAvatar({ profile, size = 7 }: { profile: ModelProfile; size?: number }) {
  return (
    <span
      className={`inline-flex h-${size} w-${size} shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white`}
      style={{ background: getProfileColor(profile.id) }}
    >
      {getInitials(profile.displayName)}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ProfileSwitcherProps {
  onNavigateToSettings?: () => void;
}

export function ProfileSwitcher({ onNavigateToSettings }: ProfileSwitcherProps) {
  const profiles = profileStore((s) => s.profiles);
  const activeProfileId = profileStore((s) => s.activeProfileId);
  const switcherOpen = profileStore((s) => s.switcherOpen);
  const activeProfile = profileStore((s) => s.getActiveProfile());
  const [createOpen, setCreateOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!switcherOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCreateOpen(false);
        profileStore.getState().closeSwitcher();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [switcherOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCreateOpen(false);
        profileStore.getState().closeSwitcher();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!activeProfile) return null;

  return (
    <div className="relative" ref={popoverRef}>
      {/* Trigger */}
      <button
        onClick={() => {
          if (switcherOpen) profileStore.getState().closeSwitcher();
          else profileStore.getState().openSwitcher();
        }}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        title="Switch profile (Ctrl+P)"
      >
        <ProfileAvatar profile={activeProfile} size={5} />
        <span className="max-w-[80px] truncate font-medium">{activeProfile.displayName}</span>
        <span className="text-[10px] text-muted-foreground/50 uppercase">
          {PROVIDER_ABBR[activeProfile.provider] ?? activeProfile.provider.slice(0, 3).toUpperCase()}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>

      {/* Popover */}
      <AnimatePresence>
        {switcherOpen && (
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.12 }}
            className={`absolute bottom-full left-0 mb-2 z-50 rounded-xl border border-border/60 bg-popover shadow-xl ${
              createOpen ? 'w-[22rem]' : 'w-64'
            }`}
          >
            {createOpen ? (
              <>
                <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
                  <span className="text-xs font-semibold text-foreground">New profile</span>
                  <button
                    onClick={() => setCreateOpen(false)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Close new profile form"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto p-3">
                  <ProfileForm
                    onSaved={(profileId) => {
                      void profileStore.getState().setActiveProfile(profileId);
                      setCreateOpen(false);
                      profileStore.getState().closeSwitcher();
                    }}
                    onCancel={() => setCreateOpen(false)}
                    submitLabel="Create profile"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-border/50 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Switch profile</span>
                  <button
                    onClick={() => profileStore.getState().closeSwitcher()}
                    className="text-muted-foreground hover:text-foreground transition-colors text-xs"
                  >
                    ✕
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto p-1">
                  {profiles.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => profileStore.getState().setActiveProfile(profile.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted/60 transition-colors"
                    >
                      <ProfileAvatar profile={profile} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-foreground">
                          {profile.displayName}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {PROVIDER_ABBR[profile.provider] ?? profile.provider} · {profile.modelName}
                        </div>
                      </div>
                      {profile.id === activeProfileId && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="border-t border-border/50 p-1">
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New profile
                  </button>
                  {onNavigateToSettings && (
                    <button
                      onClick={() => {
                        profileStore.getState().closeSwitcher();
                        onNavigateToSettings();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                    >
                      Manage profiles
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Re-export helpers so SettingsPage can reuse them
export { getProfileColor, getInitials, PROVIDER_ABBR, ProfileAvatar };
