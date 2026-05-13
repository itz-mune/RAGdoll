import { RESPONSE_STYLES } from '@/lib/responseStyles';
import type { ResponseStyle } from '@/types/chat';

interface ResponseStyleSelectorProps {
  value: ResponseStyle | null;
  onChange: (style: ResponseStyle | null) => void;
}

export function ResponseStyleSelector({ value, onChange }: ResponseStyleSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      {RESPONSE_STYLES.map((style) => {
        const Icon = style.icon;
        const isActive = value === style.id;
        return (
          <button
            key={style.id}
            type="button"
            title={`${style.label}: ${style.description}`}
            onClick={() => onChange(isActive ? null : style.id)}
            className={`group relative p-1.5 rounded-md transition-all ${
              isActive
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
              <div className="rounded-md bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-lg whitespace-nowrap border border-border/60">
                {style.label}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
