import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DependencyEdge, Task } from '../../api/schemas';
import { progress } from '../../lib/derive';
import { STATE_STYLES } from '../../theme/palette';
import { dep, mapTask, planWithPhases, sixPathwayMap } from '../../test/mapFixtures';
import layoutSrc from '../../layout/AppLayout.tsx?raw';
import { FrontPageView } from './FrontPageView';
import { InboxCard } from './InboxCard';
import { buildMapView, FRONT_LAYOUT, frontPageHeight } from './mapView';
import { SegmentedBar } from './SegmentedBar';

function page(tasks: Task[], deps: DependencyEdge[] = [], onOpen = vi.fn()) {
  render(<FrontPageView tasks={tasks} deps={deps} users={[]} onOpen={onOpen} />);
  return onOpen;
}

function tile(title: string): HTMLElement {
  return screen.getByRole('button', { name: title });
}

describe('PathwayTile', () => {
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
    expect(within(tile('Map')).getByTestId('next-box')).toHaveTextContent('A locked design.');
    expect(within(tile('Map')).getByText('No plans yet')).toBeInTheDocument();
  });

  it('says nothing is ready when every open plan is parked', () => {
    page([
      mapTask({ id: 'pw', title: 'Parked only' }),
      mapTask({ id: 'pk', kind: 'plan', status: 'parked', parent_id: 'pw', pathway_id: 'pw' }),
    ]);
    expect(within(tile('Parked only')).getByTestId('next-box')).toHaveTextContent('Nothing ready');
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
    const probe = document.createElement('i');
    for (const s of segs) {
      probe.style.backgroundColor = STATE_STYLES[s.dataset.state as keyof typeof STATE_STYLES].hex;
      expect(s.style.backgroundColor).toBe(probe.style.backgroundColor);
    }
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

describe('no-scroll rule', () => {
  /**
   * happy-dom does no layout (every box measures 0), so `scrollHeight <= 900`
   * holds trivially here; the load-bearing assertions are the CSS contract:
   * the shell root (AppLayout) is `h-screen overflow-hidden`,
   * the page root is `h-full overflow-hidden`, the six tiles share one fixed
   * height in a 3-column grid of two rows, the inbox wall is a fixed-height
   * band with `overflow-y-auto`, and the fixed heights sum to under 900 px
   * less a 40 px allowance for the health banner.
   */
  it('six pathways at 1500x900 produce no document scrollbar', () => {
    const hd = (
      window as unknown as {
        happyDOM?: { setViewport(v: { width: number; height: number }): void };
      }
    ).happyDOM;
    hd?.setViewport({ width: 1500, height: 900 });
    expect(window.innerWidth).toBe(1500);
    expect(window.innerHeight).toBe(900);
    const { tasks, deps } = sixPathwayMap();
    page(tasks, deps);
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(900);

    expect(layoutSrc).toContain('flex h-screen flex-col overflow-hidden');
    const root = screen.getByTestId('front-page');
    expect(root).toHaveClass('h-full', 'overflow-hidden');
    const grid = screen.getByTestId('tile-grid');
    expect(grid).toHaveClass('grid-cols-3');
    expect(grid.style.height).toBe(`${2 * FRONT_LAYOUT.tile + FRONT_LAYOUT.gap}px`);
    const tiles = Array.from(grid.children);
    expect(tiles).toHaveLength(6);
    tiles.forEach((t) => expect((t as HTMLElement).style.height).toBe(`${FRONT_LAYOUT.tile}px`));
    const wall = screen.getByTestId('inbox-wall');
    expect(wall).toHaveClass('overflow-y-auto');
    expect(wall.style.height).toBe(`${FRONT_LAYOUT.wall}px`);
    expect(frontPageHeight()).toBeLessThanOrEqual(900 - 40);
  });
});
