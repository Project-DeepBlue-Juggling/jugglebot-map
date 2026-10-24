import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEventStream } from './eventStream';
import { qk } from './queryKeys';

let listeners: Record<string, () => void> = {};
const Original = (globalThis as unknown as { EventSource: unknown }).EventSource;

beforeEach(() => {
  listeners = {};
  class FakeEventSource {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
    addEventListener(name: string, fn: () => void) {
      listeners[name] = fn;
    }
    close() {}
  }
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
});
afterEach(() => {
  (globalThis as unknown as { EventSource: unknown }).EventSource = Original;
});

describe('useEventStream', () => {
  it('an invalidate event refetches the project, tasks and dependencies', async () => {
    const qc = new QueryClient();
    const fetches = { project: vi.fn(() => 1), tasks: vi.fn(() => 1), deps: vi.fn(() => 1) };
    // Active observers are what invalidation refetches.
    for (const [queryKey, queryFn] of [
      [qk.project('p'), fetches.project],
      [qk.tasks.list('p'), fetches.tasks],
      [qk.dependencies('p'), fetches.deps],
    ] as const) {
      new QueryObserver(qc, { queryKey, queryFn }).subscribe(() => {});
    }
    await vi.waitFor(() => expect(qc.isFetching()).toBe(0));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useEventStream(), { wrapper });
    expect(listeners['invalidate']).toBeTypeOf('function');
    listeners['invalidate']?.();
    await vi.waitFor(() => {
      expect(fetches.project).toHaveBeenCalledTimes(2);
      expect(fetches.tasks).toHaveBeenCalledTimes(2);
      expect(fetches.deps).toHaveBeenCalledTimes(2);
    });
  });
});
