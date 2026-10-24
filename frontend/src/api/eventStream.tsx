import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const EVENTS_URL = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/v1/events';

/** Refetch everything on each server `invalidate` event; EventSource reconnects itself. */
export function useEventStream(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const source = new EventSource(new URL(EVENTS_URL, window.location.origin).toString());
    source.addEventListener('invalidate', () => void qc.invalidateQueries());
    return () => source.close();
  }, [qc]);
}
