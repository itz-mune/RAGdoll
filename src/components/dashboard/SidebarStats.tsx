/**
 * SidebarStats — Memory stats + active profile info
 * Rendered in the right column below TopSkillsCard.
 */
import { useEffect, useState } from 'react';
import { Brain, User, Database, FileText, HardDrive } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { profileStore } from '@/store/profileStore';

const SIDECAR_URL = 'http://127.0.0.1:8765';

interface MemoryStats {
  semantic_count: number;
  document_count: number;
  total_size_mb: number;
}

const PROVIDER_LABEL: Record<string, string> = {
  openai:      'OpenAI',
  anthropic:   'Anthropic',
  groq:        'Groq',
  google:      'Google',
  ollama:      'Ollama',
  huggingface: 'HuggingFace',
  openrouter:  'OpenRouter',
};

export function SidebarStats() {
  const [memStats, setMemStats] = useState<MemoryStats | null>(null);
  const [memLoading, setMemLoading] = useState(true);

  const profiles   = profileStore((s) => s.profiles);
  const activeProfile = profileStore((s) => s.getActiveProfile());

  useEffect(() => {
    fetch(`${SIDECAR_URL}/memory/stats`)
      .then((r) => r.json())
      .then((d: MemoryStats) => setMemStats(d))
      .catch(() => {})
      .finally(() => setMemLoading(false));
  }, []);

  return (
    <div className="space-y-3">

      {/* ── Memory stats ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Brain className="h-3.5 w-3.5 text-purple-400" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Memory
          </p>
        </div>

        {memLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <div className="space-y-2">
            <StatRow
              icon={<Brain className="h-3 w-3 text-purple-400/70" />}
              label="Memories"
              value={memStats ? memStats.semantic_count.toLocaleString() : '—'}
            />
            <StatRow
              icon={<FileText className="h-3 w-3 text-blue-400/70" />}
              label="Documents"
              value={memStats ? memStats.document_count.toLocaleString() : '—'}
            />
            <StatRow
              icon={<HardDrive className="h-3 w-3 text-muted-foreground/50" />}
              label="DB size"
              value={memStats ? `${memStats.total_size_mb} MB` : '—'}
            />
          </div>
        )}
      </div>

      {/* ── Profile stats ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <User className="h-3.5 w-3.5 text-sky-400" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Profile
          </p>
        </div>

        {activeProfile ? (
          <div className="space-y-2">
            <StatRow
              icon={<User className="h-3 w-3 text-sky-400/70" />}
              label="Active"
              value={activeProfile.displayName}
              valueClass="truncate max-w-[100px]"
            />
            <StatRow
              icon={<Database className="h-3 w-3 text-muted-foreground/50" />}
              label="Provider"
              value={PROVIDER_LABEL[activeProfile.provider] ?? activeProfile.provider}
            />
            <StatRow
              icon={<Database className="h-3 w-3 text-muted-foreground/50" />}
              label="Model"
              value={activeProfile.modelName}
              valueClass="truncate max-w-[100px]"
            />
            {profiles.length > 1 && (
              <p className="pt-1 text-[10px] text-muted-foreground/50">
                +{profiles.length - 1} other profile{profiles.length > 2 ? 's' : ''}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">No profile set.</p>
        )}
      </div>

    </div>
  );
}

// ── Tiny helper ───────────────────────────────────────────────────────────────

function StatRow({
  icon,
  label,
  value,
  valueClass = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 shrink-0">
        {icon}
        {label}
      </span>
      <span className={`text-[11px] font-medium text-foreground text-right ${valueClass}`} title={value}>
        {value}
      </span>
    </div>
  );
}
