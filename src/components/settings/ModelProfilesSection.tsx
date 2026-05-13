import { useState } from 'react';
import { Plus, MoreHorizontal, Star, Pencil, Trash2, Check, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { profileStore } from '@/store/profileStore';
import { ProfileForm } from './ProfileForm';
import { getProfileColor, getInitials, PROVIDER_ABBR } from '@/components/chat/ProfileSwitcher';
import type { ModelProfile } from '@/types/profile';

const SIDECAR_URL = 'http://127.0.0.1:8765';

type DrawerMode = { type: 'create' } | { type: 'edit'; profile: ModelProfile } | null;

// ── Profile card ──────────────────────────────────────────────────────────────

function ProfileCard({
  profile,
  isActive,
  isOnly,
  onEdit,
  onDelete,
  onSetDefault,
  onValidate,
}: {
  profile: ModelProfile;
  isActive: boolean;
  isOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onValidate: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group relative flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3 hover:border-border transition-colors">
      {/* Avatar */}
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: getProfileColor(profile.id) }}
      >
        {getInitials(profile.displayName)}
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{profile.displayName}</span>
          {profile.isDefault && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Default
            </span>
          )}
          {isActive && (
            <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
              Active
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {PROVIDER_ABBR[profile.provider] ?? profile.provider} · {profile.modelName}
        </p>
      </div>

      {/* Three-dot menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                className="absolute right-0 top-8 z-50 w-44 rounded-lg border border-border/60 bg-popover p-1 shadow-lg"
              >
                {[
                  { icon: Star, label: 'Set as default', action: () => { onSetDefault(); setMenuOpen(false); } },
                  { icon: Pencil, label: 'Edit', action: () => { onEdit(); setMenuOpen(false); } },
                  { icon: ShieldCheck, label: 'Validate key', action: () => { onValidate(); setMenuOpen(false); } },
                  { icon: Trash2, label: 'Delete', action: onDelete, danger: true, disabled: isOnly },
                ].map(({ icon: Icon, label, action, danger, disabled: dis }) => (
                  <button
                    key={label}
                    onClick={action}
                    disabled={dis}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-40 ${
                      danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function ModelProfilesSection() {
  const profiles = profileStore((s) => s.profiles);
  const activeProfileId = profileStore((s) => s.activeProfileId);
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [validateResult, setValidateResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  const handleValidate = async (profile: ModelProfile) => {
    setValidateResult(null);
    try {
      const { getProfileApiKey: getKey } = await import('@/store/profileStore');
      const key = await getKey(profile.id);
      const res = await fetch(`${SIDECAR_URL}/settings/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: profile.provider, api_key: key ?? '', model: profile.modelName }),
      });
      const json = (await res.json()) as { valid: boolean; error?: string };
      setValidateResult({ id: profile.id, ok: json.valid, msg: json.valid ? 'Key is valid ✓' : (json.error ?? 'Invalid key') });
    } catch {
      setValidateResult({ id: profile.id, ok: false, msg: 'Could not reach sidecar' });
    }
    setTimeout(() => setValidateResult(null), 4000);
  };

  const handleDelete = (profile: ModelProfile) => {
    if (!confirm(`Delete profile "${profile.displayName}"? This cannot be undone.`)) return;
    profileStore.getState().removeProfile(profile.id);
  };

  return (
    <div className="relative flex h-full gap-0">
      {/* Profile list */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Model Profiles</h2>
            <p className="text-sm text-muted-foreground">Each profile stores a provider, model and API key combination.</p>
          </div>
          <Button size="sm" onClick={() => setDrawer({ type: 'create' })} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New profile
          </Button>
        </div>

        {profiles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">No profiles yet. Create one to get started.</p>
            <Button size="sm" variant="outline" onClick={() => setDrawer({ type: 'create' })}>
              Create profile
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {profiles.map((p) => (
              <div key={p.id}>
                <ProfileCard
                  profile={p}
                  isActive={p.id === activeProfileId}
                  isOnly={profiles.length === 1}
                  onEdit={() => setDrawer({ type: 'edit', profile: p })}
                  onDelete={() => handleDelete(p)}
                  onSetDefault={() => profileStore.getState().setDefaultProfile(p.id)}
                  onValidate={() => handleValidate(p)}
                />
                {validateResult?.id === p.id && (
                  <div className={`mt-1 flex items-center gap-1.5 px-4 text-xs ${validateResult.ok ? 'text-green-600' : 'text-destructive'}`}>
                    <Check className="h-3 w-3" />
                    {validateResult.msg}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slide-in drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-black/40"
              onClick={() => setDrawer(null)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="absolute right-0 top-0 z-40 h-full w-80 overflow-y-auto border-l border-border/50 bg-background p-6 shadow-xl"
            >
              <h3 className="mb-5 text-base font-semibold text-foreground">
                {drawer.type === 'create' ? 'New profile' : `Edit "${drawer.profile.displayName}"`}
              </h3>
              <ProfileForm
                existing={drawer.type === 'edit' ? drawer.profile : undefined}
                onSaved={() => setDrawer(null)}
                onCancel={() => setDrawer(null)}
                submitLabel={drawer.type === 'create' ? 'Create profile' : 'Save changes'}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
