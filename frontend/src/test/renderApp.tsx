import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ApiProvider } from '../api/ApiContext';
import { AuthProvider } from '../auth/AuthContext';
import { StaticAuthClient } from '../auth/StaticAuthClient';
import AppLayout from '../layout/AppLayout';
import ActiveProjectShell from '../projects/ActiveProjectShell';
import { ToastProvider } from '../ui/ToastProvider';

/**
 * Test-harness mount that mirrors the App router's structure.
 *
 * `routeElement` is mounted at the final route, under the
 * `ActiveProjectShell`, so components below it get the project context
 * and the providers for free. Bare paths (`/`, `/list`, ...) are rewritten
 * to `/projects/<TEST_PROJECT_ID>/...`.
 *
 * Returns Testing Library's result plus the `queryClient` it built, so a
 * test can reach the cache directly.
 */
const TEST_PROJECT_ID = '00000000-0000-0000-0000-0000000000aa';

function normaliseRoute(input: string): string {
  if (input.startsWith('/projects/')) return input;
  return `/projects/${TEST_PROJECT_ID}${input === '/' ? '' : input}`;
}

let lastClient: QueryClient | null = null;

/** The QueryClient of the most recent renderApp (to invalidate from a test). */
export function getLastClient(): QueryClient | null {
  return lastClient;
}

/** Resolve once the most recent renderApp client has no fetch in flight. */
export async function settleQueries(): Promise<void> {
  // One macrotask first: a mutation's onSuccess may not have invalidated yet.
  await new Promise((r) => setTimeout(r, 20));
  while (lastClient !== null && lastClient.isFetching() > 0) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

export function renderApp(initialRoute: string, routeElement: ReactNode) {
  const authClient = new StaticAuthClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 0 } },
  });
  lastClient = queryClient;
  return Object.assign(
    render(
      <MemoryRouter initialEntries={[normaliseRoute(initialRoute)]}>
        <AuthProvider client={authClient}>
          <QueryClientProvider client={queryClient}>
            <ApiProvider>
              <ToastProvider>
                <Routes>
                  <Route element={<AppLayout />}>
                    <Route path="/projects/:projectId" element={<ActiveProjectShell />}>
                      <Route path="*" element={routeElement} />
                      <Route index element={routeElement} />
                    </Route>
                    <Route
                      path="*"
                      element={<Navigate to={`/projects/${TEST_PROJECT_ID}`} replace />}
                    />
                  </Route>
                </Routes>
              </ToastProvider>
            </ApiProvider>
          </QueryClientProvider>
        </AuthProvider>
      </MemoryRouter>,
    ),
    { queryClient },
  );
}
