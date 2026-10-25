import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, BrowserRouter, Routes } from 'react-router-dom';
import { ApiProvider } from './api/ApiContext';
import { AuthProvider } from './auth/AuthContext';
import { StaticAuthClient } from './auth/StaticAuthClient';
import type { AuthClient } from './auth/types';
import AppLayout from './layout/AppLayout';
import { DictionaryRoute, DoneRoute, FrontRoute, NowRoute } from './features/drawer/routes';
import ActiveProjectShell from './projects/ActiveProjectShell';
import RootRedirect from './projects/RootRedirect';
import { ThemeProvider } from './ui/ThemeProvider';
import { ToastProvider } from './ui/ToastProvider';

export interface AppProps {
  /** Tests may inject a client; production uses the static one. */
  authClient?: AuthClient;
}

export default function App({ authClient: injectedAuthClient }: AppProps = {}) {
  const authClient = useMemo(
    () => injectedAuthClient ?? new StaticAuthClient(),
    [injectedAuthClient],
  );
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
    [],
  );

  return (
    <BrowserRouter>
      <AuthProvider client={authClient}>
        <QueryClientProvider client={queryClient}>
          <ApiProvider>
            <ThemeProvider>
              <ToastProvider>
                <Routes>
                  <Route element={<AppLayout />}>
                    <Route path="/projects/:projectId" element={<ActiveProjectShell />}>
                      <Route index element={<FrontRoute />} />
                      <Route path="now" element={<NowRoute />} />
                      <Route path="done" element={<DoneRoute />} />
                      <Route path="dictionary" element={<DictionaryRoute />} />
                    </Route>
                    <Route path="/" element={<RootRedirect />} />
                    {/* A bare page path keeps its page and query (`/now?item=JB-5`). */}
                    <Route path="*" element={<RootRedirect />} />
                  </Route>
                </Routes>
              </ToastProvider>
            </ThemeProvider>
          </ApiProvider>
        </QueryClientProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
