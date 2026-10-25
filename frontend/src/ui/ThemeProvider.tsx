import { useEffect, type ReactNode } from 'react';
import { useUsers } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import { useGuiPrefs, useGuiPrefsListener } from '../prefs/useGuiPrefs';

/**
 * Apply the current user's `dark_mode` preference to `<html>` (ADR 0017).
 *
 * Tailwind is configured for class-based dark mode (`darkMode: 'class'` in
 * `tailwind.config.js`); every dark-aware utility activates when the
 * `dark` class is present on `document.documentElement`.
 *
 * Dark is the map's default: `'light'` removes the `dark` class, while
 * `'dark'` and the server's untouched default `'system'` (shown as
 * "Default (dark)") add it. The placeholder script in
 * [index.html](../../index.html) sets `dark` before mount, so there is no
 * flash.
 *
 * Precedence: a GUI pref (src/prefs/guiPrefs.ts) beats the user's `dark_mode`
 * while it exists; the user's preference applies only when the app runs
 * standalone. This provider also mounts the GUI-prefs listener (once).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: users } = useUsers();
  const currentUser = users?.find((u) => u.id === user?.id);
  const mode = currentUser?.dark_mode ?? null;
  useGuiPrefsListener();
  const gui = useGuiPrefs();
  const effective = gui !== null ? gui.theme : mode;

  useEffect(() => {
    const root = document.documentElement;
    if (effective === 'light') root.classList.remove('dark');
    else root.classList.add('dark');
  }, [effective]);

  return <>{children}</>;
}
