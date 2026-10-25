import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderApp, settleQueries } from '../../test/renderApp';
import { mapTask } from '../../test/mapFixtures';
import { createState, makeServer } from '../../test/server';
import { NowRoute } from './routes';

const URL = 'http://localhost:8000/api/v1/projects/:projectId/tasks/:id/history';
let server: ReturnType<typeof makeServer>;

beforeEach(() => {
  const state = createState();
  state.tasks = [
    mapTask({
      id: 'idea1',
      kind: 'idea',
      title: 'Wobbly idea',
      status: 'inbox',
      description: 'A thought.',
    }),
  ];
  server = makeServer(state);
  server.listen({ onUnhandledRequest: 'error' });
  window.history.replaceState(null, '', '/');
});

afterEach(async () => {
  await settleQueries();
  cleanup();
  server.resetHandlers();
  server.close();
});

async function openHistory() {
  renderApp('/now', <NowRoute />);
  fireEvent.click(await screen.findByRole('button', { name: /Wobbly idea/ }));
  const d = await screen.findByRole('complementary', { name: 'Item drawer' });
  return within(await within(d).findByTestId('history'));
}

describe('drawer History section', () => {
  it('lists documents first (link, mono path, missing tag) then commits with the logbook tag', async () => {
    server.use(
      http.get(URL, () =>
        HttpResponse.json({
          head: 'abc',
          commits: [
            {
              sha: 'abcdef1234567',
              short: 'abcdef1',
              date: '2026-10-20T10:00:00+11:00',
              subject: 'fix the wobble',
              logbook_entry: 'wobble-fix',
            },
            {
              sha: '9999999999999',
              short: '9999999',
              date: '2026-10-01',
              subject: 'file it',
              logbook_entry: null,
            },
          ],
          documents: [
            {
              kind: 'logbook',
              path: 'logbook/wobble-fix.md',
              title: 'Wobble fix',
              exists: true,
              url: 'https://x.test/wobble',
            },
            { kind: 'plan', path: 'plans/active/gone.md', title: 'gone', exists: false, url: null },
          ],
        }),
      ),
    );
    const h = await openHistory();
    const link = await h.findByRole('link', { name: 'Wobble fix' });
    expect(link).toHaveAttribute('href', 'https://x.test/wobble');
    expect(link).toHaveAttribute('target', '_blank');
    const docs = h.getAllByTestId('history-document');
    expect(docs).toHaveLength(2);
    expect(within(docs[1]).getByText('plans/active/gone.md')).toBeInTheDocument();
    expect(within(docs[1]).getByText('missing')).toBeInTheDocument();
    expect(within(docs[0]).queryByText('missing')).toBeNull();
    const commits = h.getAllByTestId('history-commit');
    expect(commits).toHaveLength(2);
    expect(within(commits[0]).getByText('abcdef1')).toBeInTheDocument();
    expect(within(commits[0]).getByText('2026-10-20')).toBeInTheDocument();
    expect(within(commits[0]).getByText('fix the wobble')).toBeInTheDocument();
    expect(within(commits[0]).getByText('wobble-fix')).toBeInTheDocument();
    // documents come before commits in the DOM
    expect(
      docs[1].compareDocumentPosition(commits[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('says so for an item that has not been committed', async () => {
    const h = await openHistory();
    expect(
      await h.findByText('No history yet - this item has not been committed.'),
    ).toBeInTheDocument();
  });

  it('shows a quiet skeleton while loading and one line on error, without breaking the drawer', async () => {
    server.use(http.get(URL, () => HttpResponse.json({ detail: 'boom' }, { status: 500 })));
    const h = await openHistory();
    expect(await h.findByText(/History unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Wobbly idea' })).toBeInTheDocument();
  });
});
