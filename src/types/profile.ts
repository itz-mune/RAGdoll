import type { Provider } from '@/lib/store';

export interface ModelProfile {
  id: string;
  displayName: string;
  provider: Provider;
  modelName: string;
  ollamaModel: string | null;
  createdAt: number;
  isDefault: boolean;
}
