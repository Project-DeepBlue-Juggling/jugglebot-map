import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DependencyEdge, Task } from '../../api/schemas';
import { STATE_STYLES } from '../../theme/palette';
import { dep, mapTask, planWithPhases, sixPathwayMap } from '../../test/mapFixtures';
import layoutSrc from '../../layout/AppLayout.tsx?raw';
import { NowNextLaterView } from './NowNextLaterView';

function page(tasks: Task[], deps: DependencyEdge[] = [], onOpen = vi.fn()) {
  render(<NowNextLaterView tasks={tasks} deps={deps} users={[]} onOpen={onOpen} />);
  return onOpen;
}

const lane = (title: string) => screen.getByRole('region', { name: title });

describe('Now / Next / Later page', () => {
  it('renders the plan card phase chips P1..Pn in their status colours', () => {
    page([
      mapTask({ id: 'pw', title: 'Oval' }),
      ...planWithPhases('big', 'pw', ['complete', 'in_progress', 'not_started'], {
        status: 'parked',
        title: 'Big plan: with a long subtitle',
      }),
    ]);
    const card = within(lane('Oval')).getByRole('button', {
      name: 'Big plan: with a long subtitle',
    });
    expect(within(card).getByText('Big plan')).toBeInTheDocument();
    expect(within(card).getByTestId('parked-marker')).toBeInTheDocument();
    const chips = within(card).getAllByTestId('phase-chip');
    expect(chips.map((c) => c.textContent)).toEqual(['P1', 'P2', 'P3']);
    expect(chips.map((c) => c.getAttribute('data-state'))).toEqual([
      'done',
      'in_progress',
      'queued',
    ]);
    expect(chips[0]).toHaveStyle({ backgroundColor: STATE_STYLES.done.hex });
    expect(chips[1]).toHaveStyle({ backgroundColor: STATE_STYLES.in_progress.hex });
  });

  it('puts a claimed ticket in Now and an open one in Later', () => {
    page([
      mapTask({ id: 'pw', title: 'Lane' }),
      mapTask({
        id: 'mine',
        kind: 'ticket',
        title: 'Claimed',
        status: 'open',
        assignee_ids: ['u1'],
        pathway_id: 'pw',
      }),
      mapTask({ id: 'free', kind: 'ticket', title: 'Free one', status: 'open', pathway_id: 'pw' }),
    ]);
    const l = lane('Lane');
    expect(within(within(l).getByTestId('col-now')).getByText('Claimed')).toBeInTheDocument();
    expect(within(within(l).getByTestId('col-later')).getByText('Free one')).toBeInTheDocument();
    expect(within(within(l).getByTestId('col-later')).queryByText('Claimed')).toBeNull();
  });

  it('shows an unattached idea in the rail and an attached one in its lane Later', () => {
    page([
      mapTask({ id: 'pw', title: 'Lane' }),
      mapTask({ id: 'loose', kind: 'idea', status: 'inbox', title: 'Loose idea' }),
      mapTask({
        id: 'pinned',
        kind: 'idea',
        status: 'inbox',
        title: 'Pinned idea',
        pathway_id: 'pw',
      }),
    ]);
    expect(within(screen.getByTestId('rail-idea')).getByText('Loose idea')).toBeInTheDocument();
    expect(within(screen.getByTestId('rail')).queryByText('Pinned idea')).toBeNull();
    expect(
      within(within(lane('Lane')).getByTestId('col-later')).getByText('Pinned idea'),
    ).toBeInTheDocument();
  });

  it('rings the computed-next card and opens a card on click', () => {
    const onOpen = page([
      mapTask({ id: 'pw', title: 'Lane' }),
      ...planWithPhases('p', 'pw', ['not_started', 'not_started']),
    ]);
    const ringed = lane('Lane').querySelector('[data-isnext="true"]');
    expect(ringed).not.toBeNull();
    fireEvent.click(within(ringed as HTMLElement).getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('p#P1');
  });

  it('glows lane header and card together and outlines the open blocker', () => {
    page(
      [
        mapTask({ id: 'pw', title: 'Lane' }),
        mapTask({ id: 'blk', kind: 'ticket', title: 'Blocker tk', pathway_id: 'pw' }),
        mapTask({ id: 'pw2', title: 'Other lane' }),
        mapTask({
          id: 'x',
          kind: 'feature',
          status: 'backlog',
          title: 'Blocked feat',
          pathway_id: 'pw2',
        }),
      ],
      [dep('blk', 'x')],
    );
    const header = screen.getByRole('button', { name: 'Lane' });
    const cards = [...document.querySelectorAll('[data-item-id="x"]')];
    expect(cards.length).toBeGreaterThan(0);
    fireEvent.mouseOver(cards[0]);
    for (const c of document.querySelectorAll('[data-item-id="x"]')) {
      expect(c).toHaveClass('is-hovered');
    }
    for (const c of document.querySelectorAll('[data-item-id="blk"]')) {
      expect(c).toHaveClass('is-blocker-of-hovered');
    }
    fireEvent.mouseOut(cards[0]);
    fireEvent.mouseOver(header);
    expect(header).toHaveClass('is-hovered');
    expect(header).toHaveAttribute('data-item-id', 'pw');
  });

  /**
   * happy-dom does no layout, so this asserts the CSS contract: the shell root
   * is `h-screen overflow-hidden`, the page root `h-full overflow-hidden`, and
   * lanes and rail scroll internally (`overflow-y-auto`), with six pathways.
   */
  it('does not scroll the document with six pathways', () => {
    const { tasks, deps } = sixPathwayMap();
    page(tasks, deps);
    expect(screen.getAllByTestId('lane')).toHaveLength(6);
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(900);
    expect(layoutSrc).toContain('flex h-screen flex-col overflow-hidden');
    expect(screen.getByTestId('nnl-page')).toHaveClass('h-full', 'overflow-hidden');
    expect(screen.getByTestId('lanes')).toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('rail')).toHaveClass('overflow-y-auto');
  });
});
