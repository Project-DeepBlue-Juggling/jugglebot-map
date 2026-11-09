import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mapTask } from '../test/mapFixtures';
import { ItemLinkCtx } from './itemLinks';
import Markdown from './Markdown';
import ShortId from './ShortId';

const kinds = new Map([
  ['BUG-3', { kind: 'bug', ticketType: null }],
  ['TKT-12', { kind: 'ticket', ticketType: 'question' }],
]);

const ids = new Map([
  ['BUG-3', 'uuid-3'],
  ['TKT-12', 'uuid-12'],
]);

async function show(source: string, open = vi.fn(), withCtx = true) {
  const body = <Markdown source={source} />;
  const r = render(
    withCtx ? (
      <ItemLinkCtx.Provider value={{ ids, kinds, open }}>{body}</ItemLinkCtx.Provider>
    ) : (
      body
    ),
  );
  await waitFor(() => expect(r.container.querySelector('.dr-md')).not.toBeNull());
  return { container: r.container, open };
}

describe('BUG-<n> links in drawer Markdown', () => {
  it('links known IDs in prose and Progress lines and opens that Item', async () => {
    const { open } = await show('Blocked on BUG-3.\n\n## Progress\n\n- 2026-10-26: see TKT-12');
    const links = screen.getAllByRole('button');
    expect(links.map((b) => b.textContent)).toEqual(['BUG-3', 'TKT-12']);
    fireEvent.click(links[1] as HTMLElement);
    expect(open).toHaveBeenCalledWith('uuid-12');
  });

  it('puts a kind pill before a known mention; unknown IDs get neither pill nor link', async () => {
    const { container } = await show('See BUG-3 and TKT-12, not BUG-99.');
    expect(screen.getAllByTestId('kind-pill').map((p) => p.textContent)).toEqual([
      'Bug',
      'Question',
    ]);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(container.textContent).toContain('BUG-99');
  });

  it('leaves unknown, lower-case, padded, suffixed and code-span IDs as text', async () => {
    const { container } = await show('BUG-99 bug-3 BUG-03 BUG-3a and `BUG-3` here');
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(container.textContent).toContain('BUG-99 bug-3 BUG-03 BUG-3a and BUG-3 here');
  });

  it('outside the drawer (no context) nothing is linked', async () => {
    await show('BUG-3', vi.fn(), false);
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});

describe('ShortId', () => {
  it('shows the ID muted, adds "unsent" while unpushed, and nothing without an ID', () => {
    const { rerender, container } = render(
      <ShortId task={mapTask({ id: 'x', short_id: 'BUG-4' })} />,
    );
    expect(screen.getByTestId('short-id').textContent).toBe('BUG-4');
    rerender(<ShortId task={mapTask({ id: 'x', short_id: 'BUG-4', unpushed: true })} />);
    expect(screen.getByTestId('short-id').textContent).toBe('BUG-4unsent');
    expect(screen.getByTestId('short-id').getAttribute('title')).toMatch(/may still change/);
    rerender(<ShortId task={mapTask({ id: 'x', short_id: null })} />);
    expect(container.textContent).toBe('');
  });

  it('shows a kind pill per kind, Question for a question ticket', () => {
    const cases: [string, string | null, string][] = [
      ['bug', null, 'Bug'],
      ['feature', null, 'Feature'],
      ['idea', null, 'Idea'],
      ['pathway', null, 'Pathway'],
      ['ticket', 'grilling', 'Ticket'],
      ['ticket', 'question', 'Question'],
    ];
    for (const [kind, ticket_type, label] of cases) {
      const { unmount } = render(
        <ShortId task={{ ...mapTask({ id: 'x', kind, short_id: 'BUG-4' }), ticket_type }} />,
      );
      expect(screen.getByTestId('kind-pill').textContent).toBe(label);
      expect(screen.getByTestId('short-id').textContent).toBe('BUG-4');
      unmount();
    }
  });

  it('renders no pill without an ID', () => {
    render(<ShortId task={mapTask({ id: 'x', kind: 'bug', short_id: null })} />);
    expect(screen.queryByTestId('kind-pill')).toBeNull();
  });
});
