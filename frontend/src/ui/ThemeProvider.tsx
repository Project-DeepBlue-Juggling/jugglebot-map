import { useEffect, type ReactNode } from 'react';
import { useUsers } from '../api/hooks';
import { useAuth } from '../auth/useAuth';

/**
 * Apply the current user's `dark_mode` preference to `<html>` (ADR 0017).
 *
 * Tailwind is configured for class-based dark mode (`darkMode: 'class'` in
 * `tailwind.config.js`); every dark-aware utility activates when the
 * `dark` class is present on `document.documentElement`.
 *
 * Three modes:
 *   - 'light'  : remove the `dark` class.
 *   - 'dark'   : add the `dark` class.
 *   - 'system' : follow `prefers-color-scheme: dark` and listen for OS
 *                changes for the lifetime of the session.
 *
 * The provider is mounted *inside* the QueryClientProvider so it can read
 * `useUsers()`. Until the user list loads (typically <100 ms after sign-in),
 * the inline placeholder script in [index.html](../../index.html) keeps
 * the page consistent with the OS preference. Once the user record arrives
 * the provider takes over.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: users } = useUsers();
  const currentUser = users?.find((u) => u.id === user?.id);
  const mode = currentUser?.dark_mode ?? null;

  useEffect(() => {
    const root = document.documentElement;
    if (mode === null) {
      // No persisted preference yet (initial load). Let the FOUC placeholder
      // script's class stand until the first useUsers resolves.
      return;
    }
    if (mode === 'light') {
      root.classList.remove('dark');
      return;
    }
    if (mode === 'dark') {
      root.classList.add('dark');
      return;
    }
    // mode === 'system' — follow the OS, including live changes.
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (matches: boolean) => {
      if (matches) root.classList.add('dark');
      else root.classList.remove('dark');
    };
    apply(mql.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  return <>{children}</>;
}
