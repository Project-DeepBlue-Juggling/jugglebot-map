import { useContext, useEffect, useRef } from 'react';
import { SearchCtx, type SearchValue } from './searchContextValue';

/** Read the global search context (ADR 0044). Throws outside a SearchProvider. */
export function useSearch(): SearchValue {
  const ctx = useContext(SearchCtx);
  if (ctx === null) {
    throw new Error('useSearch must be used inside a SearchProvider');
  }
  return ctx;
}

/**
 * Run `handler` once each time the search toolbar requests focus on a task
 * (ADR 0044). Views use it to reveal the task (expand/scroll/pan) and open
 * their detail panel. The handler is kept in a ref so a view can pass an
 * inline closure without re-subscribing — the effect fires on the request's
 * nonce, not on handler identity.
 */
export function useFocusRequest(handler: (taskId: string) => void): void {
  const { focusRequest } = useSearch();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const lastNonce = useRef(0);
  useEffect(() => {
    if (focusRequest !== null && focusRequest.nonce !== lastNonce.current) {
      lastNonce.current = focusRequest.nonce;
      handlerRef.current(focusRequest.taskId);
    }
  }, [focusRequest]);
}
