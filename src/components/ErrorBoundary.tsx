import { Component, type ReactNode, useState } from 'react';
import { WrenchIcon, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack });
  }

  reset = () => this.setState({ error: null, componentStack: null });

  render() {
    const { error, componentStack } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return <ErrorFallback error={error} stack={componentStack} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

// ── Fallback UI (function component so we can use hooks) ──────────────────────

function ErrorFallback({
  error,
  stack,
  onReset,
}: {
  error: Error;
  stack: string | null;
  onReset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-background text-foreground p-8">
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
        <WrenchIcon className="h-8 w-8 text-destructive" />
      </div>

      {/* Message */}
      <div className="text-center space-y-1">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          An unexpected error occurred. You can try again, or reload the app if the problem persists.
        </p>
      </div>

      {/* Error summary */}
      <div className="w-full max-w-md rounded-xl border border-border/60 bg-muted/30 p-4">
        <p className="text-sm font-medium text-destructive truncate">{error.message}</p>

        {/* Collapsible stack trace */}
        {stack && (
          <div className="mt-2">
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showDetails ? 'Hide' : 'Show'} details
            </button>
            {showDetails && (
              <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted px-3 py-2 text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {stack}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={onReset} className="gap-2" style={{ background: 'var(--accent)' }}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="gap-2"
        >
          Reload app
        </Button>
      </div>
    </div>
  );
}
