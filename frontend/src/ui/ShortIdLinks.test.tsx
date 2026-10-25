import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mapTask } from '../test/mapFixtures';
import { ItemLinkCtx } from './itemLinks';
import Markdown from './Markdown';
import ShortId from './ShortId';

const ids = new Map([
  ['JB-3', 'uuid-3'],
  ['JB-12', 'uuid-12'],
]);

async function show(source: string, open = vi.fn(), withCtx = true) {
  const body = <Markdown source={source} />;
  const r = render(
    withCtx ? <ItemLinkCtx.Provider value={{ ids, open }}>{body}</ItemLinkCtx.Provider> : body,
  );
  await waitFor(() => expect(r.container.querySelector('.dr-md')).not.toBeNull());
  return { container: r.container, open };
}

describe('JB-<n> links in drawer Markdown', () => {
  it('links known IDs in prose and Progress lines and opens that Item', async () => {
    const { open } = await show('Blocked on JB-3.\n\n## Progress\n\n- 2026-10-26: see JB-12');
    const links = screen.getAllByRole('button');
    expect(links.map((b) => b.textContent)).toEqual(['JB-3', 'JB-12']);
    fireEvent.click(links[1] as HTMLElement);
    expect(open).toHaveBeenCalledWith('uuid-12');
  });

  it('leaves unknown, lower-case, padded, suffixed and code-span IDs as text', async () => {
    const { container } = await show('JB-99 jb-3 JB-03 JB-3a and `JB-3` here');
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(container.textContent).toContain('JB-99 jb-3 JB-03 JB-3a and JB-3 here');
  });

  it('outside the drawer (no context) nothing is linked', async () => {
    await show('JB-3', vi.fn(), false);
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});

describe('ShortId', () => {
  it('shows the ID muted, adds "unsent" while unpushed, and nothing without an ID', () => {
    const { rerender, container } = render(
      <ShortId task={mapTask({ id: 'x', short_id: 'JB-4' })} />,
    );
    expect(screen.getByTestId('short-id').textContent).toBe('JB-4');
    rerender(<ShortId task={mapTask({ id: 'x', short_id: 'JB-4', unpushed: true })} />);
    expect(screen.getByTestId('short-id').textContent).toBe('JB-4unsent');
    expect(screen.getByTestId('short-id').getAttribute('title')).toMatch(/may still change/);
    rerender(<ShortId task={mapTask({ id: 'x', short_id: null })} />);
    expect(container.textContent).toBe('');
  });
});
