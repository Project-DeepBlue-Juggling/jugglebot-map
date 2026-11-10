import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { NightShiftRoute } from '../../features/drawer/routes';
import { mapTask } from '../../test/mapFixtures';
import { renderApp } from '../../test/renderApp';
import { createState, makeServer, type TestState } from '../../test/server';

const BASE = 'http://localhost:8000/api/v1/night-shift';
let state: TestState;
let server: ReturnType<typeof makeServer>;

const question = {
  id: 'q1',
  short_id: 'TKT-130',
  title: 'Which leg first?',
  body: 'Should the night shift fix leg 3 first?',
  parent_id: 'bug1',
  parent_short_id: 'BUG-12',
  parent_kind: 'bug',
  parent_ticket_type: null,
  parent_title: 'Wobbly leg',
  created_at: '2026-10-30T00:00:00Z',
  updated_at: '2026-10-30T00:00:00Z',
};

beforeEach(() => {
  window.localStorage.clear();
  state = createState();
  state.tasks = [
    mapTask({
      id: 'bug1',
      kind: 'bug',
      title: 'Wobbly leg',
      status: 'inbox',
      short_id: 'BUG-12',
    }),
  ];
  server = makeServer(state);
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.close();
});

describe('Night Shift page', () => {
  it('shows both empty states', async () => {
    renderApp('/night-shift', <NightShiftRoute />);
    expect(await screen.findByText('No reports yet')).toBeInTheDocument();
    expect(screen.getByText('No open questions')).toBeInTheDocument();
    expect(screen.queryByTestId('night-shift-badge')).toBeNull();
  });

  it('lists reports newest first, renders the latest and switches by date', async () => {
    server.use(
      http.get(`${BASE}/reports`, () =>
        HttpResponse.json([
          {
            date: '2026-10-31',
            path: 'docs/night-shift/2026-10-31.md',
            title: 'Night Shift 2026-10-31',
          },
          {
            date: '2026-10-30',
            path: 'docs/night-shift/2026-10-30.md',
            title: 'Night Shift 2026-10-30',
          },
        ]),
      ),
      http.get(`${BASE}/reports/:date`, ({ params }) =>
        HttpResponse.text(`## Summary ${String(params.date)}`, {
          headers: { 'content-type': 'text/markdown' },
        }),
      ),
    );
    renderApp('/night-shift', <NightShiftRoute />);
    const buttons = await screen.findAllByRole('button', { name: /^2026-10-3\d$/ });
    expect(buttons.map((b) => b.textContent)).toEqual(['2026-10-31', '2026-10-30']);
    expect(await screen.findByText('Summary 2026-10-31')).toBeInTheDocument();
    fireEvent.click(buttons[1]);
    expect(await screen.findByText('Summary 2026-10-30')).toBeInTheDocument();
  });

  it('links BUG-<n> in the report to its Item, with the kind pill, and opens it', async () => {
    server.use(
      http.get(`${BASE}/reports`, () =>
        HttpResponse.json([
          { date: '2026-10-31', path: 'docs/night-shift/2026-10-31.md', title: 'NS' },
        ]),
      ),
      http.get(`${BASE}/reports/:date`, () =>
        HttpResponse.text('Held BUG-12 and BUG-99.', {
          headers: { 'content-type': 'text/markdown' },
        }),
      ),
    );
    renderApp('/night-shift', <NightShiftRoute />);
    const link = await screen.findByRole('button', { name: 'BUG-12' });
    const report = screen.getByTestId('night-shift-report');
    expect(within(report).getByTestId('kind-pill')).toHaveTextContent('Bug');
    expect(within(report).getAllByTestId('kind-pill')).toHaveLength(1); // BUG-99 is unknown
    expect(link).toBeInTheDocument();
  });

  it('shows the nav badge count when questions are open', async () => {
    server.use(
      http.get(`${BASE}/summary`, () =>
        HttpResponse.json({ latest_date: '2026-10-31', open_questions: 3 }),
      ),
    );
    renderApp('/night-shift', <NightShiftRoute />);
    const badge = await screen.findByTestId('night-shift-badge');
    expect(badge).toHaveTextContent('3');
  });

  it('renders a question, saves the answer and removes the card', async () => {
    let posted: unknown = null;
    server.use(
      http.get(`${BASE}/questions`, () => HttpResponse.json([question])),
      http.get(`${BASE}/summary`, () =>
        HttpResponse.json({ latest_date: null, open_questions: 1 }),
      ),
      http.post(`${BASE}/questions/:id/answer`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({
          ...state.tasks[0],
          id: 'q1',
          kind: 'ticket',
          status: 'complete',
        });
      }),
    );
    renderApp('/night-shift', <NightShiftRoute />);
    const card = await screen.findByTestId('question-card');
    expect(card).toHaveTextContent('BUG-12');
    expect(within(card).getByTestId('kind-pill')).toHaveTextContent('Bug');
    expect(card).toHaveTextContent('Wobbly leg');
    expect(card).toHaveTextContent('Which leg first?');
    expect(card).toHaveTextContent('Should the night shift fix leg 3 first?');
    expect(await screen.findByTestId('night-shift-badge')).toHaveTextContent('1');

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer to Which leg first?' }), {
      target: { value: 'Leg 3 first.' },
    });
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByTestId('question-card')).toBeNull());
    expect(posted).toEqual({ answer: 'Leg 3 first.' });
    expect(screen.getByText('No open questions')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('night-shift-badge')).toBeNull());
  });

  it('Ctrl+Enter saves and the cursor moves to the next question (BUG-46)', async () => {
    const second = { ...question, id: 'q2', short_id: 'TKT-131', title: 'Which hand?' };
    const posted: unknown[] = [];
    server.use(
      http.get(`${BASE}/questions`, () => HttpResponse.json([question, second])),
      http.post(`${BASE}/questions/:id/answer`, async ({ request, params }) => {
        posted.push([params.id, await request.json()]);
        return HttpResponse.json({
          ...state.tasks[0],
          id: String(params.id),
          kind: 'ticket',
          status: 'complete',
        });
      }),
    );
    renderApp('/night-shift', <NightShiftRoute />);
    const first = await screen.findByRole('textbox', { name: 'Answer to Which leg first?' });
    const next = screen.getByRole('textbox', { name: 'Answer to Which hand?' });
    fireEvent.change(first, { target: { value: 'Leg 3 first.' } });
    fireEvent.keyDown(first, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(screen.getAllByTestId('question-card')).toHaveLength(1));
    expect(posted).toEqual([['q1', { answer: 'Leg 3 first.' }]]);
    expect(next).toHaveFocus();
    // a plain Enter is a newline, not a save; an empty box never saves
    fireEvent.keyDown(next, { key: 'Enter' });
    fireEvent.keyDown(next, { key: 'Enter', metaKey: true });
    expect(posted).toHaveLength(1);
    fireEvent.change(next, { target: { value: 'Left.' } });
    fireEvent.keyDown(next, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(screen.queryByTestId('question-card')).toBeNull());
    expect(posted).toEqual([
      ['q1', { answer: 'Leg 3 first.' }],
      ['q2', { answer: 'Left.' }],
    ]);
  });

  it('a failed save keeps the text and the cursor', async () => {
    server.use(
      http.get(`${BASE}/questions`, () => HttpResponse.json([question])),
      http.post(`${BASE}/questions/:id/answer`, () =>
        HttpResponse.json({ detail: 'question already answered' }, { status: 409 }),
      ),
    );
    renderApp('/night-shift', <NightShiftRoute />);
    const box = await screen.findByRole('textbox', { name: 'Answer to Which leg first?' });
    box.focus();
    fireEvent.change(box, { target: { value: 'Leg 3 first.' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByTestId('question-card')).toBeInTheDocument();
    expect(box).toHaveValue('Leg 3 first.');
    expect(box).toHaveFocus();
  });

  it('clicking the parent opens the drawer', async () => {
    server.use(http.get(`${BASE}/questions`, () => HttpResponse.json([question])));
    renderApp('/night-shift', <NightShiftRoute />);
    fireEvent.click(await screen.findByRole('button', { name: /BUG-12.*Wobbly leg/ }));
    expect(await screen.findByRole('complementary', { name: 'Item drawer' })).toBeVisible();
  });
});
