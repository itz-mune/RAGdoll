import { useState, useMemo } from 'react';
import { Search, RefreshCw, Download, Check, ToggleLeft, ToggleRight, Trash2, Palette, AlertCircle, RefreshCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMarketplace, type RegistryPlugin, type InstalledPlugin } from '@/hooks/useMarketplace';
import { PluginDetailPage } from './PluginDetailPage';
import { PluginLogo } from './PluginLogo';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'browse' | 'installed' | 'updates';
type Category = 'all' | 'skill' | 'style' | 'addon';

const CATEGORY_LABELS: Record<Category, string> = {
  all: 'All',
  skill: 'Skills',
  style: 'Styles',
  addon: 'Add-Ons',
};

const CATEGORY_COLORS: Record<string, string> = {
  skill:  'bg-blue-500/15 text-blue-400',
  style:  'bg-purple-500/15 text-purple-400',
  addon:  'bg-green-500/15 text-green-400',
};

// ── Main page ─────────────────────────────────────────────────────────────────

export function MarketplacePage() {
  const marketplace = useMarketplace();
  const [tab, setTab] = useState<Tab>('browse');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [detailPlugin, setDetailPlugin] = useState<RegistryPlugin | null>(null);

  const installedMap = useMemo(
    () => Object.fromEntries(marketplace.installed.map((p) => [p.id, p])),
    [marketplace.installed],
  );

  const filteredRegistry = useMemo(() => {
    let list = marketplace.registry;
    if (category !== 'all') list = list.filter((p) => p.category === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q)),
      );
    }
    return list;
  }, [marketplace.registry, category, query]);

  const updateCount = marketplace.availableUpdates.size;

  // Plugins that have updates, with their registry entry
  const updateablePlugins = useMemo(
    () => marketplace.registry.filter((r) => marketplace.availableUpdates.has(r.id)),
    [marketplace.registry, marketplace.availableUpdates],
  );

  // Detail page overlay
  if (detailPlugin) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <PluginDetailPage
          plugin={detailPlugin}
          installed={installedMap[detailPlugin.id]}
          installing={marketplace.installing === detailPlugin.id}
          updating={marketplace.updating === detailPlugin.id}
          hasUpdate={marketplace.availableUpdates.has(detailPlugin.id)}
          onInstall={() => marketplace.installPlugin(detailPlugin)}
          onUpdate={() => marketplace.updatePlugin(detailPlugin)}
          onUninstall={() => marketplace.uninstallPlugin(detailPlugin.id)}
          onBack={() => setDetailPlugin(null)}
        />
        {marketplace.installProgress && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background px-4 py-2 text-xs shadow-xl">
            {marketplace.installProgress}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-muted/10 px-4 py-3">
        <h1 className="text-sm font-semibold">Marketplace</h1>
        <div className="relative ml-2 flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plugins…"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={marketplace.refresh}
          disabled={marketplace.isLoading}
          className="ml-auto h-7 gap-1 px-2 text-[11px]"
        >
          <RefreshCw className={cn('h-3 w-3', marketplace.isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-border/40">
        {(['browse', 'installed', ...(updateCount > 0 ? ['updates'] : [])] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'relative px-5 py-2 text-xs font-medium capitalize transition-colors',
              tab === t
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
            {t === 'installed' && marketplace.installed.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {marketplace.installed.length}
              </span>
            )}
            {t === 'updates' && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {updateCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Global error */}
      {marketplace.error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {marketplace.error}
        </div>
      )}

      {/* Install/update progress toast */}
      {marketplace.installProgress && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-xs text-primary">
          {marketplace.installProgress}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>

          {/* ── Browse ─────────────────────────────────────────────────────── */}
          {tab === 'browse' && (
            <motion.div key="browse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} className="p-4 space-y-4">
              <div className="flex gap-2">
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      category === cat ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              {marketplace.isLoading ? (
                <PluginGridSkeleton />
              ) : filteredRegistry.length === 0 ? (
                <RegistryEmpty onRetry={marketplace.refresh} hasQuery={!!query} />
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {filteredRegistry.map((plugin) => (
                    <PluginCard
                      key={plugin.id}
                      plugin={plugin}
                      isInstalled={!!installedMap[plugin.id]}
                      hasUpdate={marketplace.availableUpdates.has(plugin.id)}
                      installing={marketplace.installing === plugin.id}
                      updating={marketplace.updating === plugin.id}
                      onInstall={() => marketplace.installPlugin(plugin)}
                      onUpdate={() => marketplace.updatePlugin(plugin)}
                      onViewDetail={() => setDetailPlugin(plugin)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Installed ──────────────────────────────────────────────────── */}
          {tab === 'installed' && (
            <motion.div key="installed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} className="p-4 space-y-2">
              {marketplace.installed.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 py-12 text-center">
                  <p className="text-sm text-muted-foreground">No plugins installed yet.</p>
                  <button onClick={() => setTab('browse')} className="mt-2 text-xs text-primary hover:underline">
                    Browse the marketplace →
                  </button>
                </div>
              ) : (
                marketplace.installed.map((plugin) => (
                  <InstalledRow
                    key={plugin.id}
                    plugin={plugin}
                    activeStyle={marketplace.activeStyle}
                    hasUpdate={marketplace.availableUpdates.has(plugin.id)}
                    updating={marketplace.updating === plugin.id}
                    registryPlugin={marketplace.registry.find((r) => r.id === plugin.id)}
                    onEnable={() => marketplace.enablePlugin(plugin.id)}
                    onDisable={() => marketplace.disablePlugin(plugin.id)}
                    onUninstall={() => marketplace.uninstallPlugin(plugin.id)}
                    onActivateStyle={() => marketplace.activateStyle(plugin.id)}
                    onClearStyle={marketplace.clearStyle}
                    onUpdate={() => {
                      const reg = marketplace.registry.find((r) => r.id === plugin.id);
                      if (reg) marketplace.updatePlugin(reg);
                    }}
                    onViewDetail={() => {
                      const reg = marketplace.registry.find((r) => r.id === plugin.id);
                      if (reg) setDetailPlugin(reg);
                    }}
                  />
                ))
              )}
            </motion.div>
          )}

          {/* ── Updates ────────────────────────────────────────────────────── */}
          {tab === 'updates' && (
            <motion.div key="updates" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} className="p-4 space-y-3">
              {/* Update all */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {updateCount} plugin{updateCount > 1 ? 's have' : ' has'} a new version available.
                </p>
                <button
                  onClick={async () => {
                    for (const plugin of updateablePlugins) {
                      await marketplace.updatePlugin(plugin);
                    }
                  }}
                  disabled={!!marketplace.updating}
                  className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-500 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
                >
                  <RefreshCcw className={cn('h-3 w-3', marketplace.updating && 'animate-spin')} />
                  Update all
                </button>
              </div>

              <div className="space-y-2">
                {updateablePlugins.map((plugin) => {
                  const installed = installedMap[plugin.id];
                  return (
                    <UpdateRow
                      key={plugin.id}
                      plugin={plugin}
                      installedVersion={installed?.version ?? '?'}
                      updating={marketplace.updating === plugin.id}
                      onUpdate={() => marketplace.updatePlugin(plugin)}
                      onViewDetail={() => setDetailPlugin(plugin)}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Plugin card (browse grid) ─────────────────────────────────────────────────

function PluginCard({ plugin, isInstalled, hasUpdate, installing, updating, onInstall, onUpdate, onViewDetail }: {
  plugin: RegistryPlugin; isInstalled: boolean; hasUpdate: boolean;
  installing: boolean; updating: boolean;
  onInstall: () => void; onUpdate: () => void; onViewDetail: () => void;
}) {
  const color = CATEGORY_COLORS[plugin.category] ?? 'bg-muted text-muted-foreground';
  return (
    <div
      onClick={onViewDetail}
      className={cn(
        'group flex cursor-pointer flex-col gap-2 rounded-xl border bg-muted/20 p-3.5 transition-colors hover:bg-muted/40',
        hasUpdate ? 'border-amber-500/40 hover:border-amber-500/60' : 'border-border/50 hover:border-border',
      )}
    >
      <div className="flex items-start gap-2.5">
        <PluginLogo path={plugin.path} logo={plugin.logo} icon={plugin.icon} className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{plugin.name}</p>
          <p className="truncate text-[10px] text-muted-foreground/70">{plugin.author}</p>
        </div>
      </div>
      <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{plugin.description}</p>
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', color)}>
          {plugin.category}
        </span>
        {hasUpdate ? (
          <button onClick={(e) => { e.stopPropagation(); onUpdate(); }} disabled={updating}
            className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500 transition-colors hover:bg-amber-500/25 disabled:opacity-50">
            <RefreshCcw className={cn('h-2.5 w-2.5', updating && 'animate-spin')} />
            {updating ? 'Updating…' : 'Update'}
          </button>
        ) : isInstalled ? (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-green-500">
            <Check className="h-3 w-3" /> Installed
          </span>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onInstall(); }} disabled={installing}
            className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50">
            <Download className="h-2.5 w-2.5" />
            {installing ? '…' : 'Install'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Installed row ─────────────────────────────────────────────────────────────

function InstalledRow({ plugin, activeStyle, hasUpdate, updating, registryPlugin,
  onEnable, onDisable, onUninstall, onActivateStyle, onClearStyle, onUpdate, onViewDetail }: {
  plugin: InstalledPlugin; activeStyle: string | null; hasUpdate: boolean;
  updating: boolean; registryPlugin?: RegistryPlugin;
  onEnable: () => void; onDisable: () => void; onUninstall: () => void;
  onActivateStyle: () => void; onClearStyle: () => void;
  onUpdate: () => void; onViewDetail: () => void;
}) {
  const isStyle = plugin.category === 'style';
  const isActiveStyle = activeStyle === plugin.id;

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 transition-colors',
      hasUpdate ? 'border-amber-500/30' : 'border-border/50',
    )}>
      <PluginLogo
        path={registryPlugin?.path ?? `${plugin.category}s/${plugin.id}`}
        logo={registryPlugin?.logo}
        icon={plugin.icon}
        className="h-8 w-8 shrink-0 rounded-lg"
        emojiClassName="text-lg"
      />
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onViewDetail}>
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium">{plugin.name}</p>
          {hasUpdate && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-500">
              v{registryPlugin?.version} available
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">v{plugin.version} · {plugin.author}</p>
      </div>

      {hasUpdate && (
        <button onClick={onUpdate} disabled={updating}
          className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-medium text-amber-500 transition-colors hover:bg-amber-500/25 disabled:opacity-50">
          <RefreshCcw className={cn('h-3 w-3', updating && 'animate-spin')} />
          {updating ? 'Updating…' : 'Update'}
        </button>
      )}

      {isStyle && (
        <button onClick={isActiveStyle ? onClearStyle : onActivateStyle}
          className={cn('flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
            isActiveStyle ? 'bg-purple-500/20 text-purple-400' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
          <Palette className="h-3 w-3" />
          {isActiveStyle ? 'Active' : 'Set active'}
        </button>
      )}

      <button onClick={plugin.is_enabled ? onDisable : onEnable}
        className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
        title={plugin.is_enabled ? 'Disable' : 'Enable'}>
        {plugin.is_enabled ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
      </button>

      {!plugin.is_preinstalled && (
        <button onClick={onUninstall}
          className="shrink-0 rounded p-0.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
          title="Uninstall">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Update row (Updates tab) ──────────────────────────────────────────────────

function UpdateRow({ plugin, installedVersion, updating, onUpdate, onViewDetail }: {
  plugin: RegistryPlugin; installedVersion: string;
  updating: boolean; onUpdate: () => void; onViewDetail: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <PluginLogo path={plugin.path} logo={plugin.logo} icon={plugin.icon} className="h-10 w-10 shrink-0 rounded-xl" emojiClassName="text-2xl" />
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onViewDetail}>
        <p className="text-sm font-semibold">{plugin.name}</p>
        <p className="text-[11px] text-muted-foreground">
          by {plugin.author}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground/60 line-through">v{installedVersion}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-medium text-amber-500">v{plugin.version}</span>
        </div>
      </div>
      <button
        onClick={onUpdate}
        disabled={updating}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <RefreshCcw className={cn('h-3 w-3', updating && 'animate-spin')} />
        {updating ? 'Updating…' : 'Update'}
      </button>
    </div>
  );
}

// ── Skeleton / empty states ───────────────────────────────────────────────────

function PluginGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-xl border border-border/30 bg-muted/20" />
      ))}
    </div>
  );
}

function RegistryEmpty({ onRetry, hasQuery }: { onRetry: () => void; hasQuery: boolean }) {
  if (hasQuery) return <div className="py-12 text-center"><p className="text-sm text-muted-foreground">No plugins matched your search.</p></div>;
  return (
    <div className="py-12 text-center space-y-3">
      <p className="text-sm text-muted-foreground">Could not reach the plugin registry.<br />Check your internet connection.</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  );
}
