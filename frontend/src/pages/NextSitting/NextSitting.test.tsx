import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { NextSittingRoute } from '../../features/drawer/routes';
import { mapTask } from '../../test/mapFixtures';
import { renderApp } from '../../test/renderApp';
import { createState, makeServer, type TestState } from '../../test/server';
import { localToday } from './today';

const URL = 'http://localhost:8000/api/v1/runbook';
let state: TestState;
let server: ReturnType<typeof makeServer>;

const row = (over: Record<string, unknown>) => ({
  hardware: 'robot',
  task_id: 'b1',
  short_id: 'JB-1',
  title: 'Level check',
  kind: 'bug',
  ticket_type: null,
  pathway_short_id: 'JB-9',
  pathway_title: 'Alpha',
  priority: 'high',
  setup: ['level'],
  why: 'because',
  do: ['step one', 'step two'],
  pass: 'it works',
  record: 'the number',
  minutes: 10,
  branch: null,
  score: 0.3,
  has_result: false,
  results: [],
  ...over,
});

let rb: Record<string, unknown>;

beforeEach(() => {
  window.localStorage.clear();
  state = createState();
  state.tasks = [mapTask({ id: 'b1', kind: 'bug', title: 'Level check', status: 'backlog' })];
  rb = {
    rigs: [
      { hardware: 'robot', label: 'Robot', blocks: 2, minutes: 35 },
      { hardware: 'bench-hand', label: 'Bench hand', blocks: 1, minutes: 7 },
    ],
    blocks: [
      {
        hardware: 'robot',
        setup: ['level'],
        rows: [
          row({}),
          row({
            task_id: 'b2',
            short_id: 'JB-2',
            title: 'Beta check',
            pathway_short_id: 'JB-8',
            pathway_title: 'Beta',
            branch: 'night-shift/x',
            minutes: 5,
          }),
        ],
      },
      {
        hardware: 'robot',
        setup: ['level', 'armed'],
        rows: [
          row({
            task_id: 'b3',
            short_id: 'JB-3',
            title: 'Armed check',
            setup: ['level', 'armed'],
            minutes: 20,
          }),
        ],
      },
      {
        hardware: 'bench-hand',
        setup: ['level'],
        rows: [
          row({
            hardware: 'bench-hand',
            task_id: 'b5',
            short_id: 'JB-6',
            title: 'Hand check',
            minutes: 7,
          }),
        ],
      },
    ],
    needs_section: [
      {
        hardware: 'bench-leg',
        task_id: 'b4',
        short_id: 'JB-4',
        title: 'No section',
        kind: 'bug',
        ticket_type: null,
        errors: ['no ## Sitting section'],
      },
    ],
    questions: [],
    page: '# Next Sitting Runbook\n\n## Setup 0: before power\n\n- Power-cycle the can-bridge.\n- Latch `hand_source` first.\n\n## Block 1: level\n',
  };
  server = makeServer(state);
  server.use(http.get(URL, () => HttpResponse.json(rb)));
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.close();
});

describe('Next Sitting page', () => {
  it('renders setup zero, blocks, rows and needs-a-section', async () => {
    renderApp('/next-sitting', <NextSittingRoute />);
    expect(await screen.findByText('Power-cycle the can-bridge.')).toBeInTheDocument();
    expect(screen.getByText('Latch hand_source first.')).toBeInTheDocument();
    expect(screen.getAllByTestId('runbook-row')).toHaveLength(4);
    expect(screen.getByText('Setup: level, armed')).toBeInTheDocument();
    expect(screen.getByText('(15 min)')).toBeInTheDocument();
    expect(screen.getByText('night-shift/x')).toBeInTheDocument();
    expect(screen.getAllByText('step two')).toHaveLength(4);
    expect(screen.getByText(/no ## Sitting section/)).toBeInTheDocument();
    expect(await screen.findByTestId('next-sitting-badge')).toHaveTextContent('4');
  });

  it('heads each rig present, in order, with blocks beneath and a chip on needs entries', async () => {
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('runbook-row');
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    const robot = heads.findIndex((t) => t?.includes('Robot'));
    const hand = heads.findIndex((t) => t?.includes('Bench hand'));
    expect(robot).toBeGreaterThanOrEqual(0);
    expect(hand).toBeGreaterThan(robot);
    expect(heads[robot]).toContain('2 blocks · 35 min');
    expect(heads[hand]).toContain('1 block · 7 min');
    expect(heads.some((t) => t?.includes('Bench leg') && t.includes('block'))).toBe(false);
    const handRig = screen.getByRole('region', { name: 'Rig: Bench hand' });
    expect(within(handRig).getByRole('region', { name: 'Block 3' })).toBeInTheDocument();
    expect(within(handRig).getByText('Hand check')).toBeInTheDocument();
    const needs = screen.getByRole('region', { name: 'Needs a Sitting section' });
    expect(within(needs).getByTestId('rig-chip')).toHaveTextContent('Bench leg');
    // An invisible table: every needs entry is one row of five aligned cells
    // (rig, kind, ID, title, reason), so each kind of text shares a column.
    const rows = within(needs).getAllByRole('row');
    expect(rows.length).toBe(1);
    for (const r of rows) expect(within(r).getAllByRole('cell')).toHaveLength(5);
  });

  it('shows the kind pill beside each row ID, needs entry and question', async () => {
    rb.questions = [
      {
        task_id: 'q1',
        short_id: 'JB-5',
        title: 'Which hand?',
        kind: 'ticket',
        ticket_type: 'question',
        parent_task_id: 'b1',
        parent_short_id: 'JB-1',
        parent_kind: 'bug',
        parent_ticket_type: null,
      },
    ];
    renderApp('/next-sitting', <NextSittingRoute />);
    const rows = await screen.findAllByTestId('runbook-row');
    expect(within(rows[0] as HTMLElement).getByTestId('kind-pill')).toHaveTextContent('Bug');
    const pills = screen.getAllByTestId('kind-pill').map((p) => p.textContent);
    // 4 rows + 1 needs entry + question (own pill, then its parent's)
    expect(pills).toEqual(['Bug', 'Bug', 'Bug', 'Bug', 'Bug', 'Question', 'Bug']);
  });

  it('the pathway chip filters the same list and All resets', async () => {
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('runbook-row');
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getAllByTestId('runbook-row')).toHaveLength(1);
    expect(screen.getByText('Beta check')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByTestId('runbook-row')).toHaveLength(4);
  });

  it('saves a verdict and notes, then shows the result', async () => {
    let posted: unknown = null;
    server.use(
      http.post(`${URL}/:id/result`, async ({ request }) => {
        posted = await request.json();
        rb = {
          ...rb,
          rigs: [{ hardware: 'robot', label: 'Robot', blocks: 1, minutes: 10 }],
          blocks: [
            {
              hardware: 'robot',
              setup: ['level'],
              rows: [
                row({
                  has_result: true,
                  results: [{ date: localToday(), verdict: 'pass', notes: 'smooth' }],
                }),
              ],
            },
          ],
        };
        return HttpResponse.json(state.tasks[0]);
      }),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    const first = (await screen.findAllByTestId('runbook-row'))[0];
    const save = within(first).getByRole('button', { name: 'Save result' });
    expect(save).toBeDisabled();
    fireEvent.click(within(first).getByRole('button', { name: 'Pass' }));
    expect(save).toBeEnabled();
    fireEvent.change(within(first).getByRole('textbox'), { target: { value: 'smooth' } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(screen.getByTestId('runbook-result')).toHaveTextContent('pass, smooth'),
    );
    expect(posted).toEqual({ date: localToday(), verdict: 'pass', notes: 'smooth' });
    expect(screen.getByRole('button', { name: 'add another' })).toBeInTheDocument();
  });

  it('saves a pending verdict for a check the logs must settle', async () => {
    let posted: unknown = null;
    server.use(
      http.post(`${URL}/:id/result`, async ({ request }) => {
        posted = await request.json();
        rb = {
          ...rb,
          rigs: [{ hardware: 'robot', label: 'Robot', blocks: 1, minutes: 10 }],
          blocks: [
            {
              hardware: 'robot',
              setup: ['level'],
              rows: [
                row({
                  has_result: true,
                  results: [{ date: localToday(), verdict: 'pending', notes: 'check the bag' }],
                }),
              ],
            },
          ],
        };
        return HttpResponse.json(state.tasks[0]);
      }),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    const first = (await screen.findAllByTestId('runbook-row'))[0];
    fireEvent.click(within(first).getByRole('button', { name: 'Pending' }));
    fireEvent.change(within(first).getByRole('textbox'), { target: { value: 'check the bag' } });
    fireEvent.click(within(first).getByRole('button', { name: 'Save result' }));
    await waitFor(() =>
      expect(screen.getByTestId('runbook-result')).toHaveTextContent('pending, check the bag'),
    );
    expect(posted).toEqual({ date: localToday(), verdict: 'pending', notes: 'check the bag' });
  });

  it('shows the empty state', async () => {
    rb = { rigs: [], blocks: [], needs_section: [], questions: [], page: '' };
    renderApp('/next-sitting', <NextSittingRoute />);
    expect(await screen.findByText('No hardware checks waiting')).toBeInTheDocument();
    expect(screen.queryByTestId('next-sitting-badge')).toBeNull();
  });
});
