import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { AuthProvider } from '../auth/AuthContext';
import { StaticAuthClient } from '../auth/StaticAuthClient';
import { createState, makeServer } from '../test/server';
import RootRedirect from './RootRedirect';

/** A bare path lands on the one project, keeping its page and its `?item=`. */
let server: ReturnType<typeof makeServer>;

beforeEach(() => {
  server = makeServer(createState());
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.close();
});

function Probe() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname + loc.search}</span>;
}

function mount(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider client={new StaticAuthClient()}>
        <QueryClientProvider client={qc}>
          <ApiProvider>
            <Routes>
              <Route path="/projects/:projectId/*" element={<Probe />} />
              <Route path="/" element={<RootRedirect />} />
              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </ApiProvider>
        </QueryClientProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const loc = () => screen.findByTestId('loc');

describe('RootRedirect', () => {
  it('/now?item=JB-5 keeps the page and the query', async () => {
    mount('/now?item=JB-5');
    await waitFor(async () =>
      expect((await loc()).textContent).toMatch(/^\/projects\/[^/]+\/now\?item=JB-5$/),
    );
  });

  it('/?item=JB-5 keeps the query on the front page', async () => {
    mount('/?item=JB-5');
    await waitFor(async () =>
      expect((await loc()).textContent).toMatch(/^\/projects\/[^/]+\?item=JB-5$/),
    );
  });

  it('an unknown path lands on the front page', async () => {
    mount('/nowhere/at/all?x=1');
    await waitFor(async () =>
      expect((await loc()).textContent).toMatch(/^\/projects\/[^/]+\?x=1$/),
    );
  });
});
