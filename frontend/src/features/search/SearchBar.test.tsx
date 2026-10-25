import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { DoneRoute } from '../drawer/routes';
import { mapTask } from '../../test/mapFixtures';
import { renderApp } from '../../test/renderApp';
import { createState, makeServer, type TestState } from '../../test/server';

let state: TestState;
let server: ReturnType<typeof makeServer>;

beforeEach(() => {
  window.localStorage.clear();
  state = createState();
  state.tasks = [
    mapTask({ id: 'b1', kind: 'bug', title: 'Cup wobble', status: 'open' }),
    mapTask({ id: 'b2', kind: 'bug', title: 'Cup rattle fixed', status: 'complete' }),
    mapTask({ id: 'pl', kind: 'plan', title: 'Hand plan', status: 'active' }),
  ];
  state.glossary = {
    clusters: [
      {
        name: 'Juggling',
        terms: [
          {
            term: 'Throw',
            definition: 'The release of a ball.',
            avoid: ['toss'],
            anchor: 'term-throw',
          },
        ],
      },
    ],
  };
  server = makeServer(state);
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.close();
});

const box = () => screen.getByRole('combobox', { name: /search items/i });

async function typeQuery(q: string) {
  await screen.findByRole('combobox', { name: /search items/i });
  fireEvent.focus(box());
  fireEvent.change(box(), { target: { value: q } });
}

describe('header search', () => {
  it('/ focuses the box from anywhere but not from inside another input', async () => {
    renderApp('/done', <DoneRoute />);
    await screen.findByRole('combobox', { name: /search items/i });
    fireEvent.keyDown(document.body, { key: '/' });
    expect(box()).toHaveFocus();
    box().blur();
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    fireEvent.keyDown(other, { key: '/' });
    expect(box()).not.toHaveFocus();
    other.remove();
  });

  it('groups results, dims closed ones with their status, and finds a term by its Avoid word', async () => {
    renderApp('/done', <DoneRoute />);
    await typeQuery('cup');
    const open = await screen.findByRole('option', { name: /Cup wobble/ });
    const closed = screen.getByRole('option', { name: /Cup rattle fixed/ });
    expect(closed).toHaveAttribute('data-closed', 'true');
    expect(closed).toHaveTextContent('complete');
    expect(open.compareDocumentPosition(closed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(box(), { target: { value: 'toss' } });
    const term = await screen.findByRole('option', { name: /Throw/ });
    expect(term).toHaveTextContent('avoid: toss');
  });

  it('arrow keys and Enter open the item in the drawer', async () => {
    renderApp('/done', <DoneRoute />);
    await typeQuery('cup');
    await screen.findByRole('option', { name: /Cup wobble/ });
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Cup rattle fixed/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(await screen.findByRole('complementary', { name: 'Item drawer' })).toBeVisible();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Esc closes the dropdown and clears the box', async () => {
    renderApp('/done', <DoneRoute />);
    await typeQuery('cup');
    await screen.findByRole('listbox');
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box()).toHaveValue('');
  });

  it('a click outside closes the dropdown', async () => {
    renderApp('/done', <DoneRoute />);
    await typeQuery('cup');
    await screen.findByRole('listbox');
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });
});
