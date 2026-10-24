import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { SENTINEL } from './test/dateFixtures';

// Frozen test clock (ADR 0033). Every test starts with `new Date()` and
// `Date.now()` pinned to SENTINEL (2026-05-13T12:00:00Z). Components that
// resolve "today" via `const now = useMemo(() => new Date(), [])` therefore
// see a stable instant regardless of when CI runs. Tests that need to
// advance time (e.g. ToastProvider auto-dismiss) layer per-file
// `vi.useFakeTimers({ shouldAdvanceTime: true })` on top — the fake clock
// inherits SENTINEL as its starting point.
beforeEach(() => {
  vi.setSystemTime(SENTINEL);
});

// Vitest's `globals: true` doesn't auto-register testing-library's `cleanup`
// between tests. With `pool: 'forks'` + `singleFork: true` every test shares
// one DOM, so leftover renders from a previous test cause `getByRole`
// queries to match multiple elements and tests fail unpredictably.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Read-only at the type level, but vitest evaluates this before tests load. Cast
// to a writable view so the wire-up matches what the dev build does.
(import.meta.env as Record<string, string>).VITE_API_BASE_URL = 'http://localhost:8000';

// Phase 5.5: the EventStreamProvider opens a real EventSource on mount and
// keeps it open for the life of the project route. Under happy-dom (which
// has a primitive EventSource implementation that polls the URL) and MSW
// (which doesn't speak SSE), this surfaces as a stream of unhandled
// fetch-failure errors that race with test teardown. The live SSE wire is
// exercised in Playwright, not Vitest, so a no-op stub is the right shape
// for unit tests.
class StubEventSource {
  readyState = 0;
  url: string;
  withCredentials = false;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {
    this.readyState = 2;
  }
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
}
// Override even if happy-dom provided one — its impl tries to fetch the URL.
(globalThis as unknown as { EventSource: unknown }).EventSource = StubEventSource;
