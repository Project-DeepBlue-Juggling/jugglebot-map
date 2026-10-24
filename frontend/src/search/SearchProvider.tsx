import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTasks } from '../api/hooks';
import { searchTasks } from './searchMatch';
import { SearchCtx, type FocusRequest, type SearchValue } from './searchContextValue';

/**
 * Project-scoped global search state (ADR 0044). Mounted in
 * `ActiveProjectShell` so it sits above all four view routes and resets on
 * project switch (the shell remounts). Derives the match set from the loaded
 * task list and brokers focus requests from the toolbar to whichever view is
 * currently mounted.
 */
export function SearchProvider({ children }: { children: ReactNode }) {
  const { data: tasks } = useTasks();
  const [query, setQuery] = useState('');
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  // Monotonic counter so re-requesting the same task still fires the effect.
  const nonce = useRef(0);

  const matched = useMemo(() => searchTasks(tasks ?? [], query), [tasks, query]);
  const matchIds = useMemo(() => new Set(matched.map((t) => t.id)), [matched]);

  const requestFocus = useCallback((taskId: string) => {
    nonce.current += 1;
    setFocusRequest({ taskId, nonce: nonce.current });
  }, []);
  const clear = useCallback(() => setQuery(''), []);

  const value = useMemo<SearchValue>(
    () => ({
      query,
      setQuery,
      clear,
      matchIds,
      matchCount: matched.length,
      focusRequest,
      requestFocus,
    }),
    [query, clear, matchIds, matched.length, focusRequest, requestFocus],
  );

  return <SearchCtx.Provider value={value}>{children}</SearchCtx.Provider>;
}
