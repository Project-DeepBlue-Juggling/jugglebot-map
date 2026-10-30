import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DependencyEdge, Task } from '../../api/schemas';
import { progress } from '../../lib/derive';
import { WALL_SORT_KEY } from '../../lib/wallSort';
import { RETIRED_STYLE, STATE_STYLES } from '../../theme/palette';
import { dep, mapTask, planWithPhases, sixPathwayMap } from '../../test/mapFixtures';
import layoutSrc from '../../layout/AppLayout.tsx?raw';
import { FrontPageView } from './FrontPageView';
import { InboxCard } from './InboxCard';
import { buildMapView, FRONT_LAYOUT } from './mapView';
import { SegmentedBar } from './SegmentedBar';

function page(tasks: Task[], deps: DependencyEdge[] = [], onOpen = vi.fn()) {
  render(<FrontPageView tasks={tasks} deps={deps} users={[]} onOpen={onOpen} />);
  return onOpen;
}

function tile(title: string): HTMLElement {
  return screen.getByRole('button', { name: title });
}

describe('PathwayTile', () => {
  it('draws a tile per open Pathway and none for a complete or dropped one', () => {
    page([
      mapTask({ id: 'a', title: 'Open one' }),
      mapTask({ id: 'z', title: 'Finished one', status: 'complete' }),
      mapTask({ id: 'd', title: 'Dropped one', status: 'dropped' }),
    ]);
    expect(tile('Open one')).toBeInTheDocument();
    expect(screen.queryByText('Finished one')).toBeNull();
    expect(screen.queryByText('Dropped one')).toBeNull();
    expect(screen.getByText(/1 pathways/)).toBeInTheDocument();
  });

  it('shows the next phase with its plan, and x of y stops done', () => {
    page([
      mapTask({ id: 'pw', title: 'Oval', destination: 'Two balls in one hand.' }),
      ...planWithPhases('oval', 'pw', ['complete', 'retired', 'not_started']),
    ]);
    const t = tile('Oval');
    expect(within(t).getByTestId('next-box')).toHaveTextContent('P3 Phase 3 of oval');
    expect(within(t).getByTestId('next-box')).toHaveTextContent('(oval)');
    expect(within(t).getByTestId('stops-done')).toHaveTextContent('1 of 2 stops done');
    expect(within(t).getByText('Two balls in one hand.')).toBeInTheDocument();
  });

  it('shows the blocker as Next when every plan waits on one, and the Destination with no plans', () => {
    page(
      [
        mapTask({ id: 'bb', title: 'Ball Butler' }),
        ...planWithPhases('feed', 'bb', ['not_started']),
        mapTask({ id: 'probe', title: 'Probe round 2', kind: 'feature', status: 'backlog' }),
        mapTask({ id: 'map', title: 'Map', destination: 'A locked design.' }),
      ],
      [dep('probe', 'feed')],
    );
    const next = within(tile('Ball Butler')).getByTestId('next-box');
    expect(next).toHaveTextContent('Feature');
    expect(next).toHaveTextContent('Probe round 2');
    expect(within(tile('Map')).getByTestId('next-box')).toHaveTextContent('No plans yet');
    expect(within(tile('Map')).getByTitle('A locked design.')).toBeInTheDocument();
  });

  it('says nothing is ready when every open plan is parked', () => {
    page([
      mapTask({ id: 'pw', title: 'Parked only' }),
      mapTask({ id: 'pk', kind: 'plan', status: 'parked', parent_id: 'pw', pathway_id: 'pw' }),
    ]);
    expect(within(tile('Parked only')).getByTestId('next-box')).toHaveTextContent('No open stops');
  });

  it('caps what remains at four rows plus "+n more"', () => {
    page([
      mapTask({ id: 'pw', title: 'Long' }),
      ...planWithPhases('big', 'pw', Array(7).fill('not_started')),
    ]);
    const list = within(tile('Long')).getByRole('list', { name: 'What remains' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[4]).toHaveTextContent('+3 more');
  });

  it('gives each open plan of a two-plan Pathway its own row, bar and every remaining phase', () => {
    // Owner, 2026-10-27 (JB-70): e.g. Two-ball oval carries two plans.
    page([
      mapTask({ id: 'pw', title: 'Oval' }),
      ...planWithPhases('oval', 'pw', ['complete', ...Array(6).fill('not_started')]),
      ...planWithPhases('clamp', 'pw', ['complete', 'not_started']),
      mapTask({
        id: 'old',
        kind: 'plan',
        status: 'completed',
        parent_id: 'pw',
        pathway_id: 'pw',
      }),
    ]);
    const t = tile('Oval');
    const stack = within(t).getByTestId('plan-stack');
    const rows = within(stack).getAllByRole('region');
    expect(rows).toHaveLength(2);
    for (const row of rows)
      expect(within(row).getByRole('img', { name: 'Progress by stop' })).toBeInTheDocument();
    const oval = within(stack).getByRole('region', { name: /oval/ });
    // Every remaining phase, no "+n more" (the page scrolls now).
    const remaining = within(oval).getAllByRole('listitem');
    expect(remaining).toHaveLength(6);
    expect(within(oval).queryByText(/more/)).toBeNull();
    // Each bar holds only its own plan's stops.
    expect(within(oval).getByRole('img').children).toHaveLength(7);
    expect(within(stack).getByTestId('plans-done')).toHaveTextContent('✓ 1 plan done');
    // The Next box and the stops count stay at Pathway level.
    expect(within(t).getAllByTestId('next-box')).toHaveLength(1);
    expect(within(t).getByTestId('stops-done')).toHaveTextContent('3 of 10 stops done');
  });

  it('draws a one-plan Pathway as before: one bar, what remains capped', () => {
    page([mapTask({ id: 'pw', title: 'Solo' }), ...planWithPhases('solo', 'pw', ['not_started'])]);
    expect(within(tile('Solo')).queryByTestId('plan-stack')).toBeNull();
    expect(within(tile('Solo')).getAllByRole('img', { name: 'Progress by stop' })).toHaveLength(1);
  });

  it('packs tiles by height: each cell spans the grid rows its content needs', () => {
    const { tasks, deps } = sixPathwayMap();
    page(tasks, deps);
    const grid = screen.getByTestId('tile-grid');
    expect(grid.style.gridAutoRows).toBe(`${FRONT_LAYOUT.row}px`);
    const cells = screen.getAllByTestId('tile-cell');
    expect(cells).toHaveLength(6);
    // happy-dom measures 0 px: the span is the gap alone. A browser adds the tile's height.
    const gapRows = Math.ceil(FRONT_LAYOUT.gap / FRONT_LAYOUT.row);
    for (const c of cells) {
      expect(c.style.gridRowEnd).toBe(`span ${gapRows}`);
      expect(c).toHaveClass('self-start');
      expect((c.firstElementChild as HTMLElement).style.height).toBe('');
    }
  });

  it('shows a branch chip only when not main, and counts open tickets', () => {
    page([
      mapTask({ id: 'a', title: 'On side', branch: 'two-ball-oval' }),
      mapTask({ id: 'b', title: 'On main', branch: 'main' }),
      mapTask({ id: 't1', kind: 'ticket', status: 'open', pathway_id: 'a' }),
      mapTask({ id: 't2', kind: 'ticket', status: 'open', pathway_id: 'a' }),
      mapTask({ id: 't3', kind: 'ticket', status: 'complete', pathway_id: 'a' }),
    ]);
    expect(within(tile('On side')).getByTitle('Branch')).toHaveTextContent('two-ball-oval');
    expect(within(tile('On side')).getByText(/2 tickets open/)).toBeInTheDocument();
    expect(within(tile('On main')).queryByTitle('Branch')).toBeNull();
  });

  it('opens the drawer for the tile, and for a stop inside it', () => {
    const onOpen = page([
      mapTask({ id: 'pw', title: 'Oval' }),
      ...planWithPhases('oval', 'pw', ['not_started']),
    ]);
    fireEvent.click(tile('Oval'));
    expect(onOpen).toHaveBeenLastCalledWith('pw');
    fireEvent.click(
      within(tile('Oval'))
        .getByRole('list', { name: 'What remains' })

        .querySelector('li [data-item-id]') as Element,
    );
    expect(onOpen).toHaveBeenLastCalledWith('oval#P1');
  });
});

describe('SegmentedBar', () => {
  it('draws one segment per unit, coloured by its status', () => {
    const tasks = [
      mapTask({ id: 'pw' }),
      ...planWithPhases('a', 'pw', ['complete', 'in_progress', 'not_started', 'retired']),
      mapTask({ id: 'pk', kind: 'plan', status: 'parked', parent_id: 'pw', pathway_id: 'pw' }),
    ];
    const view = buildMapView(tasks, [], [], vi.fn());
    const pw = view.ix.byId.get('pw') as Task;
    const { container } = render(<SegmentedBar units={progress(view.ix, pw).units} view={view} />);
    const segs = Array.from(container.querySelectorAll('i[data-item-id]')) as HTMLElement[];
    expect(segs.map((s) => s.dataset.state)).toEqual([
      'done',
      'in_progress',
      'queued',
      'excluded',
      'parked',
    ]);
    // A retired phase is `excluded` but drawn in the faded retired green, not the dropped grey.
    const hexes = [
      STATE_STYLES.done.hex,
      STATE_STYLES.in_progress.hex,
      STATE_STYLES.queued.hex,
      RETIRED_STYLE.hex,
      STATE_STYLES.parked.hex,
    ];
    const probe = document.createElement('i');
    segs.forEach((s, i) => {
      probe.style.backgroundColor = hexes[i];
      expect(s.style.backgroundColor).toBe(probe.style.backgroundColor);
    });
    expect(segs[3].style.opacity).toBe('0.5');
  });
});

describe('InboxCard', () => {
  it('shows a promoted arrow to what it became, a pin, a link chip and an age', () => {
    const tasks = [
      mapTask({ id: 'pw', title: 'Oval' }),
      mapTask({
        id: 'f',
        kind: 'feature',
        title: 'Faster feed',
        status: 'promoted',
        promoted_to: 'plans/active/faster-feed.md',
        pathway_id: 'pw',
        links: ['https://example.org/a/b/issue-12'],
        created_at: '2026-05-03T12:00:00Z',
      }),
      mapTask({ id: 'i', kind: 'idea', title: 'Loose', status: 'inbox' }),
    ];
    const view = buildMapView(tasks, [], [], vi.fn(), new Date('2026-05-13T12:00:00Z'));
    render(
      <>
        <InboxCard task={view.ix.byId.get('f') as Task} view={view} />
        <InboxCard task={view.ix.byId.get('i') as Task} view={view} />
      </>,
    );
    const promoted = screen.getByRole('button', { name: 'Faster feed' });
    expect(within(promoted).getByTestId('promoted-to')).toHaveTextContent(
      '→ plans/active/faster-feed.md',
    );
    expect(within(promoted).getByTestId('pathway-pin')).toHaveTextContent('Oval');
    expect(within(promoted).getByRole('link')).toHaveTextContent('example.org/…/issue-12');
    expect(within(promoted).getByText('10d')).toBeInTheDocument();
    const loose = screen.getByRole('button', { name: 'Loose' });
    expect(within(loose).queryByTestId('promoted-to')).toBeNull();
    expect(within(loose).getByText('unattached')).toBeInTheDocument();
  });
});

describe('Front page CSS contract (one-scroll rule)', () => {
  /**
   * CSS CONTRACT ONLY. happy-dom does no layout (every box measures 0), so
   * this cannot observe a scrollbar; it pins the classes that make the page
   * root the one scroll box (owner, 2026-10-27). The real layout check is the
   * Firefox screenshot (`frontend/scripts/screenshot.sh`).
   */
  it('scrolls the whole page and nothing inside it', () => {
    const { tasks, deps } = sixPathwayMap();
    page(tasks, deps);

    expect(layoutSrc).toContain('flex h-full flex-col overflow-hidden');
    const root = screen.getByTestId('front-page');
    expect(root).toHaveClass('h-full', 'overflow-y-auto');
    const grid = screen.getByTestId('tile-grid');
    expect(grid).toHaveClass('grid-cols-3');
    // Every tile is drawn (no two-row cap) and the grid neither caps its height nor scrolls.
    expect(Array.from(grid.children)).toHaveLength(6);
    expect(grid.style.height).toBe('');
    expect(grid.className).not.toMatch(/overflow/);
    const wall = screen.getByTestId('inbox-wall');
    expect(wall.className).not.toMatch(/overflow|flex-1|min-h-0/);
    expect(wall.style.height).toBe('');
  });

  it('gives every inbox card the same fixed height', () => {
    const { tasks, deps } = sixPathwayMap();
    page(tasks, deps);
    const wall = screen.getByTestId('inbox-wall');
    const cards = Array.from(wall.children) as HTMLElement[];
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((c) => expect(c.style.height).toBe(`${FRONT_LAYOUT.card}px`));
  });
});

describe('Inbox wall sort (JB-77)', () => {
  const inbox = [
    mapTask({
      id: 'idea-old',
      kind: 'idea',
      status: 'inbox',
      priority: 'high',
      created_at: '2026-10-01T00:00:00Z',
    }),
    mapTask({
      id: 'bug-new',
      kind: 'bug',
      status: 'inbox',
      priority: 'low',
      created_at: '2026-10-27T00:00:00Z',
    }),
    mapTask({
      id: 'feature-newest',
      kind: 'feature',
      status: 'inbox',
      priority: 'medium',
      created_at: '2026-10-28T00:00:00Z',
    }),
  ];

  function wallOrder(): string[] {
    const wall = screen.getByTestId('inbox-wall');
    return Array.from(wall.children).map(
      (c) =>
        ['idea-old', 'bug-new', 'feature-newest'].find((id) => c.textContent?.includes(id)) ?? '?',
    );
  }

  afterEach(() => {
    window.localStorage.clear();
  });

  it('opens on severity, re-sorts on a choice and remembers it', () => {
    window.localStorage.clear();
    const { unmount } = render(
      <FrontPageView tasks={inbox} deps={[]} users={[]} onOpen={vi.fn()} />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Sort' });
    expect(within(group).getByRole('radio', { name: 'Severity' })).toBeChecked();
    expect(wallOrder()).toEqual(['idea-old', 'feature-newest', 'bug-new']);

    fireEvent.click(within(group).getByRole('radio', { name: 'Age' }));
    expect(wallOrder()).toEqual(['feature-newest', 'bug-new', 'idea-old']);
    fireEvent.click(within(group).getByRole('radio', { name: 'Type' }));
    expect(wallOrder()).toEqual(['bug-new', 'feature-newest', 'idea-old']);
    expect(window.localStorage.getItem(WALL_SORT_KEY)).toBe('{"sort":"type","reversed":false}');

    unmount();
    render(<FrontPageView tasks={inbox} deps={[]} users={[]} onOpen={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Type' })).toBeChecked();
  });

  it('clicking the active sort again reverses it, and the direction is remembered', () => {
    window.localStorage.clear();
    const { unmount } = render(
      <FrontPageView tasks={inbox} deps={[]} users={[]} onOpen={vi.fn()} />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Sort' });
    fireEvent.click(within(group).getByRole('radio', { name: /Age/ }));
    expect(wallOrder()).toEqual(['feature-newest', 'bug-new', 'idea-old']);
    fireEvent.click(within(group).getByRole('radio', { name: /Age/ }));
    expect(wallOrder()).toEqual(['idea-old', 'bug-new', 'feature-newest']);
    expect(screen.getByTestId('wall-sort-dir').textContent).toBe('\u25B2');
    unmount();
    render(<FrontPageView tasks={inbox} deps={[]} users={[]} onOpen={vi.fn()} />);
    expect(wallOrder()).toEqual(['idea-old', 'bug-new', 'feature-newest']);
  });

  it('migrates a bare stored key to its default direction', () => {
    window.localStorage.setItem(WALL_SORT_KEY, 'age');
    render(<FrontPageView tasks={inbox} deps={[]} users={[]} onOpen={vi.fn()} />);
    expect(wallOrder()).toEqual(['feature-newest', 'bug-new', 'idea-old']);
  });

  it('falls back to severity when the stored value is unknown', () => {
    window.localStorage.setItem(WALL_SORT_KEY, 'bogus');
    render(<FrontPageView tasks={inbox} deps={[]} users={[]} onOpen={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Severity' })).toBeChecked();
    // The sort control does not push the wall's header past its fixed height.
    expect(screen.getByRole('heading', { name: /Inbox wall/ }).parentElement?.style.height).toBe(
      `${FRONT_LAYOUT.wallHead}px`,
    );
  });
});

describe('Inbox wall metrics', () => {
  const rated = [
    mapTask({
      id: 'quick',
      kind: 'idea',
      status: 'inbox',
      effort: 's',
      hardware: 'none',
      owner: 'none',
      area: 'gui',
    }),
    mapTask({
      id: 'big',
      kind: 'idea',
      status: 'inbox',
      effort: 'l',
      hardware: 'robot',
      owner: 'hands',
      area: 'skill-stack',
    }),
  ];

  afterEach(() => {
    window.localStorage.clear();
  });

  it('cards show effort and hardware tags', () => {
    render(<FrontPageView tasks={rated} deps={[]} users={[]} onOpen={vi.fn()} />);
    expect(screen.getAllByTestId('tag-effort').map((e) => e.textContent)).toEqual(
      expect.arrayContaining(['S', 'L']),
    );
    expect(screen.getAllByTestId('tag-hardware').map((e) => e.textContent)).toContain('robot');
  });

  it('Break-sized and the area select narrow the wall', () => {
    render(<FrontPageView tasks={rated} deps={[]} users={[]} onOpen={vi.fn()} />);
    const wall = screen.getByTestId('inbox-wall');
    expect(wall.children).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Break-sized' }));
    expect(wall.children).toHaveLength(1);
    expect(wall.textContent).toContain('quick');
    fireEvent.click(screen.getByRole('button', { name: 'Break-sized' }));
    fireEvent.change(screen.getByLabelText('Area filter'), { target: { value: 'skill-stack' } });
    expect(wall.children).toHaveLength(1);
    expect(wall.textContent).toContain('big');
  });
});
