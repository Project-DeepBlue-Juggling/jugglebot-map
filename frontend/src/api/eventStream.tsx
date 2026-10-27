import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { isShortcutTarget, modalIsOpen } from '../ui/keyboard';

const EVENTS_URL = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/v1/events';

/** Three missed server heartbeats (it pings every 15 s): the connection is dead, reopen it. */
export const SILENCE_MS = 45_000;
/** How often a page holding a new build re-checks whether it may open it. */
export const IDLE_CHECK_MS = 2_000;

/** Nothing would be lost by reopening the page: no form, no field being typed in, no unsaved edit. */
export function pageIsIdle(qc: QueryClient): boolean {
  return (
    !modalIsOpen() &&
    isShortcutTarget() &&
    document.querySelector('[data-unsaved="true"]') === null &&
    qc.isMutating() === 0
  );
}

/** Module-level so the hook's effect does not re-run (and reconnect) on every render. */
const reloadPage = () => window.location.reload();

function buildOf(data: unknown): string | null {
  try {
    const b = (JSON.parse(String(data)) as { build?: unknown }).build;
    return typeof b === 'string' ? b : null;
  } catch {
    return null;
  }
}

/**
 * Keep every open page current with the server's `/events` stream.
 *
 * - `invalidate` refetches everything.
 * - `hello` opens every connection, reconnects included: anything announced while
 *   the page was disconnected (sleep, a network blip, a server restart) was missed,
 *   so it refetches too. A `hello` naming a different build than the first one
 *   means the app was redeployed: the page reopens itself once it is idle (the
 *   drawer survives, it lives in the URL).
 * - No event for `SILENCE_MS` (the server pings every 15 s) means a connection
 *   that died without the browser noticing: close it and open a new one.
 * - A tab coming back into view refetches (a frozen tab may have slept through events).
 */
export function useEventStream(reopenPage: () => void = reloadPage): void {
  const qc = useQueryClient();
  useEffect(() => {
    let source: EventSource | null = null;
    let silence: ReturnType<typeof setTimeout> | undefined;
    let idleCheck: ReturnType<typeof setInterval> | undefined;
    let firstBuild: string | null | undefined; // undefined until the first hello
    const refetch = () => void qc.invalidateQueries();

    const heard = () => {
      clearTimeout(silence);
      silence = setTimeout(connect, SILENCE_MS);
    };
    const newBuild = () => {
      if (idleCheck !== undefined) return;
      const tryReopen = () => {
        if (pageIsIdle(qc)) {
          clearInterval(idleCheck);
          reopenPage();
        }
      };
      idleCheck = setInterval(tryReopen, IDLE_CHECK_MS);
      tryReopen();
    };
    function connect() {
      source?.close();
      source = new EventSource(new URL(EVENTS_URL, window.location.origin).toString());
      source.addEventListener('invalidate', () => {
        heard();
        refetch();
      });
      source.addEventListener('ping', heard);
      source.addEventListener('hello', (e) => {
        heard();
        const build = buildOf((e as MessageEvent).data);
        if (firstBuild === undefined) firstBuild = build;
        else if (build !== null && firstBuild !== null && build !== firstBuild) newBuild();
        refetch();
      });
      heard();
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch();
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(silence);
      clearInterval(idleCheck);
      document.removeEventListener('visibilitychange', onVisible);
      source?.close();
    };
  }, [qc, reopenPage]);
}
