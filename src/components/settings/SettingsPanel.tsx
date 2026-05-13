import { useState, useEffect } from 'react';
import BorderGlow from './BorderGlow';
import { Eye, EyeOff, Check, Loader2 } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import { type Provider, getHuggingFaceModel, setHuggingFaceModel, getOpenRouterModel, setOpenRouterModel } from '../../lib/store';









const CLOUD_PROVIDERS: { id: Provider; name: string; placeholder: string; description: string; badge?: string }[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    placeholder: 'sk-...',
    description: 'GPT-4, GPT-3.5, and more',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    placeholder: 'sk-ant-...',
    description: 'Claude 3 and earlier models',
  },
  {
    id: 'groq',
    name: 'Groq',
    placeholder: 'gsk_...',
    description: 'Fast LLM inference',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    placeholder: 'AIza...',
    description: 'Gemini Pro and latest models',
    badge: 'Free tier available',
  },
];

const EXTENDED_PROVIDERS: { id: Provider; name: string; placeholder: string; description: string; badge?: string }[] = [
  {
    id: 'huggingface',
    name: 'HuggingFace',
    placeholder: 'hf_...',
    description: 'Thousands of open-source models via Inference API',
    badge: 'Free tier available',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    placeholder: 'sk-or-...',
    description: 'One key for 200+ models including GPT-4 and Claude',
    badge: 'Free models available',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    placeholder: 'http://localhost:11434',
    description: 'Run models locally on your machine',
  },
];

const HUGGINGFACE_MODELS = [
  'mistralai/Mistral-7B-Instruct-v0.3',
  'meta-llama/Llama-3.2-3B-Instruct',
  'microsoft/Phi-3.5-mini-instruct',
];

const OPENROUTER_MODELS = [
  { id: 'openai/gpt-4o', label: 'OpenAI GPT-4o', free: false },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', free: false },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B', free: true },
  { id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5', free: false },
  { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B', free: true },
];

interface SettingsPanelProps {
  onSave?: () => void;
}

export function SettingsPanel({ onSave }: SettingsPanelProps) {
  const { provider, hasKey, validationLoading, validateAndSaveSettings, clearSettings } =
    useSettings();
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(provider);
  const [apiKey, setApiKey] = useState('');
  const [huggingfaceModel, setHuggingfaceModel] = useState('');
  const [openrouterModel, setOpenrouterModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved models on mount
  useEffect(() => {
    const loadModels = async () => {
      const hfModel = await getHuggingFaceModel();
      const orModel = await getOpenRouterModel();
      if (hfModel) setHuggingfaceModel(hfModel);
      if (orModel) setOpenrouterModel(orModel);
    };
    loadModels();
  }, []);

  const handleSave = async () => {
    if (!selectedProvider || !apiKey) {
      setError('Please select a provider and enter an API key');
      return;
    }

    // Validate model selection for providers that require it
    if (selectedProvider === 'huggingface' && !huggingfaceModel) {
      setError('Please select or enter a HuggingFace model');
      return;
    }
    if (selectedProvider === 'openrouter' && !openrouterModel) {
      setError('Please select or enter an OpenRouter model');
      return;
    }

    setError(null);
    const model = selectedProvider === 'huggingface' ? huggingfaceModel : selectedProvider === 'openrouter' ? openrouterModel : undefined;
    const result = await validateAndSaveSettings(selectedProvider, apiKey, model);

    if (result.valid) {
      // Save model selections
      if (selectedProvider === 'huggingface') {
        await setHuggingFaceModel(huggingfaceModel);
      }
      if (selectedProvider === 'openrouter') {
        await setOpenRouterModel(openrouterModel);
      }

      setShowSuccess(true);
      setApiKey('');
      setTimeout(() => setShowSuccess(false), 3000);
      onSave?.();
    } else {
      setError(result.error || 'Invalid API key');
    }
  };

  const handleClear = async () => {
    if (confirm("Are you sure? You'll need to reconfigure your API key.")) {
      await clearSettings();
      setSelectedProvider(null);
      setApiKey('');
      setHuggingfaceModel('');
      setOpenrouterModel('');
      setError(null);
    }
  };

  const ProviderButton = ({ prov }: { prov: (typeof CLOUD_PROVIDERS)[0] | (typeof EXTENDED_PROVIDERS)[0] }) => (
    <button
      key={prov.id}
      onClick={() => setSelectedProvider(prov.id)}
      className={`flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-all ${selectedProvider === prov.id
        ? 'border-primary bg-primary/15'
        : 'border-muted bg-muted/60 hover:border-muted-foreground/40'
        }`}
    >
      <div className={`mt-1 h-5 w-5 rounded-full border-2 flex-shrink-0 transition-all ${selectedProvider === prov.id
        ? 'border-primary bg-primary'
        : 'border-muted-foreground/30'
        }`}>
        {selectedProvider === prov.id && (
          <div className="h-full w-full flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-primary-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground">{prov.name}</p>
          {'badge' in prov && prov.badge && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700">{prov.badge}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{prov.description}</p>
      </div>
    </button>
  );

  return (
    <BorderGlow
      edgeSensitivity={41}
      glowColor="40 80 80"
      backgroundColor="#0b0a0c"
      borderRadius={28}
      glowRadius={49}
      glowIntensity={1.5}
      coneSpread={26}
      animated={false}
      colors={['#c084fc', '#f472b6', '#38bdf8']}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-6 rounded-xl bg-background/70 backdrop-blur-md p-6 border border-muted/30">
        {/* Provider Selection */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-foreground">Provider</label>

          {/* Cloud Providers Row */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Cloud</p>
            <div className="grid gap-2">
              {CLOUD_PROVIDERS.map((prov) => (
                <ProviderButton key={prov.id} prov={prov} />
              ))}
            </div>
          </div>

          {/* Extended Providers Row */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">More providers</p>
            <div className="grid gap-2">
              {EXTENDED_PROVIDERS.map((prov) => (
                <ProviderButton key={prov.id} prov={prov} />
              ))}
            </div>
          </div>
        </div>

        {/* API Key Input */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError(null);
              }}
              placeholder={
                selectedProvider
                  ? [...CLOUD_PROVIDERS, ...EXTENDED_PROVIDERS].find((p) => p.id === selectedProvider)?.placeholder
                  : 'Select a provider first'
              }
              disabled={!selectedProvider}
              className={`w-full rounded-lg border-2 border-muted bg-muted/60 px-3 py-2 pr-10 text-sm placeholder-muted-foreground/70 transition-colors ${!selectedProvider ? 'cursor-not-allowed opacity-50' : 'focus:border-primary focus:outline-none'
                }`}
            />
            {selectedProvider && (
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Your key is stored locally on this device only.</p>
        </div>

        {/* HuggingFace Model Selection */}
        {selectedProvider === 'huggingface' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Model ID</label>
            <input
              type="text"
              value={huggingfaceModel}
              onChange={(e) => setHuggingfaceModel(e.target.value)}
              placeholder="mistralai/Mistral-7B-Instruct-v0.3"
              className="w-full rounded-lg border-2 border-muted bg-muted/60 px-3 py-2 text-sm placeholder-muted-foreground/70 focus:border-primary focus:outline-none"
            />
            <p className="text-xs text-muted-foreground">Enter any model ID from huggingface.co/models</p>
            <div className="flex flex-wrap gap-2 pt-2">
              {HUGGINGFACE_MODELS.map((model) => (
                <button
                  key={model}
                  onClick={() => setHuggingfaceModel(model)}
                  className="text-xs px-2 py-1 rounded bg-muted/60 hover:bg-muted/80 text-foreground transition-colors"
                >
                  {model}
                </button>
              ))}
            </div>
            <a
              href="https://huggingface.co/models?pipeline_tag=text-generation"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline block pt-1"
            >
              Browse models →
            </a>
          </div>
        )}

        {/* OpenRouter Model Selection */}
        {selectedProvider === 'openrouter' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Model</label>
            <input
              type="text"
              value={openrouterModel}
              onChange={(e) => setOpenrouterModel(e.target.value)}
              placeholder="openai/gpt-4o"
              className="w-full rounded-lg border-2 border-muted bg-muted/60 px-3 py-2 text-sm placeholder-muted-foreground/70 focus:border-primary focus:outline-none"
            />
            <p className="text-xs text-muted-foreground">Enter any model slug from openrouter.ai/models</p>
            <div className="flex flex-wrap gap-2 pt-2">
              {OPENROUTER_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setOpenrouterModel(model.id)}
                  className="text-xs px-2 py-1 rounded bg-muted/60 hover:bg-muted/80 text-foreground transition-colors flex items-center gap-1"
                >
                  {model.label}
                  {model.free && <span className="text-green-600 font-medium">free</span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground pt-2">Models tagged :free have no cost but may have rate limits</p>
            <a
              href="https://openrouter.ai/models"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline block pt-1"
            >
              Browse models →
            </a>
          </div>
        )}

        {/* Error Message */}
        {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        {/* Success Message */}
        {showSuccess && (
          <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-sm text-green-600">
            <Check size={16} />
            <span>API key saved successfully!</span>
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={!selectedProvider || !apiKey || validationLoading || showSuccess}
          className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {validationLoading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Validating...
            </div>
          ) : (
            'Save API Key'
          )}
        </button>

        {/* Danger Zone */}
        {hasKey && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground">Danger Zone</p>
            <button
              onClick={handleClear}
              className="w-full rounded-lg border-2 border-destructive px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              Clear Saved API Key
            </button>
          </div>
        )}
      </div>
    </BorderGlow>
  );
}
