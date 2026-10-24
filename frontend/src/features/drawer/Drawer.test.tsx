import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderApp, settleQueries } from '../../test/renderApp';
import { mapTask, planWithPhases } from '../../test/mapFixtures';
import { createState, makeServer, type TestState } from '../../test/server';
import { FrontRoute, NowRoute } from './routes';
import NewItemModal from './NewItemModal';
import formSrc from './NewItemModal.tsx?raw';

/**
 * The shared drawer, driven through the real routes (FrontRoute / NowRoute
 * -> onOpen -> DrawerProvider -> ItemDrawer) against MSW-served map fixtures.
 */
let state: TestState;
let server: ReturnType<typeof makeServer>;
let patchBodies: Array<Record<string, unknown>>;

beforeEach(() => {
  state = createState();
  state.tasks = [
    mapTask({ id: 'oval', title: 'Oval', destination: 'Two balls in one hand.' }),
    ...planWithPhases('oval-plan', 'oval', ['complete', 'not_started']),
    mapTask({
      id: 'idea1',
      kind: 'idea',
      title: 'Wobbly idea',
      status: 'inbox',
      description: 'A thought.',
      priority: 'low',
    }),
  ];
  server = makeServer(state);
  patchBodies = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PATCH' && request.url.includes('/tasks/')) {
      void request
        .clone()
        .json()
        .then((b) => patchBodies.push(b as Record<string, unknown>));
    }
  });
  server.listen({ onUnhandledRequest: 'error' });
  window.history.replaceState(null, '', '/');
});

afterEach(async () => {
  // The 400 px modal test must not leak its viewport into other files in this worker.
  (
    window as unknown as { happyDOM?: { setViewport(v: { width: number; height: number }): void } }
  ).happyDOM?.setViewport({ width: 1024, height: 768 });
  await settleQueries();
  cleanup();
  server.resetHandlers();
  server.close();
});

const drawer = () => screen.findByRole('complementary', { name: 'Item drawer' });

describe('shared drawer wiring', () => {
  it('opens from a Front page tile click and shows the computed Next for a pathway', async () => {
    renderApp('/', <FrontRoute />);
    fireEvent.click(await screen.findByRole('button', { name: 'Oval' }));
    const d = await drawer();
    expect(await within(d).findByTestId('drawer-next')).toHaveTextContent(
      'P2 Phase 2 of oval-plan',
    );
    expect(within(d).getByLabelText('Destination')).toHaveValue('Two balls in one hand.');
    expect(within(d).getByText('oval-plan')).toBeInTheDocument(); // Contains
  });

  it('opens from a Now / Next / Later card click, and Esc / the close button close it', async () => {
    renderApp('/now', <NowRoute />);
    fireEvent.click(await screen.findByRole('button', { name: /Wobbly idea/ }));
    const d = await drawer();
    expect(await within(d).findByLabelText('Title')).toHaveValue('Wobbly idea');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Item drawer' })).toBeNull(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Wobbly idea/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close drawer' }));
    expect(screen.queryByRole('complementary', { name: 'Item drawer' })).toBeNull();
  });

  it('shows a plan read-only except its dependencies', async () => {
    renderApp('/', <FrontRoute />);
    fireEvent.click(await screen.findByRole('button', { name: 'Oval' }));
    const d = await drawer();
    fireEvent.click(await within(d).findByRole('button', { name: 'oval-plan' }));
    const ro = await within(d).findByTestId('readonly-body');
    expect(within(ro).queryByRole('textbox')).toBeNull();
    expect(within(ro).queryByRole('combobox')).toBeNull();
    expect(
      within(ro).getByText('Phase 1 of oval-plan'.replace('Phase 1', 'P1 Phase 1')),
    ).toBeInTheDocument();
    expect(within(ro).getByText('plans/active/oval-plan.md')).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(within(d).getByText('Dependencies')).toBeInTheDocument();
  });

  it('Promote PATCHes status and promoted_to with if_unchanged_since', async () => {
    renderApp('/now', <NowRoute />);
    fireEvent.click(await screen.findByRole('button', { name: /Wobbly idea/ }));
    const d = await drawer();
    await userEvent.click(await within(d).findByRole('button', { name: 'Promote' }));
    await userEvent.type(within(d).getByLabelText('Promoted to'), 'two-ball-oval.md');
    await userEvent.click(within(d).getByRole('button', { name: 'Confirm promote' }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toEqual({
      status: 'promoted',
      promoted_to: 'two-ball-oval.md',
      if_unchanged_since: '2026-05-01T00:00:00Z',
    });
    const saved = state.tasks.find((t) => t.id === 'idea1');
    expect(saved?.status).toBe('promoted');
    expect(saved?.promoted_to).toBe('two-ball-oval.md');
  });

  it('shows the ConflictDialog with the server current on a 409', async () => {
    server.use(
      http.patch('http://localhost:8000/api/v1/projects/:projectId/tasks/:id', () =>
        HttpResponse.json(
          {
            detail: 'Task was modified',
            current: {
              ...mapTask({ id: 'idea1', kind: 'idea', title: 'Theirs', status: 'inbox' }),
              updated_at: '2026-06-01T00:00:00Z',
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderApp('/now', <NowRoute />);
    fireEvent.click(await screen.findByRole('button', { name: /Wobbly idea/ }));
    const d = await drawer();
    const title = await within(d).findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Mine');
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/also edited this task/)).toBeInTheDocument();
    expect(screen.getByText('Theirs')).toBeInTheDocument();
  });
});

describe('five-field new-item modal', () => {
  it('shows and accepts all five fields at 400 px, single column', async () => {
    (
      window as unknown as {
        happyDOM?: { setViewport(v: { width: number; height: number }): void };
      }
    ).happyDOM?.setViewport({ width: 400, height: 800 });
    renderApp('/', <FrontRoute />);
    await userEvent.click(await screen.findByRole('button', { name: '+ New' }));
    const form = await screen.findByTestId('new-item-form');
    const fields = ['Kind', 'Title', 'One line', 'Priority (optional)', 'Pathway (optional)'];
    for (const name of fields) {
      const el = within(form).getByLabelText(name);
      expect(el).toBeVisible();
      expect(el).toBeEnabled();
    }
    // happy-dom does no layout, so the 400 px fit is asserted as the CSS
    // contract: one column (no grid or sm: breakpoints), full width capped at
    // max-w-md, and a body that scrolls inside the viewport.
    expect(form.className).toMatch(/\bw-full\b/);
    expect(form.className).toMatch(/\bmax-w-md\b/);
    expect(form.className).toMatch(/\bmax-h-full\b/);
    expect(form.className).toMatch(/\boverflow-y-auto\b/);
    expect(formSrc).not.toMatch(/grid-cols|\bsm:|\bmd:|\blg:/);
    await userEvent.selectOptions(within(form).getByLabelText('Kind'), 'bug');
    await userEvent.type(within(form).getByLabelText('Title'), 'Leg buzz');
    await userEvent.type(within(form).getByLabelText('One line'), 'Leg 3 buzzes at 40 Hz');
    await userEvent.selectOptions(within(form).getByLabelText('Priority (optional)'), 'high');
    await userEvent.selectOptions(within(form).getByLabelText('Pathway (optional)'), 'oval');
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:8000/api/v1/projects/:projectId/tasks', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(mapTask({ id: 'new', kind: 'bug' }));
      }),
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toEqual({
      kind: 'bug',
      title: 'Leg buzz',
      description: 'Leg 3 buzzes at 40 Hz',
      priority: 'high',
      parent_id: 'oval',
    });
  });

  it('A7: priority None is sent as an explicit null', async () => {
    renderApp('/', <FrontRoute />);
    await userEvent.click(await screen.findByRole('button', { name: '+ New' }));
    const form = await screen.findByTestId('new-item-form');
    await userEvent.type(within(form).getByLabelText('Title'), 'Plain');
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:8000/api/v1/projects/:projectId/tasks', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(mapTask({ id: 'new2', kind: 'idea' }));
      }),
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({ priority: null });
  });

  it('is exported as a standalone component', () => {
    expect(typeof NewItemModal).toBe('function');
  });
});

describe('P4 audit fixes (drawer)', () => {
  const openIdea = async () => {
    renderApp('/now', <NowRoute />);
    fireEvent.click(await screen.findByRole('button', { name: /Wobbly idea/ }));
    return drawer();
  };

  it('A4: a refetched title is re-seeded, not overwritten by Save; a dirty field survives', async () => {
    const d = await openIdea();
    const desc = await within(d).findByLabelText('Description');
    await userEvent.clear(desc);
    await userEvent.type(desc, 'Mine');
    // Someone else renames the item; the app refetches (SSE invalidate).
    state.tasks = state.tasks.map((t) =>
      t.id === 'idea1'
        ? { ...t, title: 'Renamed elsewhere', updated_at: '2026-06-01T00:00:00Z' }
        : t,
    );
    const qc = (await import('../../test/renderApp')).getLastClient();
    await qc?.invalidateQueries();
    await waitFor(() => expect(within(d).getByLabelText('Title')).toHaveValue('Renamed elsewhere'));
    expect(within(d).getByLabelText('Description')).toHaveValue('Mine');
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toEqual({
      description: 'Mine',
      if_unchanged_since: '2026-06-01T00:00:00Z',
    });
  });

  it('A7: drawer priority None PATCHes null', async () => {
    const d = await openIdea();
    await userEvent.selectOptions(await within(d).findByLabelText('Priority'), '');
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toMatchObject({ priority: null });
  });

  it('N3: promoted is not a status option; Promote saves dirty edits first', async () => {
    const d = await openIdea();
    const status = await within(d).findByLabelText('Status');
    expect(within(status).queryByRole('option', { name: /Promoted/ })).toBeNull();
    const title = within(d).getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Edited');
    await userEvent.click(within(d).getByRole('button', { name: 'Promote' }));
    await userEvent.type(within(d).getByLabelText('Promoted to'), 'plan.md');
    await userEvent.click(within(d).getByRole('button', { name: 'Confirm promote' }));
    await waitFor(() => expect(patchBodies).toHaveLength(2));
    expect(patchBodies[0]).toMatchObject({ title: 'Edited' });
    expect(patchBodies[1]).toMatchObject({ status: 'promoted', promoted_to: 'plan.md' });
    expect(patchBodies[1]).toHaveProperty('if_unchanged_since');
  });

  it('N2: a ticket has the links editor and no Unattached option', async () => {
    state.tasks.push(
      mapTask({
        id: 'tk',
        kind: 'ticket',
        status: 'open',
        title: 'Do it',
        parent_id: 'oval',
        pathway_id: 'oval',
      }),
    );
    renderApp('/now', <NowRoute />);
    fireEvent.click(await screen.findByRole('button', { name: /Do it/ }));
    const d = await drawer();
    expect(await within(d).findByLabelText('Add link')).toBeInTheDocument();
    const pw = within(d).getByLabelText('Pathway');
    expect(within(pw).queryByRole('option', { name: 'Unattached' })).toBeNull();
  });

  it('A5/A6: a plan drawer lists its dependencies read-only and shows the file as text', async () => {
    state.tasks.push(
      mapTask({
        id: 'tk2',
        kind: 'ticket',
        status: 'open',
        title: 'Blocker ticket',
        parent_id: 'oval',
        pathway_id: 'oval',
      }),
    );
    server.use(
      http.get('http://localhost:8000/api/v1/projects/:projectId/tasks/oval-plan', () =>
        HttpResponse.json({
          ...state.tasks.find((t) => t.id === 'oval-plan'),
          blocking: [],
          blocked_by: [
            {
              id: 'e1',
              blocker_id: 'tk2',
              blocked_id: 'oval-plan',
              created_at: '2026-05-01T00:00:00Z',
              created_by: 'owner',
            },
          ],
        }),
      ),
    );
    renderApp('/', <FrontRoute />);
    fireEvent.click(await screen.findByRole('button', { name: 'Oval' }));
    const d = await drawer();
    fireEvent.click(await within(d).findByRole('button', { name: 'oval-plan' }));
    const deps = await within(d).findByTestId('readonly-dependencies');
    expect(within(deps).getByText('Blocker ticket')).toBeInTheDocument();
    expect(within(deps).getByText(/edited in the plan file/)).toBeInTheDocument();
    expect(within(deps).queryByRole('combobox')).toBeNull();
    expect(within(deps).queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(within(d).getByText('plans/active/oval-plan.md').closest('a')).toBeNull();
  });
});
