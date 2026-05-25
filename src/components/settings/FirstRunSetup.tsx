import { useState } from 'react';
import { ArrowRight, Check, ExternalLink } from 'lucide-react';
import LineWaves from './LineWaves';
import { ProfileForm } from './ProfileForm';

interface FirstRunSetupProps {
  onComplete?: () => void;
}

type Step = 'welcome' | 'terms' | 'profile' | 'complete';

export function FirstRunSetup({ onComplete }: FirstRunSetupProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [tosAcknowledged, setTosAcknowledged] = useState(false);

  const handleBack = () => {
    if (step === 'terms') setStep('welcome');
    else if (step === 'profile') { setStep('terms'); setTosAcknowledged(false); }
  };

  const handleProfileSaved = () => {
    setStep('complete');
    setTimeout(() => onComplete?.(), 600);
  };

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center bg-background px-4 overflow-hidden">
      {/* Background animation */}
      <div className="absolute inset-0">
        <LineWaves
          speed={0.3}
          innerLineCount={17}
          outerLineCount={28}
          warpIntensity={0.5}
          rotation={-45}
          edgeFadeWidth={0}
          colorCycleSpeed={1}
          brightness={0.2}
          color1="#0ef022"
          color2="#fb000a"
          color3="#20e6f2"
          enableMouseInteraction
          mouseInfluence={1.8}
        />
      </div>

      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-8 text-center">

        {/* ── Welcome ── */}
        {step === 'welcome' && (
          <div className="space-y-8 py-8">
            <div className="space-y-6">
              {/* Logo */}
              <div className="mx-auto flex items-center justify-center">
                <img
                  src="/main_logo_white.svg"
                  alt="RAGdoll"
                  className="h-28 w-28 drop-shadow-[0_0_24px_rgba(255,255,255,0.18)]"
                  draggable={false}
                />
              </div>
              <div className="space-y-3">
                <h1 className="text-5xl font-bold tracking-tight text-foreground">RAGdoll</h1>
                <p className="text-xl font-semibold text-primary">Your Private, Local-First RAG Intelligence</p>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                  Transform your documents into intelligent insights. No data leaves your device. No subscriptions required.
                </p>
              </div>
            </div>
            <button
              onClick={() => setStep('terms')}
              className="mx-auto flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-all hover:bg-primary/90"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Terms ── */}
        {step === 'terms' && (
          <div className="space-y-6 py-8 text-left">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">Terms & Conditions</h2>
              <a
                href="https://github.com/ragdoll-app/ragdoll"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="h-5 w-5" />
              </a>
            </div>

            <div className="max-h-[45vh] space-y-4 overflow-y-auto rounded-lg border border-muted/50 bg-muted/60 p-6 backdrop-blur-sm">
              {[
                ['1. Open Source & Freedom', 'RAGdoll is released under an open-source license and is developed collaboratively by the community. You can view, modify, and redistribute the source code under the terms of the license.'],
                ['2. Local-First Data Storage', 'RAGdoll operates on a strict local-first principle. All documents, data, API keys, and processed information are stored exclusively on your device. No data is transmitted to external servers or cloud platforms.'],
                ['3. Third-Party LLM Providers', 'When you configure an LLM provider and send messages, your queries are transmitted to that provider\'s infrastructure. Use of those services is governed by each provider\'s own Terms of Service. RAGdoll is not responsible for third-party data handling.'],
                ['4. No Warranty', 'RAGdoll is provided "as-is" without any warranties, express or implied. The developers make no guarantees regarding accuracy, reliability, or safety of the application or its outputs.'],
                ['5. Use at Your Own Risk', 'You assume all risks associated with using RAGdoll, including data loss, security vulnerabilities, or misuse of LLM-generated content. You are responsible for protecting your API keys and device.'],
              ].map(([title, body]) => (
                <div key={title} className="space-y-1.5">
                  <h3 className="font-semibold text-foreground">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground/90">{body}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/20 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={tosAcknowledged}
                  onChange={(e) => setTosAcknowledged(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-amber-500"
                />
                <span className="text-sm leading-relaxed text-muted-foreground/90">
                  I have read and understood the Terms & Conditions. I acknowledge that RAGdoll is provided as-is without warranty and I assume all associated risks.
                </span>
              </label>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={handleBack}
                className="rounded-lg border-2 border-muted px-5 py-2 font-medium text-foreground hover:bg-muted/20 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => tosAcknowledged && setStep('profile')}
                disabled={!tosAcknowledged}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              >
                I Agree & Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Create first profile ── */}
        {step === 'profile' && (
          <div className="space-y-6 py-8 text-left">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">Create your first profile</h2>
              <p className="text-sm text-muted-foreground">
                A profile stores your provider, model, and API key — you can create more later.
              </p>
            </div>

            <div className="rounded-xl border border-border/40 bg-background/80 p-6 backdrop-blur-sm">
              <ProfileForm
                onSaved={handleProfileSaved}
                onCancel={handleBack}
                submitLabel="Create profile & start"
                makeDefault
              />
            </div>
          </div>
        )}

        {/* ── Complete ── */}
        {step === 'complete' && (
          <div className="space-y-6 py-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-foreground">All Set!</h2>
            <p className="text-sm text-muted-foreground">Preparing your workspace…</p>
          </div>
        )}
      </div>
    </div>
  );
}
