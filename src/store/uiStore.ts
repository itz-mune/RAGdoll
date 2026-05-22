import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIStore {
  // Sidebar
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  // Chat area
  contextPanelOpen: boolean;

  setSidebarCollapsed: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setContextPanelOpen: (v: boolean) => void;
}

export const uiStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarWidth: 240,
      contextPanelOpen: false,

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      setContextPanelOpen: (v) => set({ contextPanelOpen: v }),
    }),
    { name: 'ragdoll-ui' },
  ),
);
