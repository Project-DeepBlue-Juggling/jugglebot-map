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
  task_id: 'b1',
  short_id: 'JB-1',
  title: 'Level check',
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
    blocks: [
      {
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
    ],
    needs_section: [
      { task_id: 'b4', short_id: 'JB-4', title: 'No section', errors: ['no ## Sitting section'] },
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
    expect(screen.getAllByTestId('runbook-row')).toHaveLength(3);
    expect(screen.getByText('Setup: level, armed')).toBeInTheDocument();
    expect(screen.getByText('(15 min)')).toBeInTheDocument();
    expect(screen.getByText('night-shift/x')).toBeInTheDocument();
    expect(screen.getAllByText('step two')).toHaveLength(3);
    expect(screen.getByText(/no ## Sitting section/)).toBeInTheDocument();
    expect(await screen.findByTestId('next-sitting-badge')).toHaveTextContent('3');
  });

  it('the pathway chip filters the same list and All resets', async () => {
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('runbook-row');
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getAllByTestId('runbook-row')).toHaveLength(1);
    expect(screen.getByText('Beta check')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByTestId('runbook-row')).toHaveLength(3);
  });

  it('saves a verdict and notes, then shows the result', async () => {
    let posted: unknown = null;
    server.use(
      http.post(`${URL}/:id/result`, async ({ request }) => {
        posted = await request.json();
        rb = {
          ...rb,
          blocks: [
            {
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

  it('shows the empty state', async () => {
    rb = { blocks: [], needs_section: [], questions: [], page: '' };
    renderApp('/next-sitting', <NextSittingRoute />);
    expect(await screen.findByText('No hardware checks waiting')).toBeInTheDocument();
    expect(screen.queryByTestId('next-sitting-badge')).toBeNull();
  });
});
