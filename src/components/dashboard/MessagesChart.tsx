import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import type { DayCount } from '@/store/dashboardStore';

interface MessagesChartProps {
  data: DayCount[];
  loading?: boolean;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-[11px] text-muted-foreground">{format(parseISO(label), 'MMM d, yyyy')}</p>
      <p className="text-xs font-semibold text-foreground">{payload[0].value} messages</p>
    </div>
  );
}

export function MessagesChart({ data, loading }: MessagesChartProps) {
  const trimmed = [...data];
  while (trimmed.length > 1 && trimmed[trimmed.length - 1].count === 0) trimmed.pop();

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        Messages (last 30 days)
      </p>
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div
          className={[
            '[&_.recharts-wrapper]:!bg-transparent',
            '[&_.recharts-surface]:!bg-transparent',
            '[&_.recharts-rectangle.recharts-cursor]:!fill-white/5',
          ].join(' ')}
        >
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart
              data={trimmed}
              margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
              style={{ background: 'transparent', backgroundColor: 'transparent' }}
            >
              <defs>
                <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.30} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => format(parseISO(v), 'MMM d')}
                tick={{ fontSize: 10, fill: '#888' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: '#888' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
                content={<CustomTooltip />}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#msgGrad)"
                dot={false}
                activeDot={{ r: 4, fill: '#22c55e' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
