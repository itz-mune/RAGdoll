import { useEffect, useState } from 'react';
import { ArrowLeft, Download, Check, Tag, ExternalLink, RefreshCcw, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getConfig } from '@/lib/config';
import type { RegistryPlugin, InstalledPlugin } from '@/hooks/useMarketplace';

interface PluginDetailPageProps {
  plugin: RegistryPlugin;
  installed: InstalledPlugin | undefined;
  installing: boolean;
  updating: boolean;
  hasUpdate: boolean;
  onInstall: () => void;
  onUpdate: () => void;
  onUninstall: () => void;
  onBack: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  skill:  'bg-blue-500/15 text-blue-400',
  style:  'bg-purple-500/15 text-purple-400',
  addon:  'bg-green-500/15 text-green-400',
};

export function PluginDetailPage({ plugin, installed, installing, updating, hasUpdate, onInstall, onUpdate, onUninstall, onBack }: PluginDetailPageProps) {
  const [readme, setReadme] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(true);
  const [confirmUninstall, setConfirmUninstall] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await getConfig();
        const url = `${config.plugins.raw_base}/${plugin.path}/README.md`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('No README');
        const text = await r.text();
        if (!cancelled) setReadme(text);
      } catch {
        if (!cancelled) setReadme(null);
      } finally {
        if (!cancelled) setReadmeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [plugin.path]);

  const isInstalled = !!installed;
  const categoryColor = CATEGORY_COLORS[plugin.category] ?? 'bg-muted text-muted-foreground';
  const changelog = installed?.changelog ?? {};

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.15 }}
      className="flex h-full flex-col overflow-hidden"
    >
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      </div>

      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted/60 text-3xl">
              {plugin.icon}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="text-lg font-bold">{plugin.name}</h1>
              <p className="text-sm text-muted-foreground">{plugin.description}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', categoryColor)}>
                  {plugin.category}
                </span>
                <span className="text-[11px] text-muted-foreground">by {plugin.author}</span>
                <span className="text-[11px] text-muted-foreground">v{plugin.version}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {hasUpdate && (
                <Button
                  size="sm"
                  onClick={onUpdate}
                  disabled={updating}
                  className="gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                  variant="outline"
                >
                  <RefreshCcw className={cn('h-3.5 w-3.5', updating && 'animate-spin')} />
                  {updating ? 'Updating…' : `Update to v${plugin.version}`}
                </Button>
              )}
              {isInstalled && !hasUpdate ? (
                <Button variant="outline" size="sm" disabled className="gap-1.5">
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  Installed
                </Button>
              ) : !isInstalled ? (
                <Button size="sm" onClick={onInstall} disabled={installing} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  {installing ? 'Installing…' : 'Install'}
                </Button>
              ) : null}

              {/* Uninstall — only for non-preinstalled plugins */}
              {isInstalled && !installed?.is_preinstalled && (
                confirmUninstall ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Remove?</span>
                    <Button
                      size="sm" variant="destructive"
                      className="gap-1 h-7 px-2 text-xs"
                      onClick={() => { onUninstall(); onBack(); }}
                    >
                      <Trash2 className="h-3 w-3" /> Yes, remove
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setConfirmUninstall(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm" variant="ghost"
                    className="gap-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmUninstall(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Uninstall
                  </Button>
                )
              )}
            </div>
          </div>

          {/* Tags */}
          {plugin.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {plugin.tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-muted/50 px-2.5 py-0.5 text-[10px] text-muted-foreground">
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* README */}
          <div>
            <h2 className="mb-3 text-sm font-semibold">Documentation</h2>
            {readmeLoading ? (
              <div className="space-y-2">
                {[80, 60, 90, 70].map((w, i) => (
                  <div key={i} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : readme ? (
              <div className="text-sm leading-relaxed text-foreground/85">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 className="mt-6 mb-3 text-xl font-bold text-foreground first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="mt-5 mb-2.5 text-base font-semibold text-foreground first:mt-0 border-b border-border/40 pb-1">{children}</h2>,
                    h3: ({ children }) => <h3 className="mt-4 mb-2 text-sm font-semibold text-foreground">{children}</h3>,
                    h4: ({ children }) => <h4 className="mt-3 mb-1.5 text-sm font-medium text-foreground">{children}</h4>,
                    p:  ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed text-foreground/80">{children}</p>,
                    ul: ({ children }) => <ul className="mb-3 ml-4 space-y-1 list-disc text-foreground/80">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-3 ml-4 space-y-1 list-decimal text-foreground/80">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    a:  ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 hover:no-underline">
                        {children}
                      </a>
                    ),
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                    em:     ({ children }) => <em className="italic text-foreground/75">{children}</em>,
                    blockquote: ({ children }) => (
                      <blockquote className="my-3 border-l-2 border-primary/40 pl-3 text-muted-foreground italic">
                        {children}
                      </blockquote>
                    ),
                    code: ({ className, children, ...props }) => {
                      const isBlock = className?.includes('language-');
                      if (isBlock) {
                        return (
                          <code className={cn('block', className)} {...props}>
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8em] text-foreground/90" {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => (
                      <pre className="my-3 overflow-x-auto rounded-lg border border-border/40 bg-muted p-3 font-mono text-[0.8em] leading-relaxed">
                        {children}
                      </pre>
                    ),
                    hr: () => <hr className="my-4 border-border/40" />,
                    table: ({ children }) => (
                      <div className="my-3 overflow-x-auto rounded-lg border border-border/40">
                        <table className="w-full text-xs">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                    th: ({ children }) => (
                      <th className="border-b border-border/40 px-3 py-2 text-left font-semibold text-foreground">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="border-b border-border/20 px-3 py-2 text-foreground/80 last:border-0">
                        {children}
                      </td>
                    ),
                    tr: ({ children }) => <tr className="transition-colors hover:bg-muted/20">{children}</tr>,
                  }}
                >
                  {readme}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60 italic">No documentation available.</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-52 shrink-0 overflow-y-auto border-l border-border/40 px-4 py-5 space-y-5 text-xs">
          <div>
            <p className="mb-1.5 font-semibold text-muted-foreground/70 uppercase tracking-wide text-[10px]">Details</p>
            <div className="space-y-1.5 text-muted-foreground">
              <div className="flex justify-between">
                <span>Version</span>
                <span className="text-foreground">{plugin.version}</span>
              </div>
              <div className="flex justify-between">
                <span>Min version</span>
                <span className="text-foreground">{plugin.min_ragdoll_version}</span>
              </div>
              <div className="flex justify-between">
                <span>Category</span>
                <span className="text-foreground capitalize">{plugin.category}</span>
              </div>
            </div>
          </div>

          {Object.keys(changelog).length > 0 && (
            <div>
              <p className="mb-1.5 font-semibold text-muted-foreground/70 uppercase tracking-wide text-[10px]">Changelog</p>
              <div className="space-y-2">
                {Object.entries(changelog).reverse().map(([ver, note]) => (
                  <div key={ver}>
                    <p className="font-medium text-foreground">v{ver}</p>
                    <p className="text-muted-foreground leading-relaxed">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <a
            href={`https://github.com/itz-mune/RAGdoll-plugins/tree/main/${plugin.path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary/80 hover:text-primary transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View on GitHub
          </a>
        </div>
      </div>
    </motion.div>
  );
}
