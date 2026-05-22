import { Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { TopSkill } from '@/store/dashboardStore';

interface TopSkillsCardProps {
  skills: TopSkill[];
  loading?: boolean;
}

const SKILL_ICON_MAP: Record<string, string> = {
  'web-search': '🔍',
  'image-viewer': '🖼️',
  'url-fetcher': '🌐',
  'youtube-transcript': '▶️',
  'skill-finder': '🧩',
};

export function TopSkillsCard({ skills, loading }: TopSkillsCardProps) {
  const maxCount = skills[0]?.count ?? 1;

  return (
    // No fixed height — card shrinks to fit its content naturally
    <div className="rounded-xl border border-border/40 bg-card p-4 self-start">
      <div className="flex items-center gap-1.5 mb-3">
        <Zap className="h-3.5 w-3.5 text-amber-400" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Top Skills Used
        </p>
      </div>

      {loading ? (
        // Only show 3 skeleton rows while loading
        <div className="space-y-2">
          {[70, 50, 40].map((w, i) => (
            <Skeleton key={i} className="h-5" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 italic">No skill usage yet.</p>
      ) : (
        <div className="space-y-2.5">
          {skills.map((s) => (
            <div key={s.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <span>{SKILL_ICON_MAP[s.name] ?? '⚡'}</span>
                  {s.name}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{s.count}×</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400/70 transition-all duration-500"
                  style={{ width: `${(s.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
