import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { AuthProvider } from '../auth/AuthContext';
import { StaticAuthClient } from '../auth/StaticAuthClient';
import { createState, makeServer } from '../test/server';

const server = makeServer(createState());
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
import { HealthBanner } from './HealthBanner';

function health(
  level: 'error' | 'warning' | null,
  message: string,
  errors: { path: string; message: string }[],
) {
  server.use(
    http.get('http://localhost:8000/api/v1/health', () =>
      HttpResponse.json({
        status: errors.length > 0 || level !== null ? 'degraded' : 'ok',
        errors,
        banner: { level, message, since: null },
      }),
    ),
  );
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthProvider client={new StaticAuthClient()}>
      <QueryClientProvider client={qc}>
        <ApiProvider>
          <HealthBanner />
        </ApiProvider>
      </QueryClientProvider>
    </AuthProvider>,
  );
}

describe('HealthBanner', () => {
  it('shows nothing when all clear', async () => {
    health(null, '', []);
    const { container } = mount();
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a red bar for an error banner', async () => {
    health('error', 'git is broken', []);
    mount();
    const bar = await screen.findByTestId('health-banner');
    expect(bar).toHaveTextContent('git is broken');
    expect(bar.className).toContain('bg-red-600');
  });

  it('shows an amber bar for a warning banner', async () => {
    health('warning', 'working tree is dirty', []);
    mount();
    const bar = await screen.findByTestId('health-banner');
    expect(bar).toHaveTextContent('working tree is dirty');
    expect(bar.className).toContain('bg-amber-400');
  });

  it('lists the parse failures on click', async () => {
    health(null, '', [{ path: 'map/bug-x.md', message: 'bad frontmatter' }]);
    mount();
    const btn = await screen.findByRole('button', { name: /1 file\(s\) failed to parse/ });
    expect(screen.queryByText(/map\/bug-x.md/)).toBeNull();
    await userEvent.click(btn);
    expect(screen.getByText(/map\/bug-x.md: bad frontmatter/)).toBeInTheDocument();
  });
});
