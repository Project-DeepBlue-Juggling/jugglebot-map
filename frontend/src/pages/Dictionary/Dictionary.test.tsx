import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Glossary } from '../../api/schemas';
import { createState, makeServer, type TestState } from '../../test/server';
import { renderApp } from '../../test/renderApp';
import DictionaryPage from './index';

let state: TestState;
let server: ReturnType<typeof makeServer>;

beforeEach(() => {
  state = createState();
  server = makeServer(state);
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.close();
  vi.restoreAllMocks();
});

const search = () => screen.findByRole('searchbox', { name: 'Search the dictionary' });
const termNames = () => screen.queryAllByTestId('term').map((n) => n.id);

describe('Dictionary page', () => {
  it('renders every cluster and term in order, Markdown definitions and Avoid lines', async () => {
    renderApp('/dictionary', <DictionaryPage />);
    await search();
    expect(termNames()).toEqual(['term-hand', 'term-cup', 'term-guard']);
    const clusters = within(screen.getByRole('navigation', { name: 'Clusters' }));
    expect(clusters.getAllByRole('link').map((l) => l.textContent)).toEqual(['The machine2', 'Safety1']);
    const hand = within(document.getElementById('term-hand') as HTMLElement);
    expect((await hand.findByText('linear stroke')).tagName).toBe('STRONG');
    expect(hand.getByText('Avoid: leg 6, seventh leg')).toBeInTheDocument();
    expect(within(document.getElementById('term-cup') as HTMLElement).queryByText(/Avoid/)).toBeNull();
    // Read-only: no edit affordance, only the copy-link button.
    expect(screen.queryByRole('button', { name: /edit|save/i })).toBeNull();
  });

  it('filters by term, definition and Avoid word, and shows an empty state', async () => {
    renderApp('/dictionary', <DictionaryPage />);
    const box = await search();
    fireEvent.change(box, { target: { value: 'CUP' } }); // term, case-insensitive
    await waitFor(() => expect(termNames()).toEqual(['term-cup']));
    fireEvent.change(box, { target: { value: 'stops motion' } }); // definition
    await waitFor(() => expect(termNames()).toEqual(['term-guard']));
    fireEvent.change(box, { target: { value: 'seventh leg' } }); // Avoid word
    await waitFor(() => expect(termNames()).toEqual(['term-hand']));
    // A cluster with no surviving term leaves the index.
    expect(screen.getAllByRole('link', { name: /The machine/ })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /Safety/ })).toBeNull();
    fireEvent.change(box, { target: { value: 'zzz-nothing' } });
    expect(await screen.findByTestId('dictionary-empty')).toHaveTextContent('No term matches');
    expect(termNames()).toEqual([]);
  });

  it('`/` focuses the search box', async () => {
    renderApp('/dictionary', <DictionaryPage />);
    const box = await search();
    expect(box).not.toHaveFocus();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(box).toHaveFocus();
  });

  it('scrolls to and briefly highlights the term named by the URL anchor', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderApp('/dictionary#term-guard', <DictionaryPage />);
    const guard = await waitFor(() => {
      const el = document.getElementById('term-guard');
      if (el === null) throw new Error('not yet');
      return el;
    });
    await waitFor(() => expect(guard).toHaveAttribute('data-highlighted', 'true'));
    expect(scroll).toHaveBeenCalled();
    expect(scroll.mock.instances[0]).toBe(guard);
    expect(document.getElementById('term-hand')).toHaveAttribute('data-highlighted', 'false');
    await waitFor(() => expect(guard).toHaveAttribute('data-highlighted', 'false'), { timeout: 3000 });
  });

  it('copies the term link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderApp('/dictionary', <DictionaryPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link to Hand' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0][0])).toMatch(/#term-hand$/);
  });

  it('shows an error when the payload does not match the schema', async () => {
    state.glossary = { clusters: [{ name: 'X', terms: [{ term: 'Hand' }] }] };
    renderApp('/dictionary', <DictionaryPage />);
    expect(await screen.findByText('Could not load the glossary.')).toBeInTheDocument();
  });
});

describe('Glossary schema', () => {
  it('accepts a well-formed payload and rejects malformed ones', () => {
    const ok = { clusters: [{ name: 'A', terms: [{ term: 'T', definition: 'd', avoid: [], anchor: 'term-t' }] }] };
    expect(Glossary.safeParse(ok).success).toBe(true);
    expect(Glossary.safeParse({ clusters: [{ name: 'A', terms: [{ term: 'T', definition: 'd', anchor: 'x' }] }] }).success).toBe(false);
    expect(Glossary.safeParse({ clusters: [{ name: 1, terms: [] }] }).success).toBe(false);
    expect(Glossary.safeParse({}).success).toBe(false);
  });
});
