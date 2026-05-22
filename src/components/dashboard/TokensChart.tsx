import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import type { DayTokens } from '@/store/dashboardStore';

interface TokensChartProps {
  data: DayTokens[];
  loading?: boolean;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-[11px] text-muted-foreground">{format(parseISO(label), 'MMM d, yyyy')}</p>
      <p className="text-xs font-semibold text-foreground">{fmtTokens(payload[0].value)} tokens</p>
    </div>
  );
}

export function TokensChart({ data, loading }: TokensChartProps) {
  const trimmed = [...data];
  while (trimmed.length > 1 && trimmed[trimmed.length - 1].tokens === 0) trimmed.pop();

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        Token usage (last 30 days)
      </p>
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        /*
         * recharts v3 renders a <rect> as the chart background AND a cursor rect on hover.
         * We target both with CSS:
         *   recharts-rectangle   → the bar-background rects (fill transparent)
         *   recharts-cursor      → the hover cursor rect  (fill subtle white)
         * Plus explicit style={{ background:'transparent' }} on the chart SVG surface.
         */
        <div
          className={[
            // Make all recharts wrapper divs & SVG surface transparent
            '[&_.recharts-wrapper]:!bg-transparent',
            '[&_.recharts-surface]:!bg-transparent',
            // Cursor on hover: very faint white instead of the default dark
            '[&_.recharts-rectangle.recharts-cursor]:!fill-white/5',
            // Background rects behind each bar: transparent
            '[&_.recharts-bar-background-rectangle]:!fill-transparent',
          ].join(' ')}
        >
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={trimmed}
              margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
              style={{ background: 'transparent', backgroundColor: 'transparent' }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.08)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => format(parseISO(v), 'MMM d')}
                tick={{ fontSize: 10, fill: '#888' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={fmtTokens}
                tick={{ fontSize: 10, fill: '#888' }}
                tickLine={false}
                axisLine={false}
              />
              {/* cursor: faint white highlight instead of dark box */}
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                content={<CustomTooltip />}
              />
              <Bar
                dataKey="tokens"
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
                background={false}
              >
                {trimmed.map((_, i) => (
                  <Cell key={i} fill="#f59e0b" fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
