import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_CHECK_MS, SILENCE_MS, useEventStream } from './eventStream';
import { qk } from './queryKeys';

type Listener = (e: { data?: string }) => void;

/** Every EventSource the hook opened, newest last. */
let sources: FakeEventSource[] = [];

class FakeEventSource {
  url: string;
  closed = false;
  listeners: Record<string, Listener[]> = {};
  constructor(url: string) {
    this.url = url;
    sources.push(this);
  }
  addEventListener(name: string, fn: Listener) {
    (this.listeners[name] ??= []).push(fn);
  }
  close() {
    this.closed = true;
  }
  emit(name: string, data = '{}') {
    for (const fn of this.listeners[name] ?? []) fn({ data });
  }
}

const Original = (globalThis as unknown as { EventSource: unknown }).EventSource;
const latest = () => sources[sources.length - 1];
const hello = (build: string | null) => JSON.stringify({ build });

beforeEach(() => {
  sources = [];
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
});
afterEach(() => {
  (globalThis as unknown as { EventSource: unknown }).EventSource = Original;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** setupTests.ts pins Date with a Date-only fake; vitest wants it reset before the full fake. */
function fakeTimers() {
  vi.useRealTimers();
  vi.useFakeTimers();
}

/** A client with active observers on the three map queries, counting their fetches. */
async function client() {
  const qc = new QueryClient();
  const fetches = { project: vi.fn(() => 1), tasks: vi.fn(() => 1), deps: vi.fn(() => 1) };
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
  return { qc, fetches, wrapper };
}

describe('useEventStream', () => {
  it('an invalidate event refetches the project, tasks and dependencies', async () => {
    const { fetches, wrapper } = await client();
    renderHook(() => useEventStream(), { wrapper });
    latest().emit('invalidate');
    await vi.waitFor(() => {
      expect(fetches.project).toHaveBeenCalledTimes(2);
      expect(fetches.tasks).toHaveBeenCalledTimes(2);
      expect(fetches.deps).toHaveBeenCalledTimes(2);
    });
  });

  it('refetches on every hello, so a change announced while disconnected is not lost', async () => {
    // The 2026-10-27 report: a page open across the morning's pulls showed none of them
    // until a manual refresh; the browser reconnects by itself but nothing refetched.
    const { fetches, wrapper } = await client();
    renderHook(() => useEventStream(), { wrapper });
    latest().emit('hello', hello('b1'));
    await vi.waitFor(() => expect(fetches.tasks).toHaveBeenCalledTimes(2));
    latest().emit('hello', hello('b1')); // the browser's own reconnect
    await vi.waitFor(() => expect(fetches.tasks).toHaveBeenCalledTimes(3));
  });

  it('reopens a connection that went silent for three heartbeats', async () => {
    const { wrapper } = await client();
    fakeTimers();
    renderHook(() => useEventStream(), { wrapper });
    expect(sources).toHaveLength(1);
    act(() => vi.advanceTimersByTime(SILENCE_MS - 1000));
    latest().emit('ping'); // heard: the silence clock restarts
    act(() => vi.advanceTimersByTime(SILENCE_MS - 1000));
    expect(sources).toHaveLength(1);
    act(() => vi.advanceTimersByTime(2000));
    expect(sources).toHaveLength(2);
    expect(sources[0].closed).toBe(true);
  });

  it('opens a newly deployed build once nothing would be lost, never on the same build', async () => {
    const { wrapper } = await client();
    fakeTimers();
    const reopen = vi.fn();
    renderHook(() => useEventStream(reopen), { wrapper });
    latest().emit('hello', hello('b1'));
    latest().emit('hello', hello('b1'));
    expect(reopen).not.toHaveBeenCalled();
    // An unsaved drawer edit holds the new build back.
    const drawer = document.createElement('div');
    drawer.setAttribute('data-unsaved', 'true');
    document.body.appendChild(drawer);
    latest().emit('hello', hello('b2'));
    act(() => vi.advanceTimersByTime(IDLE_CHECK_MS * 3));
    expect(reopen).not.toHaveBeenCalled();
    // So does a modal (the new-item form).
    drawer.remove();
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    act(() => vi.advanceTimersByTime(IDLE_CHECK_MS * 3));
    expect(reopen).not.toHaveBeenCalled();
    modal.remove();
    act(() => vi.advanceTimersByTime(IDLE_CHECK_MS));
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it('waits while a field is being typed in', async () => {
    const { wrapper } = await client();
    fakeTimers();
    const reopen = vi.fn();
    renderHook(() => useEventStream(reopen), { wrapper });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    latest().emit('hello', hello('b1'));
    latest().emit('hello', hello('b2'));
    act(() => vi.advanceTimersByTime(IDLE_CHECK_MS * 3));
    expect(reopen).not.toHaveBeenCalled();
    input.blur();
    act(() => vi.advanceTimersByTime(IDLE_CHECK_MS));
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it('a server without a built frontend (build null) never triggers a reopen', async () => {
    const { wrapper } = await client();
    const reopen = vi.fn();
    renderHook(() => useEventStream(reopen), { wrapper });
    latest().emit('hello', hello(null));
    latest().emit('hello', hello('b2'));
    expect(reopen).not.toHaveBeenCalled();
  });

  it('a tab coming back into view refetches', async () => {
    const { fetches, wrapper } = await client();
    renderHook(() => useEventStream(), { wrapper });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(fetches.tasks).toHaveBeenCalledTimes(2));
  });
});
