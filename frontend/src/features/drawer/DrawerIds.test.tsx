import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mapTask, planWithPhases } from '../../test/mapFixtures';
import { getLastClient, renderApp, settleQueries } from '../../test/renderApp';
import { createState, makeServer, type TestState } from '../../test/server';
import { DoneRoute, FrontRoute, NowRoute } from './routes';

/** Short IDs on the pages and in the drawer: display, `?item=JB-n`, links in bodies. */
let state: TestState;
let server: ReturnType<typeof makeServer>;

beforeEach(() => {
  state = createState();
  state.tasks = [
    mapTask({ id: 'oval', title: 'Oval', destination: 'Two balls.', short_id: 'JB-1' }),
    ...planWithPhases('oval-plan', 'oval', ['complete', 'not_started']),
    mapTask({
      id: 'idea1',
      kind: 'idea',
      title: 'Wobbly idea',
      status: 'inbox',
      short_id: 'JB-12',
      description: 'Related to JB-13 and JB-99.',
    }),
    mapTask({
      id: 'bug1',
      kind: 'bug',
      title: 'Fresh bug',
      status: 'inbox',
      short_id: 'JB-13',
      unpushed: true,
    }),
    mapTask({
      id: 'done1',
      kind: 'bug',
      title: 'Fixed bug',
      status: 'complete',
      short_id: 'JB-5',
      pathway_id: 'oval',
      parent_id: 'oval',
    }),
  ];
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
  return <span data-testid="loc">{loc.search}</span>;
}

const drawer = () => screen.findByRole('complementary', { name: 'Item drawer' });
const loc = () => screen.getByTestId('loc').textContent;

describe('short IDs in the app', () => {
  it('?item=JB-12 (and jb12, 12) opens the drawer, whose header shows the ID', async () => {
    for (const ref of ['JB-12', 'jb12', '12']) {
      renderApp(`/now?item=${ref}`, <NowRoute />);
      const d = await drawer();
      await waitFor(() => expect(within(d).getByTestId('short-id').textContent).toBe('JB-12'));
      await settleQueries();
      cleanup();
    }
  });

  it('opening an Item writes ?item=JB-n; a plan keeps its uuid', async () => {
    renderApp(
      '/now',
      <>
        <Probe />
        <NowRoute />
      </>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Wobbly idea/ }));
    await drawer();
    expect(loc()).toBe('?item=JB-12');
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await waitFor(() => expect(loc()).toBe(''));
    fireEvent.click(
      (await screen.findAllByRole('button', { name: /oval-plan/ }))[0] as HTMLElement,
    );
    await drawer();
    expect(loc()).toMatch(/^\?item=oval-plan/); // a plan or phase: the uuid, never a JB form
  });

  it('an unpushed Item is linked by uuid, so a renumber never swaps the drawer; JB-n once pushed', async () => {
    renderApp(
      '/now',
      <>
        <Probe />
        <NowRoute />
      </>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Fresh bug/ }));
    const d = await drawer();
    expect(loc()).toBe('?item=bug1'); // JB-13 is provisional
    // The writer's rebase brings another clone's JB-13 in and renumbers ours to JB-14.
    const bug1 = state.tasks.find((t) => t.id === 'bug1');
    if (bug1 === undefined) throw new Error('fixture lost bug1');
    const refetch = () => getLastClient()?.invalidateQueries();
    bug1.short_id = 'JB-14';
    state.tasks.push(
      mapTask({
        id: 'phone1',
        kind: 'bug',
        title: 'Phone bug',
        status: 'inbox',
        short_id: 'JB-13',
      }),
    );
    await refetch();
    await waitFor(() => expect(within(d).getByTestId('short-id').textContent).toBe('JB-14unsent'));
    expect(within(d).getByRole('heading', { name: /Fresh bug/ })).toBeTruthy();
    expect(loc()).toBe('?item=bug1');
    // The push lands: the URL takes the settled short ID.
    bug1.unpushed = false;
    await refetch();
    await waitFor(() => expect(loc()).toBe('?item=JB-14'));
    expect(within(await drawer()).getByTestId('short-id').textContent).toBe('JB-14');
  });

  it('a pasted ?item=JB-n of an unpushed Item is pinned to its uuid', async () => {
    renderApp(
      '/now?item=JB-13',
      <>
        <Probe />
        <NowRoute />
      </>,
    );
    await drawer();
    await waitFor(() => expect(loc()).toBe('?item=bug1'));
  });

  // Cause of the old skip: the drawer mounts as an overlay then moves into the page slot, so the first `aside` was detached (no app defect).
  it('a JB-n mention in a drawer body renders as a link; an unknown one stays text', async () => {
    renderApp(
      '/now?item=JB-12',
      <>
        <Probe />
        <NowRoute />
      </>,
    );
    const slot = await screen.findByTestId('drawer-slot');
    await waitFor(() => expect(slot.childElementCount).toBe(1));
    const d = await drawer();
    await settleQueries();
    // The Markdown renderer is lazy: allow its first load.
    const link = await within(d).findByRole('button', { name: 'JB-13' }, { timeout: 8000 });
    expect(within(d).queryByRole('button', { name: 'JB-99' })).toBeNull();
    fireEvent.click(link);
    await waitFor(() => expect(loc()).toBe('?item=bug1')); // JB-13 is unpushed: its uuid
  }, 15000);

  it('the Front page inbox, the Now / Next / Later rail and the Done rows show the ID', async () => {
    renderApp('/', <FrontRoute />);
    await waitFor(() =>
      expect(screen.getAllByTestId('short-id').map((e) => e.textContent)).toEqual(
        expect.arrayContaining(['JB-12', 'JB-13unsent']),
      ),
    );
    await settleQueries();
    cleanup();
    renderApp('/now', <NowRoute />);
    await waitFor(() =>
      expect(screen.getAllByTestId('short-id').map((e) => e.textContent)).toEqual(
        expect.arrayContaining(['JB-12', 'JB-13unsent']),
      ),
    );
    await settleQueries();
    cleanup();
    renderApp('/done', <DoneRoute />);
    await waitFor(() =>
      expect(screen.getAllByTestId('short-id').map((e) => e.textContent)).toContain('JB-5'),
    );
  });
});
