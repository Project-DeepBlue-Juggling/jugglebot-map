import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderApp, settleQueries } from '../../test/renderApp';
import { mapTask, planWithPhases } from '../../test/mapFixtures';
import { createState, makeServer, type TestState } from '../../test/server';
import { FrontRoute, NowRoute } from './routes';

/** Drawer as URL state: `?item=`, Back, cache-first render, full text, docking. */
let state: TestState;
let server: ReturnType<typeof makeServer>;

const LONG = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} of a long summary.`).join(
  ' ',
);

beforeEach(() => {
  state = createState();
  state.tasks = [
    mapTask({ id: 'oval', title: 'Oval', destination: 'Two balls in one hand.' }),
    ...planWithPhases('oval-plan', 'oval', ['complete', 'not_started']),
    mapTask({ id: 'idea1', kind: 'idea', title: 'Wobbly idea', status: 'inbox' }),
  ];
  state.tasks = state.tasks.map((t) =>
    t.id === 'oval-plan#P1'
      ? { ...t, id: 'phase1', description: `**Implements:** ${LONG}\n\nSecond \`para\`.` }
      : t,
  );
  server = makeServer(state);
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(async () => {
  await settleQueries();
  cleanup();
  server.resetHandlers();
  server.close();
});

function Probe() {
  const loc = useLocation();
  const nav = useNavigate();
  return (
    <>
      <span data-testid="loc">
        {(loc.pathname.replace(/^.*\/projects\/[^/]+/, '') || '/') + loc.search}
      </span>
      <button type="button" onClick={() => nav(-1)}>
        history-back
      </button>
    </>
  );
}

const loc = () => screen.getByTestId('loc').textContent;
const drawer = () => screen.findByRole('complementary', { name: 'Item drawer' });

describe('drawer as URL state', () => {
  it('opening sets ?item= on the current page and browser Back closes it', async () => {
    renderApp(
      '/now',
      <>
        <Probe />
        <NowRoute />
      </>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Wobbly idea/ }));
    await drawer();
    expect(loc()).toBe('/now?item=idea1');
    fireEvent.click(screen.getByText('history-back'));
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Item drawer' })).toBeNull(),
    );
    expect(loc()).toBe('/now');
  });

  it('a pasted ?item= URL opens the drawer; closing replaces the URL', async () => {
    renderApp(
      '/now?item=idea1',
      <>
        <Probe />
        <NowRoute />
      </>,
    );
    await drawer();
    fireEvent.click(await screen.findByRole('button', { name: 'Close drawer' }));
    await waitFor(() => expect(loc()).toBe('/now'));
    expect(screen.queryByRole('complementary', { name: 'Item drawer' })).toBeNull();
  });

  it('in-drawer links push entries, Back walks them, and close unwinds them all', async () => {
    renderApp(
      '/',
      <>
        <Probe />
        <FrontRoute />
      </>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Oval' }));
    let d = await drawer();
    fireEvent.click(await within(d).findByRole('button', { name: 'oval-plan' }));
    await waitFor(() => expect(loc()).toBe('/?item=oval-plan'));
    d = await drawer();
    fireEvent.click(await within(d).findByRole('button', { name: /Phase 1 of oval-plan/ }));
    await waitFor(() => expect(loc()).toBe('/?item=phase1'));
    fireEvent.click(screen.getByText('history-back'));
    await waitFor(() => expect(loc()).toBe('/?item=oval-plan'));
    expect(await screen.findByText('plans/active/oval-plan.md')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await waitFor(() => expect(loc()).toBe('/'));
    expect(screen.queryByRole('complementary', { name: 'Item drawer' })).toBeNull();
  });
});

describe('drawer content', () => {
  it('shows the title and fields from the list cache before the detail resolves', async () => {
    server.use(
      http.get('http://localhost:8000/api/v1/projects/:projectId/tasks/:id', async ({ params }) => {
        await delay(400);
        const t = state.tasks.find((x) => x.id === params.id);
        return HttpResponse.json({ ...t, blocking: [], blocked_by: [] });
      }),
    );
    renderApp('/now', <NowRoute />);
    fireEvent.click(await screen.findByRole('button', { name: /Wobbly idea/ }));
    const d = await drawer();
    expect(
      await within(d).findByRole('heading', { level: 2, name: 'Wobbly idea' }),
    ).toBeInTheDocument();
    expect(within(d).getByTestId('deps-loading')).toBeInTheDocument();
    await waitFor(() => expect(within(d).queryByTestId('deps-loading')).toBeNull(), {
      timeout: 3000,
    });
  });

  it('renders a long phase description in full, emphasis as markup, without clipping classes', async () => {
    renderApp('/now?item=phase1', <NowRoute />);
    const d = await drawer();
    const ro = await within(d).findByTestId('readonly-body');
    await waitFor(() => expect(ro.querySelector('strong')).not.toBeNull());
    expect(ro.querySelector('strong')?.textContent).toBe('Implements:');
    expect(ro.querySelector('code')?.textContent).toBe('para');
    const text = ro.textContent ?? '';
    expect(text).toContain(LONG);
    expect(text).not.toContain('**');
    expect(text).not.toContain('…');
    expect(ro.innerHTML).not.toMatch(/line-clamp|truncate/);
  });
});

describe('docking on Now / Next / Later', () => {
  it('with an item open the rail is still in the document and the drawer is a flex child, not fixed', async () => {
    renderApp('/now?item=idea1', <NowRoute />);
    await drawer();
    const slot = screen.getByTestId('drawer-slot');
    await waitFor(() => expect(slot.childElementCount).toBe(1));
    const d = await drawer();
    expect(screen.getByTestId('rail')).toBeInTheDocument();
    expect(slot.contains(d)).toBe(true);
    expect(slot.parentElement).toBe(screen.getByTestId('lanes').parentElement);
    expect(slot.parentElement?.className).toMatch(/\bflex\b/);
    expect(d.className).not.toMatch(/\bfixed\b/);
    expect(screen.getByTestId('lanes').className).toMatch(/\bmin-w-0\b/);
  });

  it('on the Front page the drawer still overlays', async () => {
    renderApp('/?item=idea1', <FrontRoute />);
    const d = await drawer();
    expect(d.className).toMatch(/\bfixed\b/);
  });
});

describe('leaving the drawer saves first', () => {
  const editTitle = async (value: string) => {
    renderApp(
      '/now',
      <>
        <Probe />
        <NowRoute />
      </>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Wobbly idea/ }));
    const d = await drawer();
    await userEvent.click(await within(d).findByRole('button', { name: 'Edit title' }));
    const title = within(d).getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, value);
  };
  const gone = () =>
    waitFor(() => expect(screen.queryByRole('complementary', { name: 'Item drawer' })).toBeNull());

  it('a click on empty space saves the edit and closes', async () => {
    await editTitle('Renamed by click-away');
    fireEvent.pointerDown(screen.getByTestId('nnl-page'));
    await gone();
    expect(state.tasks.find((t) => t.id === 'idea1')?.title).toBe('Renamed by click-away');
    expect(loc()).toBe('/now');
  });

  it('the close button saves too', async () => {
    await editTitle('Renamed by close');
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await gone();
    expect(state.tasks.find((t) => t.id === 'idea1')?.title).toBe('Renamed by close');
  });

  it('a click on a control or inside the drawer does not close it', async () => {
    await editTitle('Still editing');
    fireEvent.pointerDown(screen.getByText('history-back'));
    fireEvent.pointerDown(await drawer());
    await settleQueries();
    expect(screen.getByRole('complementary', { name: 'Item drawer' })).toBeInTheDocument();
    expect(state.tasks.find((t) => t.id === 'idea1')?.title).toBe('Wobbly idea');
  });

  it('a conflicting save keeps the drawer open with the dialog', async () => {
    await editTitle('Mine');
    const idx = state.tasks.findIndex((t) => t.id === 'idea1');
    state.tasks[idx] = { ...state.tasks[idx], updated_at: '2030-01-01T00:00:00Z' };
    fireEvent.pointerDown(screen.getByTestId('nnl-page'));
    expect(await screen.findByText(/also edited this task/)).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Item drawer' })).toBeInTheDocument();
  });
});
