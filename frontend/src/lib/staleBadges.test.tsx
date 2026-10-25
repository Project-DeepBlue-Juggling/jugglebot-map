import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { mapTask } from '../test/mapFixtures';
import { FrontPageView } from '../pages/FrontPage/FrontPageView';
import { NowNextLaterView } from '../pages/NowNextLater/NowNextLaterView';

// Fixed clock: rows of the shared fixture (inbox 30 d limit).
const NOW = new Date(2026, 9, 25, 12);
const stale = (over: Record<string, unknown> = {}) =>
  mapTask({
    id: 'old',
    kind: 'bug',
    status: 'inbox',
    title: 'Old bug',
    pathway_id: 'pw',
    created_at: '2026-09-20T00:00:00Z',
    ...over,
  });
const fresh = (over: Record<string, unknown> = {}) =>
  mapTask({
    id: 'new',
    kind: 'bug',
    status: 'inbox',
    title: 'New bug',
    pathway_id: 'pw',
    created_at: '2026-10-20T00:00:00Z',
    ...over,
  });

describe('stale badges', () => {
  it('Front page: the Pathway tile counts its stale open items, a fresh one has no badge', () => {
    const { unmount } = render(
      <FrontPageView
        tasks={[mapTask({ id: 'pw', title: 'Lane' }), stale(), fresh()]}
        deps={[]}
        users={[]}
        onOpen={vi.fn()}
        now={NOW}
      />,
    );
    const badge = within(screen.getByRole('button', { name: 'Lane' })).getByTestId('stale-badge');
    expect(badge).toHaveTextContent('1 stale');
    expect(badge).toHaveAttribute('title', 'no progress since 2026-09-20');
    unmount();
    render(
      <FrontPageView
        tasks={[mapTask({ id: 'pw', title: 'Lane' }), fresh()]}
        deps={[]}
        users={[]}
        onOpen={vi.fn()}
        now={NOW}
      />,
    );
    expect(screen.queryByTestId('stale-badge')).toBeNull();
  });

  it('Front page: an unattached stale inbox card carries the badge, a fresh one does not', () => {
    render(
      <FrontPageView
        tasks={[
          stale({ id: 'loose-old', title: 'Loose old', pathway_id: null }),
          fresh({ id: 'loose-new', title: 'Loose new', pathway_id: null }),
        ]}
        deps={[]}
        users={[]}
        onOpen={vi.fn()}
        now={NOW}
      />,
    );
    const badge = within(screen.getByRole('button', { name: 'Loose old' })).getByTestId(
      'stale-badge',
    );
    expect(badge).toHaveTextContent('stale · 35 d');
    expect(badge).toHaveAttribute('title', 'stale · 35 d: no progress since 2026-09-20');
    expect(
      within(screen.getByRole('button', { name: 'Loose new' })).queryByTestId('stale-badge'),
    ).toBeNull();
  });

  it('Now / Next / Later: rings on stale item lines and rail rows, listed in the Key', () => {
    render(
      <NowNextLaterView
        tasks={[
          mapTask({ id: 'pw', title: 'Lane' }),
          stale(),
          fresh(),
          stale({ id: 'loose', title: 'Loose', pathway_id: null }),
        ]}
        deps={[]}
        users={[]}
        onOpen={vi.fn()}
        now={NOW}
      />,
    );
    const items = within(screen.getByTestId('pw-items'));
    expect(
      within(items.getByRole('button', { name: 'Old bug' })).getByTestId('stale-mark'),
    ).toHaveAttribute('title', expect.stringContaining('35 d'));
    expect(
      within(items.getByRole('button', { name: 'New bug' })).queryByTestId('stale-mark'),
    ).toBeNull();
    expect(within(screen.getByTestId('rail-bug')).getByTestId('stale-mark')).toBeInTheDocument();
    // the Key body is rendered twice (a hidden measuring copy and the visible one)
    for (const body of screen.getAllByTestId('key-body'))
      expect(within(body).getByText('stale')).toBeInTheDocument();
  });

  it('Now / Next / Later: the Key omits the entry when nothing is stale', () => {
    render(
      <NowNextLaterView
        tasks={[mapTask({ id: 'pw', title: 'Lane' }), fresh()]}
        deps={[]}
        users={[]}
        onOpen={vi.fn()}
        now={NOW}
      />,
    );
    expect(screen.queryByTestId('stale-mark')).toBeNull();
    for (const body of screen.getAllByTestId('key-body'))
      expect(within(body).queryByText('stale')).toBeNull();
  });
});
