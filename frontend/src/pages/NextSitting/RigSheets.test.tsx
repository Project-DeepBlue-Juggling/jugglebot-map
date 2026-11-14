import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { NextSittingRoute } from '../../features/drawer/routes';
import { renderApp } from '../../test/renderApp';
import { createState, makeServer } from '../../test/server';
import { groupSheets, rigsWithoutSheet } from './rigs';

const API = 'http://localhost:8000/api/v1';
let server: ReturnType<typeof makeServer> | undefined;

const sum = (name: string, rig: string, saved: number, steps = 4) => ({
  name,
  date: name.slice(0, 10),
  rig,
  steps,
  saved,
});
const rbRow = (hardware: string, id: string) => ({
  hardware,
  task_id: id,
  short_id: id.toUpperCase(),
  title: id,
  kind: 'bug',
  ticket_type: null,
  pathway_short_id: null,
  pathway_title: null,
  priority: 'high',
  setup: [],
  why: '',
  do: [],
  pass: '',
  record: '',
  minutes: 5,
  branch: null,
  score: 0,
  on_sheet: '',
  has_result: false,
  results: [],
});
const runbook = (counts: Record<string, number>) => ({
  rigs: Object.keys(counts).map((hardware) => ({
    hardware,
    label: hardware,
    blocks: 1,
    minutes: 5,
  })),
  blocks: Object.entries(counts).map(([hardware, n]) => ({
    hardware,
    setup: [],
    rows: Array.from({ length: n }, (_, i) => rbRow(hardware, `${hardware}-${i}`)),
  })),
  needs_section: [],
  questions: [],
  page: '',
});

const sheetBody = (name: string, rig: string) => ({
  name,
  date: name.slice(0, 10),
  rig,
  results: { steps: {}, verdicts: {} },
  check_errors: [],
  state_help: {},
  steps: [
    {
      n: 1,
      kind: 'setup',
      title: 'Launch',
      from_: [],
      to: [],
      actions: [{ where: 'Terminal 1', text: 'go', command: null }],
      see: '',
      stop_if: '',
      optional: false,
      serves: [],
    },
  ],
});

function serve(sheets: ReturnType<typeof sum>[], rb: ReturnType<typeof runbook>) {
  server = makeServer(createState());
  server.use(
    http.get(`${API}/runbook`, () => HttpResponse.json(rb)),
    http.get(`${API}/sheets`, () => HttpResponse.json({ sheets })),
    http.get(`${API}/sheets/:name`, ({ params }) => {
      const s = sheets.find((x) => x.name === params.name);
      return HttpResponse.json(sheetBody(String(params.name), s?.rig ?? 'robot'));
    }),
  );
  server.listen({ onUnhandledRequest: 'error' });
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  server?.resetHandlers();
  server?.close();
  server = undefined;
  vi.restoreAllMocks();
});

describe('rig helpers', () => {
  it('groups sheets by rig in rig order and keeps newest first within a rig', () => {
    const g = groupSheets([
      sum('2026-11-13-bench-hand', 'bench-hand', 0),
      sum('2026-11-13-robot', 'robot', 4),
      sum('2026-11-10-robot', 'robot', 4),
    ]);
    expect(g.map((x) => x.rig)).toEqual(['robot', 'bench-hand']);
    expect(g[0]?.sheets.map((s) => s.name)).toEqual(['2026-11-13-robot', '2026-11-10-robot']);
  });

  it('names a rig with waiting Items and no open sheet; a flown sheet is not open', () => {
    const rb = runbook({ robot: 2, 'bench-leg': 3, 'bench-hand': 1 });
    const list = [
      sum('2026-11-13-robot', 'robot', 4),
      sum('2026-11-13-bench-hand', 'bench-hand', 1),
    ];
    expect(rigsWithoutSheet(rb as never, list)).toEqual([
      { hardware: 'robot', items: 2 },
      { hardware: 'bench-leg', items: 3 },
    ]);
    expect(rigsWithoutSheet(undefined, list)).toEqual([]);
  });
});

describe('Next Sitting sheet picker by rig', () => {
  it('groups the select in optgroups and shows a copyable line for a rig with no sheet', async () => {
    serve(
      [
        sum('2026-11-13-robot', 'robot', 1),
        sum('2026-11-12-bench-hand', 'bench-hand', 0),
        sum('2026-11-10-robot', 'robot', 4),
      ],
      runbook({ robot: 2, 'bench-leg': 3 }),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    const select = (await screen.findByRole('combobox', { name: 'Sheet' })) as HTMLSelectElement;
    const groups = Array.from(select.querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).toEqual(['Robot', 'Bench hand']);
    const line = await screen.findByTestId('no-sheet-line');
    expect(line).toHaveTextContent(
      'Bench leg: 3 Items waiting, no sheet. In a Session: /sitting-sheet bench-leg',
    );
    // the robot has an open sheet (1/4 saved), the bench hand too: only the leg is named
    expect(screen.getAllByTestId('no-sheet-line')).toHaveLength(1);
    const exec = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    fireEvent.click(within(line).getByRole('button', { name: 'Copy /sitting-sheet bench-leg' }));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(exec).toHaveBeenCalledWith('copy');
    vi.unstubAllGlobals();
  });

  it('shows no line when every rig with waiting Items has an open sheet', async () => {
    serve(
      [sum('2026-11-13-robot', 'robot', 1), sum('2026-11-12-robot', 'robot', 0)],
      runbook({ robot: 2 }),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findByRole('combobox', { name: 'Sheet' });
    expect(screen.queryByTestId('no-sheet-line')).toBeNull();
  });
});
