import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface StatCardProps {
  label: string;
  value: string | number | null;
  subValue?: string;
  icon: React.ReactNode;
  loading?: boolean;
  color?: 'blue' | 'purple' | 'green' | 'amber';
}

const colorMap = {
  blue:   'bg-blue-500/10 text-blue-400',
  purple: 'bg-purple-500/10 text-purple-400',
  green:  'bg-green-500/10 text-green-400',
  amber:  'bg-amber-500/10 text-amber-400',
};

export function StatCard({ label, value, subValue, icon, loading, color = 'blue' }: StatCardProps) {
  return (
    <div
      className="group rounded-xl border border-border/40 bg-card p-4 flex items-start gap-3 transition-all duration-200 cursor-default"
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-40)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 1px var(--accent-20), 0 4px 16px var(--accent-10)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '';
        (e.currentTarget as HTMLElement).style.boxShadow = '';
      }}
    >
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', colorMap[color])}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-6 w-20" />
        ) : (
          <p className="mt-0.5 text-2xl font-bold text-foreground">
            {value ?? '—'}
          </p>
        )}
        {subValue && !loading && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subValue}</p>
        )}
      </div>
    </div>
  );
}
