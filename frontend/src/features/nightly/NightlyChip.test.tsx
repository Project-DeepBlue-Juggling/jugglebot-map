import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderApp, settleQueries } from '../../test/renderApp';
import { createState, makeServer } from '../../test/server';

const BASE = 'http://localhost:8000/api/v1/nightly';
let server: ReturnType<typeof makeServer>;

beforeEach(() => {
  server = makeServer(createState());
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(async () => {
  await settleQueries();
  cleanup();
  server.resetHandlers();
  server.close();
});

const serve = (state: string, over: Record<string, unknown> = {}) =>
  server.use(
    http.get(BASE, () =>
      HttpResponse.json({
        state,
        line: `${state} 10/10 2026-10-25`,
        date: '2026-10-25',
        age_days: 0,
        configured: true,
        ...over,
      }),
    ),
  );

describe('nightly chip', () => {
  it.each([
    ['GREEN', {}, 'nightly green'],
    ['RED', {}, 'nightly RED'],
    ['DEFERRED', {}, 'nightly deferred'],
    ['STALE', { age_days: 4 }, 'nightly stale (4 d)'],
    ['NEVER', {}, 'no nightly'],
  ])('%s shows %s with the status line as tooltip', async (state, over, text) => {
    serve(state, over);
    renderApp('/', <div />);
    const chip = await screen.findByTestId('nightly-chip');
    expect(chip).toHaveTextContent(text);
    expect(chip).toHaveAttribute('title', `${state} 10/10 2026-10-25`);
  });

  it('is hidden when no nightly is configured', async () => {
    serve('NEVER', { configured: false, date: null, age_days: null });
    renderApp('/', <div />);
    await settleQueries();
    expect(screen.queryByTestId('nightly-chip')).toBeNull();
  });

  it('click opens the latest report as Markdown; 404 reads "No report."', async () => {
    serve('RED');
    server.use(
      http.get(
        `${BASE}/latest`,
        () =>
          new HttpResponse('# Nightly\n\nfailed: test_x', {
            headers: { 'content-type': 'text/markdown' },
          }),
      ),
    );
    renderApp('/', <div />);
    fireEvent.click(await screen.findByTestId('nightly-chip'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Nightly' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close nightly report' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    server.use(
      http.get(`${BASE}/latest`, () => HttpResponse.json({ detail: 'none' }, { status: 404 })),
    );
    // the cached report is stale-but-shown; refetch on reopen
    fireEvent.click(screen.getByTestId('nightly-chip'));
    await waitFor(() => expect(screen.getByText('No report.')).toBeInTheDocument());
  });
});
