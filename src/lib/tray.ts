/**
 * Frontend wrappers for tray-related Tauri commands and events.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const tray = {
  /** Tell Rust whether the X button should hide to tray (true) or quit (false). */
  setCloseToTray: (value: boolean): Promise<void> =>
    invoke('set_close_to_tray', { value }),

  /** Returns whether the autostart registry entry is currently enabled. */
  getAutostartEnabled: (): Promise<boolean> =>
    invoke<boolean>('get_autostart_enabled'),

  /** Enable or disable launching RAGdoll on system login. */
  setAutostartEnabled: (enabled: boolean): Promise<void> =>
    invoke('set_autostart_enabled', { enabled }),

  /**
   * Sync the active profile display name into the tray menu label.
   * Call this whenever setActiveProfile() succeeds in profileStore.
   */
  updateTrayProfile: (displayName: string): Promise<void> =>
    invoke('update_tray_profile', { displayName }),

  /** Subscribe to "New conversation" clicks in the tray menu. */
  onNewChat: (callback: () => void) =>
    listen<void>('tray:new-chat', callback),

  /** Subscribe to "Quit RAGdoll" clicks in the tray menu. */
  onQuit: (callback: () => void) =>
    listen<void>('tray:quit', callback),
};
