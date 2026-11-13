import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import { NextSittingRoute } from '../../features/drawer/routes';
import { renderApp } from '../../test/renderApp';
import { rowRenderProbe } from './rowRenderProbe';
import { createState, makeServer, type TestState } from '../../test/server';

const API = 'http://localhost:8000/api/v1';
let state: TestState;
let server: ReturnType<typeof makeServer>;

const serve = (over: Record<string, unknown>) => ({
  item: 'BUG-1',
  do: [0],
  verdict: false,
  title: 'Level one',
  priority: 'high',
  is_open: true,
  stem: 'bug-lvl',
  kind: 'bug',
  pass_text: null,
  task_id: 't1',
  ...over,
});
const step = (over: Record<string, unknown>) => ({
  n: 1,
  kind: 'run',
  title: 'A step',
  from_: [],
  to: [],
  actions: [{ where: 'Terminal 1', text: 'do it', command: 'ros2 param set /x y 1' }],
  see: 'a thing',
  stop_if: 'smoke',
  optional: false,
  serves: [],
  ...over,
});
let sheet: Record<string, unknown>;
const results = (over: Record<string, unknown> = {}) => ({ steps: {}, verdicts: {}, ...over });

beforeEach(() => {
  window.localStorage.clear();
  state = createState();
  sheet = {
    name: '2026-11-10-robot',
    date: '2026-11-10',
    rig: 'robot',
    results: results(),
    check_errors: [],
    state_help: { launched: 'The launch is up.', 'launch-down': 'No launch is running.' },
    steps: [
      step({ n: 1, kind: 'setup', title: 'Launch', new_launch: true, from_: [], to: ['launched'] }),
      step({
        n: 2,
        title: 'Fly it',
        from_: ['launched'],
        to: ['launched'],
        record: 'the bag',
        serves: [
          serve({ verdict: true, pass_text: 'it works' }),
          serve({
            item: 'BUG-2',
            task_id: 't2',
            title: 'Two',
            verdict: true,
            pass_text: 'it also works',
          }),
        ],
      }),
      step({ n: 3, kind: 'restore', title: 'Tidy', optional: true, from_: ['launched'] }),
    ],
  };
  server = makeServer(state);
  server.use(
    http.get(`${API}/sheets`, () =>
      HttpResponse.json({
        sheets: [
          { name: '2026-11-10-robot', date: '2026-11-10', rig: 'robot', steps: 3, saved: 0 },
        ],
      }),
    ),
    http.get(`${API}/sheets/2026-11-10-robot`, () => HttpResponse.json(sheet)),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.close();
  vi.restoreAllMocks();
});

describe('Sitting sheet page', () => {
  it('renders steps, the optional badge, the launch header and a verdict row per Item', async () => {
    renderApp('/next-sitting', <NextSittingRoute />);
    const cards = await screen.findAllByTestId('sheet-step');
    expect(cards).toHaveLength(3);
    const [launch, fly, tidy] = cards as [HTMLElement, HTMLElement, HTMLElement];
    expect(screen.getByTestId('launch-header')).toHaveTextContent('Launch 1');
    expect(screen.getByTestId('launch-progress')).toHaveTextContent('0/3');
    expect(within(launch).getByText('Launch down')).toBeInTheDocument();
    expect(within(tidy).getByText('optional')).toBeInTheDocument();
    expect(tidy).toHaveAttribute('data-optional', 'true');
    expect(within(fly).getAllByTestId('verdict-row')).toHaveLength(2);
    expect(within(fly).getByText(/it also works/)).toBeInTheDocument();
    expect(within(fly).getByText('record')).toBeInTheDocument();
    expect(within(launch).queryByText('record')).toBeNull();
    expect(within(fly).getByText('stop if')).toBeInTheDocument();
    expect(within(launch).getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(launch).toHaveAttribute('data-current', 'true');
    expect(screen.getByRole('button', { name: 'Go to current step 1 of 3' })).toBeInTheDocument();
  });

  it('shows a stale-sheet banner listing the check errors', async () => {
    sheet = { ...sheet, check_errors: ['step 4: names can-bridge v42, but the tree expects v43'] };
    renderApp('/next-sitting', <NextSittingRoute />);
    const banner = await screen.findByTestId('sheet-stale');
    expect(within(banner).getByText(/no longer matches/)).toBeInTheDocument();
    expect(within(banner).getByText(/expects v43/)).toBeInTheDocument();
    expect(screen.getAllByTestId('sheet-step')).toHaveLength(3);
  });

  it('saves verdicts per Item with the date, comments behind the icon, and shows the saved time', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/sheets/2026-11-10-robot/steps/2`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        sheet = {
          ...sheet,
          results: results({
            verdicts: {
              '2': {
                'BUG-1': { verdict: 'pass', notes: 'clean', saved_at: '2026-11-10 10:30' },
              },
            },
          }),
        };
        return HttpResponse.json(sheet.results as Record<string, unknown>);
      }),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    // comments are not open by default
    expect(screen.queryByLabelText('Notes for BUG-1')).toBeNull();
    const fly = screen.getAllByTestId('sheet-step')[1] as HTMLElement;
    const save = within(fly).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Pass BUG-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comment on step 2' }));
    fireEvent.change(screen.getByLabelText('Notes for BUG-1'), { target: { value: 'clean' } });
    fireEvent.change(screen.getByLabelText('Comments for step 2'), { target: { value: 'ok' } });
    fireEvent.click(save);
    await waitFor(() => expect(posted).not.toBeNull());
    const body = posted as unknown as Record<string, unknown>;
    expect(body.verdicts).toEqual({ 'BUG-1': { verdict: 'pass', notes: 'clean' } });
    expect(body.comments).toBe('ok');
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.status).toBeUndefined();
    expect(await screen.findByText('Saved 2026-11-10 10:30')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Go to current step 3 of 3' })).toBeInTheDocument(),
    );
  });

  it('one click on a simple step saves it done at once, with no Save button, then it collapses', async () => {
    let posted: unknown = null;
    server.use(
      http.post(`${API}/sheets/2026-11-10-robot/steps/1`, async ({ request }) => {
        posted = await request.json();
        sheet = {
          ...sheet,
          results: results({
            steps: { '1': { status: 'done', comments: '', saved_at: '2026-11-10 09:00' } },
          }),
        };
        return HttpResponse.json(sheet.results as Record<string, unknown>);
      }),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    const first = screen.getAllByTestId('sheet-step')[0] as HTMLElement;
    expect(within(first).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByLabelText('Comments for step 1')).toBeNull();
    fireEvent.click(within(first).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(posted).toMatchObject({ status: 'done', comments: '' }));
    const folded = await screen.findByTestId('sheet-step-done');
    expect(folded).toHaveTextContent('Launch');
    expect(screen.getAllByTestId('sheet-step')).toHaveLength(2);
    expect(screen.getByTestId('launch-progress')).toHaveTextContent('1/3');
    fireEvent.click(screen.getByRole('button', { name: 'Expand step 1' }));
    expect(screen.getAllByTestId('sheet-step')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse step 1' }));
    expect(screen.getAllByTestId('sheet-step')).toHaveLength(2);
  });

  it('Skipped is one click, folds the step with a dash and counts toward progress', async () => {
    let posted: unknown = null;
    server.use(
      http.post(`${API}/sheets/2026-11-10-robot/steps/1`, async ({ request }) => {
        posted = await request.json();
        sheet = {
          ...sheet,
          results: results({
            steps: { '1': { status: 'skipped', comments: '', saved_at: '2026-11-10 09:00' } },
          }),
        };
        return HttpResponse.json(sheet.results as Record<string, unknown>);
      }),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    const first = screen.getAllByTestId('sheet-step')[0] as HTMLElement;
    fireEvent.click(within(first).getByRole('button', { name: 'Skipped' }));
    await waitFor(() => expect(posted).toMatchObject({ status: 'skipped', comments: '' }));
    const folded = await screen.findByTestId('sheet-step-done');
    expect(folded).toHaveTextContent('–');
    expect(screen.getByTestId('launch-progress')).toHaveTextContent('1/3');
  });

  it('Problem is one click too; the comment pop-out saves a comment with a status', async () => {
    const posts: unknown[] = [];
    server.use(
      http.post(`${API}/sheets/2026-11-10-robot/steps/1`, async ({ request }) => {
        posts.push(await request.json());
        await delay(100);
        return HttpResponse.json(
          results({ steps: { '1': { status: 'problem', comments: 'x', saved_at: 'now' } } }),
        );
      }),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    const first = screen.getAllByTestId('sheet-step')[0] as HTMLElement;
    expect(within(first).queryByTestId('comment-dot')).toBeNull();
    fireEvent.click(within(first).getByRole('button', { name: 'Comment on step 1' }));
    const box = screen.getByLabelText('Comments for step 1') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'x' } });
    expect(within(first).getByTestId('comment-dot')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save as problem' }));
    await waitFor(() => expect(box.readOnly).toBe(true));
    await waitFor(() => expect(box.readOnly).toBe(false));
    expect(posts[0]).toMatchObject({ status: 'problem', comments: 'x' });
  });

  it('a failed save keeps what was typed', async () => {
    server.use(
      http.post(`${API}/sheets/2026-11-10-robot/steps/1`, () =>
        HttpResponse.json({ detail: 'nope' }, { status: 422 }),
      ),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    const first = screen.getAllByTestId('sheet-step')[0] as HTMLElement;
    fireEvent.click(within(first).getByRole('button', { name: 'Comment on step 1' }));
    const box = screen.getByLabelText('Comments for step 1') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'kept text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as done' }));
    expect(await screen.findByText('Could not save')).toBeInTheDocument();
    await waitFor(() => expect(box.readOnly).toBe(false));
    expect(box.value).toBe('kept text');
  });

  it('copies a command through the textarea fallback when navigator.clipboard is absent', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0] as HTMLElement);
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(exec).toHaveBeenCalledWith('copy');
    vi.unstubAllGlobals();
  });

  it('All Items shows the per-Item view and back returns to the sheet', async () => {
    server.use(
      http.get(`${API}/runbook`, () =>
        HttpResponse.json({ rigs: [], blocks: [], needs_section: [], questions: [], page: '' }),
      ),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    fireEvent.click(screen.getByRole('button', { name: 'All Items' }));
    expect(await screen.findByText('No hardware checks waiting')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-step')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the sheet' }));
    expect(await screen.findAllByTestId('sheet-step')).toHaveLength(3);
  });

  it('draws a progress rail: one segment per group, filled by the steps done, a dot at the current step', async () => {
    sheet = {
      ...sheet,
      results: results({
        steps: {
          '1': { status: 'done', comments: '', saved_at: '2026-11-10 09:00' },
          '2': { status: 'done', comments: '', saved_at: '2026-11-10 09:00' },
        },
      }),
      steps: [
        step({ n: 1, title: 'Prep' }),
        step({ n: 2, title: 'Launch 1 of 2 (main)', new_launch: true }),
        step({ n: 3, title: 'More' }),
        step({ n: 4, title: 'Launch 2 of 2 (cand)', new_launch: true }),
      ],
    };
    renderApp('/next-sitting', <NextSittingRoute />);
    const rail = await screen.findByTestId('sheet-rail');
    expect(rail.parentElement).toHaveAttribute('aria-hidden', 'true');
    const segs = within(rail).getAllByTestId('sheet-rail-segment');
    expect(segs.map((g) => [g.dataset.done, g.dataset.total])).toEqual([
      ['1', '1'],
      ['1', '2'],
      ['0', '1'],
    ]);
    const fills = within(rail).getAllByTestId('sheet-rail-fill');
    expect(fills.map((f) => f.style.height)).toEqual(['100%', '50%', '0%']);
    expect(segs[1]).toHaveAttribute('data-current', 'true');
    expect(within(rail).getAllByTestId('sheet-rail-marker')).toHaveLength(1);
  });

  it('groups steps by launch with item sub-headers and a setup sub-header', async () => {
    sheet = {
      ...sheet,
      steps: [
        step({ n: 1, title: 'Prep' }),
        step({ n: 2, title: 'Launch 1 of 2 (main)', new_launch: true, serves: [serve({})] }),
        step({ n: 3, title: 'More', serves: [serve({}), serve({ item: 'BUG-2', task_id: 't2' })] }),
        step({ n: 4, title: 'Launch 2 of 2 (cand)', new_launch: true }),
      ],
    };
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    const heads = screen.getAllByTestId('launch-header');
    expect(heads.map((h) => h.textContent)).toEqual([
      'Before launch0/1',
      'Launch 1main0/2',
      'Launch 2cand0/1',
    ]);
    const subs = screen.getAllByTestId('item-subheader').map((h) => h.textContent);
    expect(subs).toEqual(['setup', 'BUG-1', 'BUG-1BUG-2', 'setup']);
  });

  it('deselecting Items folds the steps that serve only them, and survives throwing localStorage', async () => {
    sheet = {
      ...sheet,
      steps: [
        step({ n: 1, title: 'Setup step', new_launch: true }),
        step({ n: 2, title: 'Only one', serves: [serve({})] }),
        step({
          n: 3,
          title: 'Shared',
          serves: [serve({}), serve({ item: 'BUG-2', task_id: 't2' })],
        }),
        step({ n: 4, title: 'Only two', serves: [serve({ item: 'BUG-2', task_id: 't2' })] }),
      ],
    };
    const set = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    expect(screen.queryAllByTestId('sheet-step-dim')).toHaveLength(0);
    fireEvent.click(
      within(screen.getByTestId('item-picker')).getByRole('button', { name: /^BUG-1/ }),
    );
    const dim = screen.getAllByTestId('sheet-step-dim');
    expect(dim).toHaveLength(1);
    expect(dim[0]).toHaveTextContent('Only one');
    expect(dim[0]).toHaveTextContent('BUG-1');
    // setup and shared steps stay full
    expect(screen.getAllByTestId('sheet-step')).toHaveLength(3);
    expect(set).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Expand step 2' }));
    expect(screen.queryAllByTestId('sheet-step-dim')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    // step 2 stays open: the operator expanded it
    expect(screen.getAllByTestId('sheet-step-dim')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.queryAllByTestId('sheet-step-dim')).toHaveLength(0);
  });

  it('remembers the deselection per sheet in localStorage', async () => {
    window.localStorage.setItem('sheet-items:2026-11-10-robot', JSON.stringify(['BUG-1', 'BUG-2']));
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    expect(screen.getAllByTestId('sheet-step-dim')).toHaveLength(1);
    expect(screen.getByTestId('item-picker')).toBeInTheDocument();
  });

  it('shows the state description on hover and keyboard focus', async () => {
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    const chip = screen.getAllByText('launched')[0] as HTMLElement;
    expect(chip).toHaveAttribute('title', 'The launch is up.');
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(chip);
    expect(screen.getByRole('tooltip')).toHaveTextContent('The launch is up.');
    fireEvent.mouseLeave(chip);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(chip);
    expect(chip).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
  });

  it('typing in one row renders only that row', async () => {
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    fireEvent.click(screen.getByRole('button', { name: 'Comment on step 2' }));
    const box = screen.getByLabelText('Comments for step 2');
    const seen: number[] = [];
    rowRenderProbe.hook = (n) => seen.push(n);
    try {
      fireEvent.change(box, { target: { value: 'a' } });
      fireEvent.change(box, { target: { value: 'ab' } });
    } finally {
      rowRenderProbe.hook = null;
    }
    expect(box).toHaveValue('ab');
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set([2]));
  });

  it('a status click shows at once, before the POST resolves', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((res) => (release = res));
    server.use(
      http.post(`${API}/sheets/2026-11-10-robot/steps/1`, async () => {
        await gate;
        return HttpResponse.json(
          results({
            steps: { '1': { status: 'done', comments: '', saved_at: '2026-11-10 09:00' } },
          }),
        );
      }),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    fireEvent.click(
      within(screen.getAllByTestId('sheet-step')[0] as HTMLElement).getByRole('button', {
        name: 'Done',
      }),
    );
    expect(await screen.findByTestId('sheet-step-done')).toBeInTheDocument();
    expect(screen.getByTestId('launch-progress')).toHaveTextContent('1/3');
    release();
    await waitFor(() => expect(screen.getByTestId('launch-progress')).toHaveTextContent('1/3'));
  });

  it('an optimistic status rolls back when the server refuses (422)', async () => {
    server.use(
      http.post(`${API}/sheets/2026-11-10-robot/steps/1`, async () => {
        await delay(30);
        return HttpResponse.json({ detail: 'nope' }, { status: 422 });
      }),
    );
    renderApp('/next-sitting', <NextSittingRoute />);
    await screen.findAllByTestId('sheet-step');
    fireEvent.click(
      within(screen.getAllByTestId('sheet-step')[0] as HTMLElement).getByRole('button', {
        name: 'Done',
      }),
    );
    expect(await screen.findByTestId('sheet-step-done')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('sheet-step-done')).toBeNull());
    expect(screen.getAllByTestId('sheet-step')).toHaveLength(3);
    expect(screen.getByTestId('launch-progress')).toHaveTextContent('0/3');
  });
});
