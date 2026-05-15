/**
 * PluginLogo — shows a plugin's logo.png if available, falls back to its
 * emoji icon. The logo URL is built from raw_base + plugin.path + logo filename.
 */
import { useState, useEffect } from 'react';
import { getConfig } from '@/lib/config';
import { cn } from '@/lib/utils';

interface PluginLogoProps {
  /** Plugin path relative to the repo root e.g. "skills/web-search" */
  path: string;
  /** Logo filename from the manifest e.g. "logo.png" — omit to use emoji only */
  logo?: string;
  /** Emoji fallback */
  icon: string;
  /** Tailwind size classes applied to both the img and the emoji wrapper */
  className?: string;
  /** Extra class for the emoji text size */
  emojiClassName?: string;
}

export function PluginLogo({ path, logo, icon, className, emojiClassName }: PluginLogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!logo) return;
    let cancelled = false;
    getConfig().then((cfg) => {
      if (!cancelled) {
        setLogoUrl(`${cfg.plugins.raw_base}/${path}/${logo}`);
        setFailed(false);
      }
    });
    return () => { cancelled = true; };
  }, [path, logo]);

  const showLogo = logoUrl && !failed;

  return (
    <div className={cn('flex items-center justify-center overflow-hidden rounded-xl bg-muted/60', className)}>
      {showLogo ? (
        <img
          src={logoUrl!}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className={cn('leading-none', emojiClassName ?? 'text-xl')}>{icon}</span>
      )}
    </div>
  );
}
