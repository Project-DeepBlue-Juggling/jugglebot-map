import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { NightShiftRoute } from '../../features/drawer/routes';
import { mapTask } from '../../test/mapFixtures';
import { renderApp } from '../../test/renderApp';
import { createState, makeServer, type TestState } from '../../test/server';

const nth = <T,>(a: T[], i: number): T => {
  const v = a[i];
  if (v === undefined) throw new Error(`no element ${i}`);
  return v;
};
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

  const entry = (date: string, extra: Record<string, unknown> = {}) => ({
    date,
    path: `docs/night-shift/${date}.md`,
    title: `Night Shift ${date}`,
    merged: 1,
    held: 2,
    questions: 1,
    status: 'OK',
    ...extra,
  });
  const useReports = (list: ReturnType<typeof entry>[]) =>
    server.use(
      http.get(`${BASE}/reports`, () => HttpResponse.json(list)),
      http.get(`${BASE}/reports/:date`, ({ params }) =>
        HttpResponse.text(`## Summary ${String(params.date)}`, {
          headers: { 'content-type': 'text/markdown' },
        }),
      ),
    );
  const three = () => [
    entry('2026-11-02'),
    entry('2026-10-31', { merged: 0, questions: 0, status: 'CLAUDE_FAILED' }),
    entry('2026-10-30'),
  ];

  const opener = () => screen.getByRole('button', { name: 'Report date' });
  const openList = () => {
    fireEvent.click(opener());
    return screen.getByRole('listbox');
  };

  it('defaults to the newest report, labelled Latest, and groups the listbox by month', async () => {
    useReports(three());
    renderApp('/night-shift', <NightShiftRoute />);
    expect(await screen.findByText('Summary 2026-11-02')).toBeInTheDocument();
    expect(opener()).toHaveAttribute('aria-haspopup', 'listbox');
    expect(opener()).toHaveTextContent('Mon 2 Nov');
    expect(opener()).toHaveTextContent('Latest');
    const box = openList();
    const groups = within(box).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'November 2026',
      'October 2026',
    ]);
    const opts = within(box).getAllByRole('option');
    expect(opts.map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(opts[0]).toHaveTextContent('Mon 2 Nov1 merged2 held1 questionLatest');
    expect(opts[1]).toHaveTextContent('Sat 31 Oct0 merged2 held0 questionsCLAUDE_FAILED');
    expect(opts[2]).toHaveTextContent('Fri 30 Oct1 merged2 held1 question');
    expect(screen.queryByRole('button', { name: 'Latest' })).toBeNull();
  });

  it('renders the three counts in separate cells and a dash for a missing count', async () => {
    useReports([
      entry('2026-11-02'),
      entry('2026-11-01', { merged: null, held: null, questions: null, status: 'STUB' }),
      entry('2026-10-31', { held: null }),
    ]);
    renderApp('/night-shift', <NightShiftRoute />);
    await screen.findByText('Summary 2026-11-02');
    const opts = within(openList()).getAllByRole('option');
    const cell = (o: HTMLElement, k: string) => o.querySelector(`[data-cell="${k}"]`);
    const first = ['merged', 'held', 'questions'].map((k) => cell(nth(opts, 0), k));
    expect(first.every((c) => c !== null)).toBe(true);
    expect(new Set(first).size).toBe(3);
    expect(first.map((c) => c?.textContent)).toEqual(['1 merged', '2 held', '1 question']);
    expect(opts[1]).toHaveTextContent('STUB');
    expect(cell(nth(opts, 1), 'held')).toBeNull();
    expect(cell(nth(opts, 2), 'held')?.textContent).toBe('– held');
  });

  it('opens from the keyboard, moves with arrows, Home and End, selects with Enter', async () => {
    useReports(three());
    renderApp('/night-shift', <NightShiftRoute />);
    await screen.findByText('Summary 2026-11-02');
    fireEvent.keyDown(opener(), { key: 'ArrowDown' });
    const box = screen.getByRole('listbox');
    const opts = within(box).getAllByRole('option');
    expect(box).toHaveAttribute('aria-activedescendant', nth(opts, 0).id);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveAttribute('aria-activedescendant', nth(opts, 1).id);
    fireEvent.keyDown(box, { key: 'End' });
    expect(box).toHaveAttribute('aria-activedescendant', nth(opts, 2).id);
    fireEvent.keyDown(box, { key: 'Home' });
    expect(box).toHaveAttribute('aria-activedescendant', nth(opts, 0).id);
    fireEvent.keyDown(box, { key: 'End' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByText('Summary 2026-10-30')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(opener()).toHaveFocus();
  });

  it('closes on Escape (focus back on the button) and on a click outside', async () => {
    useReports(three());
    renderApp('/night-shift', <NightShiftRoute />);
    await screen.findByText('Summary 2026-11-02');
    fireEvent.keyDown(openList(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(opener()).toHaveFocus();
    openList();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('disables newer at the newest report and older at the oldest, and steps between', async () => {
    useReports(three());
    renderApp('/night-shift', <NightShiftRoute />);
    await screen.findByText('Summary 2026-11-02');
    const older = screen.getByRole('button', { name: 'Older report' });
    const newer = screen.getByRole('button', { name: 'Newer report' });
    expect(newer).toBeDisabled();
    expect(older).toBeEnabled();
    fireEvent.click(older);
    expect(await screen.findByText('Summary 2026-10-31')).toBeInTheDocument();
    expect(newer).toBeEnabled();
    fireEvent.click(older);
    expect(await screen.findByText('Summary 2026-10-30')).toBeInTheDocument();
    expect(older).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));
    expect(await screen.findByText('Summary 2026-11-02')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Latest' })).toBeNull();
  });

  it('switches by clicking a row', async () => {
    useReports(three());
    renderApp('/night-shift', <NightShiftRoute />);
    await screen.findByText('Summary 2026-11-02');
    fireEvent.click(nth(within(openList()).getAllByRole('option'), 2));
    expect(await screen.findByText('Summary 2026-10-30')).toBeInTheDocument();
  });

  it('opens the report a ?date= deep link names', async () => {
    useReports(three());
    renderApp('/night-shift?date=2026-10-31', <NightShiftRoute />);
    expect(await screen.findByText('Summary 2026-10-31')).toBeInTheDocument();
    expect(opener()).toHaveTextContent('Sat 31 Oct');
    expect(screen.getByRole('button', { name: 'Latest' })).toBeInTheDocument();
  });

  it('shows a notice and the latest report for an unknown ?date=', async () => {
    useReports(three());
    renderApp('/night-shift?date=2020-01-01', <NightShiftRoute />);
    expect(await screen.findByText('Summary 2026-11-02')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No report for 2020-01-01');
  });

  it('shows the runner last run, and nothing when there is no history', async () => {
    useReports(three());
    renderApp('/night-shift', <NightShiftRoute />);
    await screen.findByText('Summary 2026-11-02');
    expect(screen.queryByTestId('last-run')).toBeNull();
    cleanup();
    server.use(
      http.get(`${BASE}/runs`, () =>
        HttpResponse.json([{ date: '2026-11-03', status: 'NOTHING_NEW' }]),
      ),
    );
    renderApp('/night-shift', <NightShiftRoute />);
    expect(await screen.findByTestId('last-run')).toHaveTextContent(
      'Last run: 2026-11-03 NOTHING_NEW',
    );
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
