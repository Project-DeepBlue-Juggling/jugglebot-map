import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FrontRoute } from '../features/drawer/routes';
import FrontPage from '../pages/FrontPage';
import { mapTask } from '../test/mapFixtures';
import { createState, makeServer } from '../test/server';
import { SHORTCUT_ROWS } from '../ui/shortcutRows';
import { renderApp } from '../test/renderApp';

let server: ReturnType<typeof makeServer>;
let state: ReturnType<typeof createState>;

beforeEach(() => {
  state = createState();
  server = makeServer(state);
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.close();
});

describe('AppLayout', () => {
  it('links to the four pages', async () => {
    renderApp('/', <FrontPage />);
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const links = await screen.findAllByRole('link');
    expect(nav).toBeInTheDocument();
    expect(links.map((l) => l.textContent)).toEqual(['Front page', 'Now / Next / Later', 'Done', 'Dictionary']);
  });

  it('does not show a signed-in block (single-user map)', async () => {
    renderApp('/', <FrontPage />);
    await screen.findByRole('navigation', { name: 'Primary' });
    expect(screen.queryByText(/signed in as/i)).toBeNull();
    expect(screen.getByRole('button', { name: /keyboard shortcuts/i })).toBeInTheDocument();
  });

  it('every key the shortcuts dialog lists triggers its handler', async () => {
    state.tasks = [mapTask({ id: 'idea1', kind: 'idea', title: 'Wobbly idea', status: 'inbox' })];
    renderApp('/', <FrontRoute />);
    await screen.findByRole('navigation', { name: 'Primary' });
    expect(SHORTCUT_ROWS.map((r) => r.keys[0])).toEqual(['n', '/', 's', 'Enter', 'e', 'Esc']);

    // / focuses the header search.
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.getByRole('combobox', { name: /search items/i })).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.getByRole('combobox', { name: /search items/i })).not.toHaveFocus();

    // s opens the cheat-sheet; Esc closes it.
    fireEvent.keyDown(document.body, { key: 's' });
    expect(await screen.findByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // n opens the new-item modal; Esc closes it.
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(await screen.findByRole('dialog')).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Enter on a focused card opens the drawer; Esc closes it.
    await waitFor(() =>
      expect(document.querySelector('[role="button"][data-item-id]')).not.toBeNull(),
    );
    const card = document.querySelector('[role="button"][data-item-id]');
    fireEvent.keyDown(card as HTMLElement, { key: 'Enter' });
    const drawer = await screen.findByRole('complementary', { name: 'Item drawer' });
    expect(drawer).toBeVisible();

    // e, with focus in the drawer, opens the description editor.
    fireEvent.keyDown(await within(drawer).findByRole('heading', { level: 2 }), { key: 'e' });
    expect(await screen.findByLabelText('Description')).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Item drawer' })).toBeNull(),
    );
  });
});
