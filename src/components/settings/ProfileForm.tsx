/**
 * Reusable create/edit profile form.
 * Used in FirstRunSetup and ModelProfilesSection drawer.
 */
import { useState } from 'react';
import { Eye, EyeOff, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { profileStore } from '@/store/profileStore';
import type { ModelProfile } from '@/types/profile';
import type { Provider } from '@/lib/store';

const SIDECAR_URL = 'http://127.0.0.1:8765';

const PROVIDERS: { id: Provider; name: string; placeholder: string; description: string }[] = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...', description: 'GPT-4o, GPT-4 and more' },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...', description: 'Claude 3.5 Sonnet and earlier' },
  { id: 'groq', name: 'Groq', placeholder: 'gsk_...', description: 'Fast LLM inference' },
  { id: 'google', name: 'Google Gemini', placeholder: 'AIza...', description: 'Gemini 2.0 Flash and Pro' },
  { id: 'huggingface', name: 'HuggingFace', placeholder: 'hf_...', description: 'Thousands of open-source models' },
  { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-...', description: '200+ models via one key' },
  { id: 'ollama', name: 'Ollama (local)', placeholder: 'http://localhost:11434', description: 'Run models locally — no key needed' },
];

const DEFAULT_MODELS: Record<Provider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  groq: 'llama-3.3-70b-versatile',
  google: 'gemini-2.0-flash',
  huggingface: 'mistralai/Mistral-7B-Instruct-v0.3',
  openrouter: 'openai/gpt-4o',
  ollama: 'mistral',
};

interface ProfileFormProps {
  /** If editing, pass the existing profile (API key field starts empty/placeholder) */
  existing?: ModelProfile;
  onSaved: (profileId: string) => void;
  onCancel?: () => void;
  submitLabel?: string;
  /** If true, makes this the default profile after saving */
  makeDefault?: boolean;
}

export function ProfileForm({ existing, onSaved, onCancel, submitLabel = 'Save Profile', makeDefault }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  const [provider, setProvider] = useState<Provider | null>(existing?.provider ?? null);
  const [modelName, setModelName] = useState(existing?.modelName ?? '');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<'idle' | 'validating' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const isEditing = !!existing;
  const needsKey = provider !== 'ollama';

  const handleProviderSelect = (p: Provider) => {
    setProvider(p);
    if (!modelName || Object.values(DEFAULT_MODELS).includes(modelName)) {
      setModelName(DEFAULT_MODELS[p]);
    }
    setStatus('idle');
  };

  const handleSave = async () => {
    if (!displayName.trim()) { setErrMsg('Display name is required'); setStatus('err'); return; }
    if (!provider) { setErrMsg('Select a provider'); setStatus('err'); return; }
    if (needsKey && !apiKey && !isEditing) { setErrMsg('API key is required'); setStatus('err'); return; }

    setStatus('validating');
    setErrMsg('');

    // Validate key (skip if editing and key is empty — user didn't change it)
    if (apiKey) {
      try {
        const res = await fetch(`${SIDECAR_URL}/settings/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, api_key: apiKey, model: modelName }),
        });
        const json = (await res.json()) as { valid: boolean; error?: string };
        if (!json.valid) {
          setStatus('err');
          setErrMsg(json.error ?? 'Invalid API key');
          return;
        }
      } catch {
        setStatus('err');
        setErrMsg('Could not reach sidecar to validate key');
        return;
      }
    }

    const data = {
      displayName: displayName.trim(),
      provider,
      modelName: modelName || DEFAULT_MODELS[provider],
      ollamaModel: provider === 'ollama' ? modelName : null,
      isDefault: makeDefault ?? (existing?.isDefault ?? false),
    };

    let profileId: string;
    if (isEditing) {
      await profileStore.getState().updateProfile(existing.id, data, apiKey || undefined);
      profileId = existing.id;
    } else {
      profileId = await profileStore.getState().createProfile(data, apiKey || undefined);
    }

    if (makeDefault || data.isDefault) {
      await profileStore.getState().setDefaultProfile(profileId);
    }

    setStatus('ok');
    setTimeout(() => onSaved(profileId), 500);
  };

  const providerDef = PROVIDERS.find((p) => p.id === provider);

  return (
    <div className="flex flex-col gap-5">
      {/* Display name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 32))}
          placeholder='e.g. "My GPT-4" or "Work Claude"'
          className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm placeholder-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Provider grid */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Provider</label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleProviderSelect(p.id)}
              className={`flex flex-col items-start gap-0.5 rounded-lg border-2 p-2.5 text-left transition-all ${
                provider === p.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border/60 bg-muted/30 hover:border-border hover:bg-muted/60'
              }`}
            >
              <span className="text-xs font-semibold text-foreground">{p.name}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">{p.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Model */}
      {provider && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            {provider === 'ollama' ? 'Ollama base URL' : 'Model'}
          </label>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder={DEFAULT_MODELS[provider]}
            className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm placeholder-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {provider === 'huggingface' && (
            <p className="text-[11px] text-muted-foreground">Any model ID from huggingface.co/models</p>
          )}
        </div>
      )}

      {/* API key */}
      {needsKey && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            API key{isEditing && ' (leave blank to keep existing)'}
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setStatus('idle'); setErrMsg(''); }}
              placeholder={isEditing ? '••••••••' : providerDef?.placeholder ?? 'API key'}
              className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2 pr-9 text-sm placeholder-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">Stored locally on device only — never sent to any server.</p>
        </div>
      )}

      {/* Error */}
      {status === 'err' && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errMsg}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleSave}
          disabled={status === 'validating' || status === 'ok'}
          className="flex-1 gap-2"
        >
          {status === 'validating' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {status === 'ok' && <Check className="h-3.5 w-3.5" />}
          {status === 'ok' ? 'Saved!' : status === 'validating' ? 'Validating…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
