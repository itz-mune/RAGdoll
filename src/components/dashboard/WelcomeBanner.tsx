import { Sparkles, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WelcomeBannerProps {
  profile?: { displayName?: string; provider?: string; modelName?: string } | null;
  onNewChat: () => void;
}

export function WelcomeBanner({ profile, onNewChat }: WelcomeBannerProps) {
  return (
    <div
      className="rounded-2xl border p-6"
      style={{
        borderColor: 'var(--accent-20)',
        background: 'linear-gradient(135deg, var(--accent-10) 0%, var(--accent-10) 40%, transparent 100%)',
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Welcome to RAGdoll</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-lg">
            Your AI assistant is ready. Start your first conversation — RAGdoll remembers context across chats,
            can search the web, read files, and install new skills on demand.
          </p>
          {profile && (
            <p className="mt-2 text-xs text-muted-foreground/70">
              Using <span className="font-medium text-foreground">{profile.displayName}</span>
              {profile.provider && <> · {profile.provider}</>}
              {profile.modelName && <> · {profile.modelName}</>}
            </p>
          )}
          <Button
            onClick={onNewChat}
            className="mt-4 gap-2 border-0 text-white"
            size="sm"
            style={{ background: 'var(--accent)' }}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Start chatting
          </Button>
        </div>
      </div>
    </div>
  );
}
