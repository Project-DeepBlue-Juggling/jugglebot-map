import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { HttpResponse, delay, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderApp, settleQueries } from '../../test/renderApp';
import { mapTask, planWithPhases } from '../../test/mapFixtures';
import { createState, makeServer, type TestState } from '../../test/server';
import { NowRoute } from './routes';

expect.extend(toHaveNoViolations);

/** The redesigned drawer: reading view, full titles, Markdown, in-place editing. */
let state: TestState;
let server: ReturnType<typeof makeServer>;
let patchBodies: Array<Record<string, unknown>>;

const LONG_TITLE = `Idea ${'word '.repeat(38)}end`;
const PLAN_TITLE =
  `Two-ball oval: ${'a very long plan subtitle that the card name would cut '.repeat(3)}`.trim();

beforeEach(() => {
  state = createState();
  state.tasks = [
    mapTask({
      id: 'oval',
      title: 'Oval',
      destination: 'Dest **bold**',
      description: 'Notes with `code`',
    }),
    ...planWithPhases('oval-plan', 'oval', ['complete', 'not_started'], { title: PLAN_TITLE }),
    mapTask({
      id: 'idea1',
      kind: 'idea',
      title: LONG_TITLE,
      status: 'inbox',
      description: 'Some **strong** words.',
      priority: 'low',
    }),
  ];
  state.tasks = state.tasks.map((t) =>
    t.id === 'oval-plan#P1'
      ? {
          ...t,
          id: 'phase1',
          description: 'Wrapped across\nthree source\nlines of a plan file.',
        }
      : t,
  );
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
});

afterEach(async () => {
  await settleQueries();
  cleanup();
  server.resetHandlers();
  server.close();
});

const open = async (id: string) => {
  renderApp(`/now?item=${encodeURIComponent(id)}`, <NowRoute />);
  // The drawer first mounts as an overlay, then moves into the page's slot.
  const slot = await screen.findByTestId('drawer-slot');
  await waitFor(() => expect(slot.childElementCount).toBe(1));
  return screen.findByRole('complementary', { name: 'Item drawer' });
};
const gone = () =>
  waitFor(() => expect(screen.queryByRole('complementary', { name: 'Item drawer' })).toBeNull());

describe('titles are always in full', () => {
  it('an idea and a plan show the whole title with no input and no clipping class', async () => {
    for (const [id, title] of [
      ['idea1', LONG_TITLE],
      ['oval-plan', PLAN_TITLE],
    ] as const) {
      const d = await open(id);
      const h = await within(d).findByRole('heading', { level: 2 });
      expect(h.textContent).toBe(title);
      expect(within(d).queryByLabelText('Title')).toBeNull();
      for (let el: HTMLElement | null = h; el !== null && el !== d; el = el.parentElement) {
        expect(el.className).not.toMatch(/truncate|line-clamp/);
      }
      cleanup();
    }
  });

  it('a phase drawer links the full plan title, not the card name', async () => {
    const d = await open('phase1');
    const links = await within(d).findAllByRole('button', { name: PLAN_TITLE });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(within(d).getByRole('heading', { level: 2 })).toHaveTextContent(
      'P1 Phase 1 of oval-plan',
    );
  });
});

describe('read-only kinds', () => {
  it('a phase summary hard-wrapped in the plan file is one paragraph, with no Edit button', async () => {
    const d = await open('phase1');
    const ro = await within(d).findByTestId('readonly-body');
    await waitFor(() => expect(ro.querySelectorAll('.dr-md p')).toHaveLength(1));
    expect(ro.querySelector('.dr-md p')?.textContent).toBe(
      'Wrapped across three source lines of a plan file.',
    );
    expect(ro.querySelector('br')).toBeNull();
    expect(within(d).queryByRole('button', { name: /^Edit/ })).toBeNull();
    expect(within(d).queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('a plan shows no Edit affordance either', async () => {
    const d = await open('oval-plan');
    await within(d).findByTestId('readonly-body');
    expect(within(d).queryByRole('button', { name: /^Edit/ })).toBeNull();
  });
});

describe('editing the title', () => {
  it('click -> textarea with the full value; Enter commits to the form; close PATCHes title', async () => {
    const d = await open('idea1');
    await userEvent.click(await within(d).findByRole('heading', { level: 2 }));
    const box = within(d).getByLabelText('Title');
    expect(box).toHaveValue(LONG_TITLE);
    await userEvent.clear(box);
    await userEvent.type(box, 'Short{Enter}');
    expect(within(d).getByRole('heading', { level: 2 })).toHaveTextContent('Short');
    expect(within(d).getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: 'Close drawer' }));
    await gone();
    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toEqual({
      title: 'Short',
      if_unchanged_since: '2026-05-01T00:00:00Z',
    });
  });

  it('Esc in the title editor reverts it and leaves the drawer open', async () => {
    const d = await open('idea1');
    await userEvent.click(await within(d).findByRole('button', { name: 'Edit title' }));
    await userEvent.type(within(d).getByLabelText('Title'), 'XYZ');
    await userEvent.keyboard('{Escape}');
    expect(within(d).queryByLabelText('Title')).toBeNull();
    expect(within(d).getByRole('heading', { level: 2 }).textContent).toBe(LONG_TITLE);
    expect(screen.getByRole('complementary', { name: 'Item drawer' })).toBeInTheDocument();
    expect(patchBodies).toHaveLength(0);
  });
});

describe('editing the body', () => {
  it('Edit -> raw markdown -> Preview renders -> Done -> Ctrl+Enter saves description', async () => {
    server.use(
      http.patch(
        'http://localhost:8000/api/v1/projects/:projectId/tasks/:id',
        async ({ request }) => {
          await delay(200);
          const b = (await request.json()) as Record<string, unknown>;
          const t = state.tasks.find((x) => x.id === 'idea1') ?? state.tasks[0];
          const saved = {
            ...t,
            ...(b.description !== undefined && { description: b.description }),
            updated_at: '2026-07-01T00:00:00Z',
          };
          state.tasks = state.tasks.map((x) => (x.id === 'idea1' ? (saved as typeof t) : x));
          return HttpResponse.json(saved);
        },
      ),
    );
    const d = await open('idea1');
    await userEvent.click(await within(d).findByRole('button', { name: 'Edit description' }));
    const box = within(d).getByLabelText('Description');
    expect(box).toHaveValue('Some **strong** words.');
    await userEvent.type(box, ' More.');
    await userEvent.click(within(d).getByRole('tab', { name: 'Preview' }));
    await waitFor(() => expect(d.querySelector('.dr-md strong')?.textContent).toBe('strong'));
    await userEvent.click(within(d).getByRole('button', { name: 'Done' }));
    expect(within(d).queryByLabelText('Description')).toBeNull();
    await waitFor(() => expect(d.querySelector('.dr-md')?.textContent).toContain('More.'));
    expect(within(d).getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.keyDown(within(d).getByTestId('editable-body'), {
      key: 'Enter',
      ctrlKey: true,
    });
    expect(await within(d).findByText('Saving…')).toBeInTheDocument();
    expect(await within(d).findByText('Saved')).toBeInTheDocument();
    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toEqual({
      description: 'Some **strong** words. More.',
      if_unchanged_since: '2026-05-01T00:00:00Z',
    });
  });

  it('Esc leaves the editor first; the second Esc closes the drawer and saves the draft', async () => {
    const d = await open('idea1');
    await userEvent.click(await within(d).findByRole('button', { name: 'Edit description' }));
    await userEvent.type(within(d).getByLabelText('Description'), '!');
    await userEvent.keyboard('{Escape}');
    expect(within(d).queryByLabelText('Description')).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Item drawer' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await gone();
    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toMatchObject({ description: 'Some **strong** words.!' });
  });

  it('Discard resets every field to the baseline and disables Save', async () => {
    const d = await open('idea1');
    await userEvent.click(await within(d).findByRole('button', { name: 'Edit title' }));
    await userEvent.type(within(d).getByLabelText('Title'), '?{Enter}');
    await userEvent.selectOptions(within(d).getByLabelText('Priority'), 'high');
    expect(within(d).getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.click(within(d).getByRole('button', { name: 'Discard' }));
    expect(within(d).getByRole('heading', { level: 2 }).textContent).toBe(LONG_TITLE);
    expect(within(d).getByLabelText('Priority')).toHaveValue('low');
    expect(within(d).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(within(d).queryByRole('button', { name: 'Discard' })).toBeNull();
  });
});

describe('a Pathway shows and edits its Notes and Destination', () => {
  it('shows both rendered; each edit PATCHes only its own field', async () => {
    const d = await open('oval');
    await waitFor(() => expect(d.querySelector('.dr-md code')?.textContent).toBe('code'));
    expect(d.textContent).toContain('Dest');
    await userEvent.click(within(d).getByRole('button', { name: 'Edit notes' }));
    await userEvent.type(within(d).getByLabelText('Notes'), ' plus');
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toEqual({
      description: 'Notes with `code` plus',
      if_unchanged_since: '2026-05-01T00:00:00Z',
    });
    await waitFor(() => expect(within(d).getByRole('button', { name: 'Save' })).toBeDisabled());
    await userEvent.click(within(d).getByRole('button', { name: 'Edit destination' }));
    await userEvent.type(within(d).getByLabelText('Destination'), '!');
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchBodies).toHaveLength(2));
    expect(patchBodies[1]).toMatchObject({ destination: 'Dest **bold**!' });
    expect(patchBodies[1]).not.toHaveProperty('description');
  });
});

describe('layout contract and accessibility', () => {
  it('CSS contract: the docked drawer is clamp(360px,28vw,560px) wide', async () => {
    const d = await open('idea1');
    expect(screen.getByTestId('drawer-slot').contains(d)).toBe(true);
    expect(d.className).toContain('w-[clamp(360px,28vw,560px)]');
  });

  it('has no axe violations in the reading view or with the body editor open', async () => {
    const d = await open('idea1');
    await within(d).findByRole('heading', { level: 2 });
    await waitFor(() => expect(d.querySelector('.dr-md strong')).not.toBeNull());
    expect(await axe(d)).toHaveNoViolations();
    await userEvent.click(within(d).getByRole('button', { name: 'Edit description' }));
    expect(await axe(d)).toHaveNoViolations();
  });
});
