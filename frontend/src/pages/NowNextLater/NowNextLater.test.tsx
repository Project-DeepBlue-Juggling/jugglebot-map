import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { DependencyEdge, Task } from '../../api/schemas';
import { DrawerCtx, type DrawerValue } from '../../features/drawer/drawerContext';
import { dep, mapTask, planWithPhases, sixPathwayMap } from '../../test/mapFixtures';
import layoutSrc from '../../layout/AppLayout.tsx?raw';
import { NowNextLaterView } from './NowNextLaterView';

function page(tasks: Task[], deps: DependencyEdge[] = [], onOpen = vi.fn(), wrap?: (n: ReactNode) => ReactNode) {
  const node = <NowNextLaterView tasks={tasks} deps={deps} users={[]} onOpen={onOpen} />;
  render(wrap ? wrap(node) : node);
  return onOpen;
}

const block = (title: string) => screen.getByRole('region', { name: title });

function drawerValue(openId: string | null): DrawerValue {
  return { openId, open: () => {}, close: () => {}, setSlot: () => {}, setFlush: () => {} };
}

describe('Now / Next / Later page', () => {
  it('draws a block per active Pathway and an arrived one only on the shelf', () => {
    page([
      mapTask({ id: 'a', title: 'Active one' }),
      mapTask({ id: 'b', title: 'Active two' }),
      mapTask({ id: 'z', title: 'Finished one', status: 'complete', destination: 'met 2026-10-13' }),
    ]);
    expect(screen.getAllByTestId('pathway-block')).toHaveLength(2);
    expect(block('Active one')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Finished one' })).toBeNull();
    const shelf = within(screen.getByTestId('arrived'));
    expect(shelf.getByText('Finished one')).toBeInTheDocument();
    expect(shelf.getByText(/Oct 13/)).toBeInTheDocument();
  });

  it('lists an attached bug inside its Pathway block and an unattached one only in the rail', () => {
    page([
      mapTask({ id: 'pw', title: 'Lane' }),
      mapTask({ id: 'in', kind: 'bug', status: 'inbox', title: 'Attached bug', pathway_id: 'pw' }),
      mapTask({ id: 'out', kind: 'bug', status: 'inbox', title: 'Loose bug' }),
      mapTask({ id: 'gone', kind: 'idea', status: 'inbox', title: 'Arrived idea', pathway_id: 'fin' }),
      mapTask({ id: 'fin', title: 'Fin', status: 'complete' }),
    ]);
    expect(within(within(block('Lane')).getByTestId('pw-items')).getByText('Attached bug')).toBeInTheDocument();
    const rail = within(screen.getByTestId('rail'));
    expect(rail.queryByText('Attached bug')).toBeNull();
    expect(within(screen.getByTestId('rail-bug')).getByText('Loose bug')).toBeInTheDocument();
    // An item of an arrived Pathway has no block to live in: it goes to the rail.
    expect(within(screen.getByTestId('rail-idea')).getByText('Arrived idea')).toBeInTheDocument();
    expect(screen.getAllByText('Loose bug')).toHaveLength(1);
    expect(screen.getAllByText('Attached bug')).toHaveLength(1);
  });

  it('opens an item on a chip click', () => {
    const onOpen = page([
      mapTask({ id: 'pw', title: 'Lane' }),
      ...planWithPhases('p', 'pw', ['not_started', 'not_started']),
    ]);
    fireEvent.click(within(block('Lane')).getByRole('button', { name: /Phase 1 of p/ }));
    expect(onOpen).toHaveBeenCalledWith('p#P1');
  });

  it('rings the chip whose item is open in the drawer', () => {
    const tasks = [mapTask({ id: 'pw', title: 'Lane' }), ...planWithPhases('p', 'pw', ['not_started', 'not_started'])];
    page(tasks, [], vi.fn(), (n) => <DrawerCtx.Provider value={drawerValue('p#P2')}>{n}</DrawerCtx.Provider>);
    const chips = within(block('Lane')).getAllByRole('button', { name: /Phase \d of p/ });
    const ring = (el: HTMLElement) => (el.querySelector('span[title]') as HTMLElement).style.boxShadow;
    expect(ring(chips[1])).not.toBe('');
    expect(ring(chips[0])).toBe('');
  });

  it('shows a Later stage as its own line and hovering lights the same item elsewhere', () => {
    page([
      mapTask({ id: 'pw', title: 'Lane' }),
      ...planWithPhases('p', 'pw', ['in_progress', 'not_started', 'not_started']),
    ]);
    expect(within(block('Lane')).getAllByText(/Phase 3 of p/).length).toBeGreaterThan(0);
    const targets = [...document.querySelectorAll('[data-item-id="p#P3"]')];
    fireEvent.pointerEnter(targets[0]);
    for (const el of document.querySelectorAll('[data-item-id="p#P3"]')) expect(el).toHaveClass('is-hovered');
  });

  it('outlines the open blocker of a hovered item', () => {
    page(
      [
        mapTask({ id: 'pw', title: 'Lane' }),
        mapTask({ id: 'blk', kind: 'ticket', title: 'Blocker tk', pathway_id: 'pw' }),
        mapTask({ id: 'x', kind: 'feature', status: 'backlog', title: 'Blocked feat', pathway_id: 'pw' }),
      ],
      [dep('blk', 'x')],
    );
    const item = document.querySelector('[data-item-id="x"]') as Element;
    fireEvent.pointerEnter(item);
    for (const c of document.querySelectorAll('[data-item-id="blk"]')) {
      expect(c).toHaveClass('is-blocker-of-hovered');
    }
  });

  it('names a plan by its title up to the colon, never its slug', () => {
    page([
      mapTask({ id: 'pw', title: 'Lane' }),
      ...planWithPhases('slug-of-plan', 'pw', ['not_started'], { title: 'Nice plan: subtitle' }),
    ]);
    expect(screen.queryByText('slug-of-plan')).toBeNull();
    expect(within(block('Lane')).getByText('Nice plan')).toBeInTheDocument();
  });

  /**
   * CSS CONTRACT ONLY: happy-dom does no layout, so this pins the classes
   * (shell `h-full overflow-hidden` inside #root, which index.css sizes to the viewport / --app-zoom, page root `h-full overflow-hidden`,
   * the rail's inner lists `overflow-y-auto`). The real check is the Firefox
   * 1500x900 screenshot (`frontend/scripts/screenshot.sh`).
   */
  it('CSS contract: six Pathways fit inside the page, not the document', () => {
    const { tasks, deps } = sixPathwayMap();
    page(tasks, deps);
    expect(screen.getAllByTestId('pathway-block')).toHaveLength(6);
    expect(layoutSrc).toContain('flex h-full flex-col overflow-hidden');
    expect(screen.getByTestId('nnl-page')).toHaveClass('h-full', 'overflow-hidden');
    expect(screen.getByTestId('blocks')).toHaveClass('overflow-hidden');
  });
});

describe('Key', () => {
  const keyText = () => within(screen.getByTestId('key')).getByTestId('key-body').textContent ?? '';
  const mixed = (blocked: boolean) => [
    mapTask({ id: 'pw', title: 'Lane' }),
    ...planWithPhases('p', 'pw', ['complete', blocked ? 'blocked' : 'in_progress', 'not_started']),
  ];

  it('always lists the five stage states', () => {
    page(mixed(false));
    for (const term of ['done', 'now', 'next', 'later', 'T']) expect(keyText()).toContain(term);
  });

  it('lists blocked only when a blocked stage is drawn', () => {
    page(mixed(false));
    expect(keyText()).not.toContain('blocked');
    expect(keyText()).not.toContain('parked');
    expect(keyText()).not.toContain('Arrived');
    document.body.innerHTML = '';
    page(mixed(true));
    expect(keyText()).toContain('blocked');
  });

  it('lists Arrived and parked only while drawn and never the capsule or phase-less entries', () => {
    page([
      ...mixed(false),
      mapTask({ id: 'fin', title: 'Fin', status: 'complete' }),
      ...planWithPhases('pk', 'pw', ['not_started'], { status: 'parked' }),
      ...planWithPhases('dn', 'pw', ['complete'], { status: 'complete' }),
    ]);
    expect(keyText()).toContain('Arrived');
    expect(keyText()).toContain('parked');
    expect(keyText()).not.toContain('not drawn');
    expect(keyText()).not.toContain('without phases');
    expect(keyText()).not.toMatch(/colou?r|hover/);
  });

  it('toggles from its header and survives a storage failure', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    page(mixed(false));
    const head = within(screen.getByTestId('key')).getByRole('button', { name: /Key/ });
    expect(() => fireEvent.click(head)).not.toThrow();
    spy.mockRestore();
  });
});
