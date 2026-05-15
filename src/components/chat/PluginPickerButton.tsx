import { useEffect, useRef, useState } from 'react';
import { Puzzle, Palette, Zap, Check, Blocks } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIDECAR_URL = 'http://127.0.0.1:8765';

// ── Types ─────────────────────────────────────────────────────────────────────

interface InstalledPlugin {
  id: string;
  name: string;
  icon: string;
  category: 'skill' | 'style' | 'addon';
  is_enabled: boolean;
}

interface PluginsResponse {
  plugins: InstalledPlugin[];
  active_style: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PluginPickerButton({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [activeStyle, setActiveStyle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Fetch installed plugins when popover opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${SIDECAR_URL}/plugins`)
      .then((r) => r.json())
      .then((data: PluginsResponse) => {
        setPlugins(data.plugins ?? []);
        setActiveStyle(data.active_style ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const skills = plugins.filter((p) => p.category === 'skill');
  const styles = plugins.filter((p) => p.category === 'style');
  const addons = plugins.filter((p) => p.category === 'addon');

  // ── Handlers ────────────────────────────────────────────────────────────────

  const toggleSkill = async (plugin: InstalledPlugin) => {
    const endpoint = plugin.is_enabled ? 'disable' : 'enable';
    await fetch(`${SIDECAR_URL}/plugins/${plugin.id}/${endpoint}`, { method: 'POST' });
    setPlugins((prev) =>
      prev.map((p) => (p.id === plugin.id ? { ...p, is_enabled: !p.is_enabled } : p))
    );
  };

  const selectStyle = async (pluginId: string | null) => {
    if (pluginId === null) {
      await fetch(`${SIDECAR_URL}/plugins/style/clear`, { method: 'POST' });
      setActiveStyle(null);
    } else if (activeStyle === pluginId) {
      // Clicking active style deselects it
      await fetch(`${SIDECAR_URL}/plugins/style/clear`, { method: 'POST' });
      setActiveStyle(null);
    } else {
      await fetch(`${SIDECAR_URL}/plugins/style/${pluginId}/activate`, { method: 'POST' });
      setActiveStyle(pluginId);
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────────

  const activeSkillCount = skills.filter((p) => p.is_enabled).length;
  const activeStylePlugin = styles.find((p) => p.id === activeStyle);

  const activeAddonCount = addons.filter((p) => p.is_enabled).length;

  // Build indicator label for the button
  const hasActive = activeSkillCount > 0 || !!activeStyle || activeAddonCount > 0;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="Skills & Styles"
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          open
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          disabled && 'pointer-events-none opacity-40',
        )}
      >
        <Puzzle className="h-4 w-4" />
        {/* Active indicator dot */}
        {hasActive && (
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-border/60 bg-popover shadow-xl z-50 overflow-hidden">

          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              Loading plugins…
            </div>
          ) : plugins.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground px-4">
              No plugins installed.
              <br />
              Visit the Marketplace to install some.
            </div>
          ) : (
            <div className="divide-y divide-border/40">

              {/* ── Skills section ──────────────────────────────────────────── */}
              {skills.length > 0 && (
                <div className="p-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    <Zap className="h-3 w-3" />
                    Skills
                    {activeSkillCount > 0 && (
                      <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                        {activeSkillCount} active
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {skills.map((plugin) => (
                      <button
                        key={plugin.id}
                        onClick={() => toggleSkill(plugin)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                          plugin.is_enabled
                            ? 'bg-primary/8 text-foreground'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )}
                      >
                        <span className="text-base leading-none">{plugin.icon}</span>
                        <span className="flex-1 text-xs font-medium">{plugin.name}</span>
                        {/* Checkbox indicator */}
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                            plugin.is_enabled
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background',
                          )}
                        >
                          {plugin.is_enabled && <Check className="h-2.5 w-2.5" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Style section ────────────────────────────────────────────── */}
              {styles.length > 0 && (
                <div className="p-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    <Palette className="h-3 w-3" />
                    Style
                    {activeStylePlugin && (
                      <span className="ml-auto rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-medium text-purple-400">
                        {activeStylePlugin.icon} {activeStylePlugin.name}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {/* "None" option */}
                    <button
                      onClick={() => selectStyle(null)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                        !activeStyle
                          ? 'bg-muted/60 text-foreground'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      )}
                    >
                      <span className="text-base leading-none">✦</span>
                      <span className="flex-1 text-xs font-medium">Default</span>
                      {!activeStyle && (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary bg-primary">
                          <Check className="h-2.5 w-2.5 text-primary-foreground" />
                        </span>
                      )}
                    </button>

                    {styles.map((plugin) => {
                      const isActive = activeStyle === plugin.id;
                      return (
                        <button
                          key={plugin.id}
                          onClick={() => selectStyle(plugin.id)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                            isActive
                              ? 'bg-purple-500/10 text-foreground'
                              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                          )}
                        >
                          <span className="text-base leading-none">{plugin.icon}</span>
                          <span className="flex-1 text-xs font-medium">{plugin.name}</span>
                          {/* Radio indicator */}
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                              isActive
                                ? 'border-purple-500 bg-purple-500'
                                : 'border-border bg-background',
                            )}
                          >
                            {isActive && <Check className="h-2.5 w-2.5 text-white" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Add-ons section ─────────────────────────────────────────── */}
              {addons.length > 0 && (
                <div className="p-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    <Blocks className="h-3 w-3" />
                    Add-ons
                    {activeAddonCount > 0 && (
                      <span className="ml-auto rounded-full bg-green-500/15 px-1.5 py-0.5 text-[9px] font-medium text-green-400">
                        {activeAddonCount} active
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {addons.map((plugin) => (
                      <button
                        key={plugin.id}
                        onClick={() => toggleSkill(plugin)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                          plugin.is_enabled
                            ? 'bg-green-500/8 text-foreground'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )}
                      >
                        <span className="text-base leading-none">{plugin.icon}</span>
                        <span className="flex-1 text-xs font-medium">{plugin.name}</span>
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                            plugin.is_enabled
                              ? 'border-green-500 bg-green-500 text-white'
                              : 'border-border bg-background',
                          )}
                        >
                          {plugin.is_enabled && <Check className="h-2.5 w-2.5" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}
