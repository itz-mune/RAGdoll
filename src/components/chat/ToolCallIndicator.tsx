import { cn } from '@/lib/utils';

// Map tool function names → friendly display names + icons
export const TOOL_DISPLAY: Record<string, { label: string; icon: string }> = {
  web_search:               { label: 'Web Search',           icon: '🔍' },
  view_image:               { label: 'Image Viewer',         icon: '🖼️' },
  fetch_url:                { label: 'URL Fetcher',          icon: '🌐' },
  get_youtube_transcript:   { label: 'YouTube Transcript',   icon: '▶️' },
  generate_image_dalle:     { label: 'DALL-E Image Gen',     icon: '🎨' },
  generate_image_stability: { label: 'Stability Image Gen',  icon: '🌊' },
  generate_image_comfyui:   { label: 'ComfyUI Image Gen',    icon: '⚙️' },
};

export function toolDisplay(name: string): { label: string; icon: string } {
  if (TOOL_DISPLAY[name]) return TOOL_DISPLAY[name];
  // Fallback: prettify snake_case
  const label = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, icon: '🔧' };
}

// ── Inline loading indicator (replaces the "..." dots while skills are running) ──

interface SkillLoadingIndicatorProps {
  tools: string[];
}

export function SkillLoadingIndicator({ tools }: SkillLoadingIndicatorProps) {
  if (!tools || tools.length === 0) return null;

  // Show first tool name; if multiple, append count
  const first = toolDisplay(tools[0]);
  const extra = tools.length > 1 ? ` +${tools.length - 1}` : '';
  const label = `Using ${first.icon} ${first.label}${extra}…`;

  return (
    <span
      className={cn(
        'inline-block py-1 text-[12px] font-medium',
        'animate-tool-shimmer bg-[length:200%_100%] bg-gradient-to-r',
        'from-primary/40 via-primary to-primary/40',
        'bg-clip-text text-transparent',
      )}
    >
      {label}
    </span>
  );
}

// ── Post-response pill (shown above bubble after streaming ends) ──────────────

interface ToolCallIndicatorProps {
  tools: string[];
  isStreaming: boolean; // still generating when true → show shimmer
}

export function ToolCallIndicator({ tools, isStreaming }: ToolCallIndicatorProps) {
  if (!tools || tools.length === 0) return null;

  // While streaming + content is arriving, keep the shimmer pill above the bubble.
  // Once done, collapse to a quiet "Used X" pill.
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {tools.map((toolName) => {
        const { label, icon } = toolDisplay(toolName);
        return (
          <span
            key={toolName}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
              isStreaming
                ? 'animate-tool-shimmer border-transparent bg-[length:200%_100%] bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 text-primary'
                : 'border-border/50 bg-muted/40 text-muted-foreground',
            )}
          >
            <span className="text-sm leading-none">{icon}</span>
            {isStreaming ? `Using ${label}…` : `Used ${label}`}
          </span>
        );
      })}
    </div>
  );
}
