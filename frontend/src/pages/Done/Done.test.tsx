import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { DoneRoute } from '../../features/drawer/routes';
import { mapTask } from '../../test/mapFixtures';
import { renderApp } from '../../test/renderApp';
import { createState, makeServer, type TestState } from '../../test/server';

let state: TestState;
let server: ReturnType<typeof makeServer>;

beforeEach(() => {
  window.localStorage.clear();
  state = createState();
  state.tasks = [
    mapTask({
      id: 'pwDone',
      title: 'Arrived path',
      status: 'complete',
      destination: 'Met, met 2026-10-13.',
    }),
    mapTask({
      id: 'pwDrop',
      title: 'Abandoned path',
      status: 'dropped',
      updated_at: '2026-10-01T00:00:00Z',
    }),
    mapTask({ id: 'pwOpen', title: 'Still open path', status: 'active' }),
    mapTask({
      id: 'plan1',
      kind: 'plan',
      title: 'The archived plan',
      status: 'archived',
      parent_id: 'pwDone',
      pathway_id: 'pwDone',
    }),
    mapTask({
      id: 'b1',
      kind: 'bug',
      title: 'Fixed wobble',
      status: 'complete',
      pathway_id: 'pwDone',
      parent_id: 'pwDone',
      updated_at: '2026-10-05T00:00:00Z',
    }),
    mapTask({
      id: 'f1',
      kind: 'feature',
      title: 'Shipped thing',
      status: 'complete',
      updated_at: '2026-09-09T00:00:00Z',
    }),
    mapTask({
      id: 'i1',
      kind: 'idea',
      title: 'Dropped notion',
      status: 'dropped',
      updated_at: '2026-10-02T00:00:00Z',
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

const titles = (id: string) => screen.queryAllByTestId(id).map((n) => n.textContent ?? '');

describe('Done page', () => {
  it('reaches a complete Pathway in two clicks from the sidebar', async () => {
    renderApp('/', <DoneRoute />);
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Done' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Arrived path' }));
    expect(await screen.findByRole('complementary', { name: 'Item drawer' })).toBeVisible();
  });

  it('lists arrived Pathways with date and plans, and hides dropped until toggled', async () => {
    renderApp('/done', <DoneRoute />);
    const card = await screen.findByTestId('arrived-pathway');
    expect(card).toHaveTextContent('Arrived path');
    expect(card).toHaveTextContent('2026-10-13');
    expect(within(card).getByRole('button', { name: 'The archived plan' })).toBeInTheDocument();
    expect(screen.queryByText('Abandoned path')).toBeNull();
    expect(screen.queryByText('Dropped notion')).toBeNull();
    expect(screen.queryByText('Still open path')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show dropped' }));
    expect(screen.getByText('Abandoned path')).toBeInTheDocument();
    expect(screen.getByText('Dropped notion')).toBeInTheDocument();
    expect(window.localStorage.getItem('jugglebot-map-done-show-dropped')).toBe('1');
  });

  it('groups closed items by Pathway and filters by month and kind', async () => {
    renderApp('/done', <DoneRoute />);
    await screen.findByTestId('arrived-pathway');
    expect(
      screen.getAllByTestId('closed-group').map((g) => g.querySelector('h3')?.textContent),
    ).toEqual(['Arrived path', 'No Pathway']);
    expect(titles('closed-item')).toHaveLength(2);

    fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), {
      target: { value: '2026-09' },
    });
    expect(titles('closed-item')).toHaveLength(1);
    expect(titles('closed-item')[0]).toContain('Shipped thing');

    fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bug' }));
    expect(titles('closed-item')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Idea' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bug' }));
    expect(await screen.findByText('No closed items match.')).toBeInTheDocument();
  });

  it('says so when nothing has arrived', async () => {
    state.tasks = [mapTask({ id: 'pw', title: 'Open', status: 'active' })];
    renderApp('/done', <DoneRoute />);
    expect(await screen.findByText('Nothing has arrived yet.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No closed items match.')).toBeInTheDocument());
  });
});
