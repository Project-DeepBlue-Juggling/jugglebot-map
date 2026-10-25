import { useEffect, useSyncExternalStore } from 'react';
import { applyZoom, getPrefs, handleMessage, subscribePrefs, type GuiPrefs } from './guiPrefs';

/** The current GUI prefs (null when the app runs standalone). */
export function useGuiPrefs(): GuiPrefs | null {
  return useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);
}

/** Mount once near the root: listens for the GUI's prefs messages and applies the zoom. */
export function useGuiPrefsListener(): void {
  useEffect(() => {
    applyZoom(getPrefs());
    const on = (e: MessageEvent) => {
      handleMessage(e);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
}
