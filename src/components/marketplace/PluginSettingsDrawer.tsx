/**
 * PluginSettingsDrawer — slides in from the right when a plugin has config_fields.
 * Loads saved config from GET /plugins/{id}/config, saves via POST, resets via POST /reset.
 */
import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { InstalledPlugin, ConfigField, PluginAction } from '@/hooks/useMarketplace';

const SIDECAR = 'http://127.0.0.1:8765';

type FieldValue = string | number | boolean;
type FormValues = Record<string, FieldValue>;

// ── Props ──────────────────────────────────────────────────────────────────────

interface PluginSettingsDrawerProps {
  plugin: InstalledPlugin | null;
  open: boolean;
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function PluginSettingsDrawer({ plugin, open, onClose }: PluginSettingsDrawerProps) {
  const [values, setValues]             = useState<FormValues>({});
  const [errors, setErrors]             = useState<Record<string, string>>({});
  const [saving, setSaving]             = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [resetOpen, setResetOpen]       = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<PluginAction | null>(null);

  // ── Load saved config when the drawer opens ──────────────────────────────────
  useEffect(() => {
    if (!plugin || !open) return;
    setErrors({});
    setShowPasswords({});

    const load = async () => {
      let saved: Record<string, FieldValue> = {};
      try {
        const r = await fetch(`${SIDECAR}/plugins/${plugin.id}/config`);
        if (r.ok) saved = (await r.json()).config ?? {};
      } catch { /* sidecar offline — fall through to defaults */ }

      const initial: FormValues = {};
      for (const f of plugin.config_fields) {
        if (saved[f.key] !== undefined) {
          initial[f.key] = saved[f.key];
        } else if (f.default !== undefined) {
          initial[f.key] = f.default;
        } else {
          initial[f.key] = f.type === 'toggle' ? false : '';
        }
      }
      setValues(initial);
    };

    load();
  }, [plugin, open]);

  // ── show_if helper — returns true when a field should be visible ─────────────
  const isVisible = (f: { show_if?: { key: string; value: string } }): boolean => {
    if (!f.show_if) return true;
    return String(values[f.show_if.key] ?? '') === f.show_if.value;
  };

  // ── Validation ────────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    if (!plugin) return true;
    const errs: Record<string, string> = {};
    for (const f of plugin.config_fields) {
      // Skip fields hidden by show_if — they're irrelevant for the active config
      if (!isVisible(f)) continue;
      // Required = no default defined and type is not toggle
      if (f.default === undefined && f.type !== 'toggle') {
        const val = values[f.key];
        if (val === '' || val === undefined || val === null) {
          errs[f.key] = 'This field is required';
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!plugin || !validate()) return;
    setSaving(true);
    try {
      const r = await fetch(`${SIDECAR}/plugins/${plugin.id}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: values }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success(`'${plugin.name}' settings saved`);
      onClose();
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const handleReset = async () => {
    if (!plugin) return;
    try {
      await fetch(`${SIDECAR}/plugins/${plugin.id}/config/reset`, { method: 'POST' });
      // Re-apply defaults immediately
      const initial: FormValues = {};
      for (const f of plugin.config_fields) {
        initial[f.key] = f.default !== undefined ? f.default : (f.type === 'toggle' ? false : '');
      }
      setValues(initial);
      setErrors({});
      setResetOpen(false);
      toast.success('Settings reset to defaults');
    } catch {
      toast.error('Failed to reset settings');
    }
  };

  // ── Action runner ─────────────────────────────────────────────────────────────
  const runAction = async (action: PluginAction) => {
    setActionLoading((prev) => ({ ...prev, [action.id]: true }));
    try {
      const r = await fetch(`${SIDECAR}${action.endpoint}`, { method: action.method });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success(`${action.label} — done`);
    } catch {
      toast.error(`${action.label} failed`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [action.id]: false }));
      setConfirmAction(null);
    }
  };

  // ── Field change helper ───────────────────────────────────────────────────────
  const setField = (key: string, val: FieldValue) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  if (!plugin) return null;

  return (
    <>
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-[360px] flex-col p-0 gap-0">

        {/* Header */}
        <SheetHeader className="border-b border-border/50 px-5 py-4 pr-12">
          <SheetTitle>{plugin.name} Settings</SheetTitle>
          <SheetDescription>v{plugin.version} by {plugin.author}</SheetDescription>
        </SheetHeader>

        {/* Fields — scrollable */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {plugin.config_fields.map((f) => {
            // Hide fields whose show_if condition is not currently satisfied
            if (!isVisible(f)) return null;
            return (
              <FieldRow
                key={f.key}
                field={f}
                value={values[f.key]}
                error={errors[f.key]}
                showPassword={showPasswords[f.key] ?? false}
                onTogglePassword={() =>
                  setShowPasswords((prev) => ({ ...prev, [f.key]: !prev[f.key] }))
                }
                onChange={(val) => setField(f.key, val)}
              />
            );
          })}

          {/* Actions (e.g. rebuild index, clear cache) */}
          {plugin.actions && plugin.actions.length > 0 && (
            <div className="space-y-2 border-t border-border/40 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </p>
              {plugin.actions.map((action) => (
                <div key={action.id} className="space-y-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-sm"
                    disabled={!!actionLoading[action.id]}
                    onClick={() => {
                      if (action.confirm) {
                        setConfirmAction(action);
                      } else {
                        runAction(action);
                      }
                    }}
                  >
                    {actionLoading[action.id]
                      ? (action.loading_label ?? 'Working…')
                      : action.label}
                  </Button>
                  {action.description && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground pl-0.5">
                      {action.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — sticky */}
        <div className="border-t border-border/50 px-5 py-4 space-y-2.5">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full text-white"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>

          {/* Reset link + confirm dialog */}
          <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
            <AlertDialogTrigger asChild>
              <button className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                Reset to defaults
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset {plugin.name} settings to defaults?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

      </SheetContent>
    </Sheet>

    {/* Confirm dialog for destructive actions */}
    <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmAction?.label}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmAction?.confirm_message ?? 'Are you sure?'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => confirmAction && runAction(confirmAction)}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ── Field renderer ─────────────────────────────────────────────────────────────

interface FieldRowProps {
  field: ConfigField;
  value: FieldValue | undefined;
  error?: string;
  showPassword?: boolean;
  onTogglePassword: () => void;
  onChange: (val: FieldValue) => void;
}

function FieldRow({ field, value, error, showPassword, onTogglePassword, onChange }: FieldRowProps) {
  const strVal = value === undefined || value === null ? '' : String(value);

  return (
    <div className="space-y-1.5">
      {/* Label — inline for toggle, above for everything else */}
      {field.type !== 'toggle' && (
        <p className="text-[13px] font-medium leading-none">{field.label}</p>
      )}

      {/* ── text ─────────────────────────────────────────────────────── */}
      {field.type === 'text' && (
        <Input
          type="text"
          value={strVal}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(error && 'border-destructive focus-visible:ring-destructive')}
        />
      )}

      {/* ── password ─────────────────────────────────────────────────── */}
      {field.type === 'password' && (
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            value={strVal}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={cn('pr-9', error && 'border-destructive focus-visible:ring-destructive')}
          />
          <button
            type="button"
            onClick={onTogglePassword}
            tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            {showPassword
              ? <EyeOff className="h-4 w-4" />
              : <Eye className="h-4 w-4" />}
          </button>
        </div>
      )}

      {/* ── number ───────────────────────────────────────────────────── */}
      {field.type === 'number' && (
        <Input
          type="number"
          value={strVal}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={cn(error && 'border-destructive focus-visible:ring-destructive')}
        />
      )}

      {/* ── toggle ───────────────────────────────────────────────────── */}
      {field.type === 'toggle' && (
        <div className="flex items-center gap-2.5">
          <Switch
            checked={!!value}
            onCheckedChange={(checked) => onChange(checked)}
          />
          <p className="text-[13px] font-medium leading-none">{field.label}</p>
        </div>
      )}

      {/* ── select ───────────────────────────────────────────────────── */}
      {field.type === 'select' && field.options && (
        <Select value={strVal || undefined} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className={cn(error && 'border-destructive focus:ring-destructive')}>
            <SelectValue placeholder={field.placeholder ?? 'Select an option…'} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Help text */}
      {field.help && !error && (
        <p className="text-xs leading-relaxed text-muted-foreground">{field.help}</p>
      )}
    </div>
  );
}
