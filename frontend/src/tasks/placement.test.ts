import { describe, expect, it } from 'vitest';
const NODE_WIDTH = 150;
const NODE_HEIGHT = 80;
import {
  findChildPosition,
  findFreePosition,
  findGroupConflicts,
  findOverlap,
  GRID_SIZE,
  NODE_COLLISION_PAD,
  snapToGrid,
} from './placement';

/**
 * polish: placement helpers. Snap-to-grid, overlap detection, spiral
 * search for the nearest free spot. Unit-tested directly because the
 * canvas-level e2e for new-task placement is fragile due to React
 * Flow's fit-view zoom math — the pure logic doesn't need the canvas
 * at all.
 */

function task(id: string, x: number, y: number) {
  return { id, canvas_x: x, canvas_y: y };
}

describe('polish: snapToGrid', () => {
  it('snaps to the nearest 24 px grid intersection', () => {
    expect(snapToGrid(0, 0)).toEqual({ x: 0, y: 0 });
    // 13/24 ≈ 0.54 → rounds up; 11/24 ≈ 0.46 → rounds down.
    expect(snapToGrid(13, 11)).toEqual({ x: GRID_SIZE, y: 0 });
    expect(snapToGrid(-13, -11)).toEqual({ x: -GRID_SIZE, y: 0 });
    expect(snapToGrid(35, 49)).toEqual({ x: 24, y: 48 });
  });
});

describe('polish: findOverlap', () => {
  it('returns the colliding task or null', () => {
    const tasks = [task('a', 0, 0), task('b', 400, 0)];
    expect(findOverlap(tasks, null, { x: 0, y: 0 })?.id).toBe('a');
    expect(findOverlap(tasks, null, { x: 400, y: 0 })?.id).toBe('b');
    expect(findOverlap(tasks, null, { x: 1000, y: 1000 })).toBeNull();
  });

  it('respects the breathing-room pad and excludes the dragging node', () => {
    const tasks = [task('a', 0, 0)];
    // Just inside the pad → overlap.
    expect(findOverlap(tasks, null, { x: NODE_WIDTH + NODE_COLLISION_PAD - 1, y: 0 })?.id).toBe(
      'a',
    );
    // Just outside the pad → clear.
    expect(findOverlap(tasks, null, { x: NODE_WIDTH + NODE_COLLISION_PAD, y: 0 })).toBeNull();
    // Same id → excluded.
    expect(findOverlap(tasks, 'a', { x: 0, y: 0 })).toBeNull();
  });
});

describe('canvas: findGroupConflicts (multi-select group drag)', () => {
  it('returns an empty set when the group lands in clear space', () => {
    const tasks = [task('a', 0, 0), task('b', 400, 0), task('c', 1000, 1000)];
    const group = new Map([
      ['a', { x: 0, y: 400 }],
      ['b', { x: 400, y: 400 }],
    ]);
    expect(findGroupConflicts(tasks, group)).toEqual(new Set());
  });

  it('flags every non-group task that any group member would land on', () => {
    const tasks = [
      task('a', 0, 0),
      task('b', 400, 0),
      task('blocker-1', 0, 200),
      task('blocker-2', 400, 200),
      task('clear', 2000, 2000),
    ];
    // Group {a, b} drops onto blocker-1/blocker-2's positions.
    const group = new Map([
      ['a', { x: 0, y: 200 }],
      ['b', { x: 400, y: 200 }],
    ]);
    expect(findGroupConflicts(tasks, group)).toEqual(new Set(['blocker-1', 'blocker-2']));
  });

  it('excludes group members from colliding with each other', () => {
    // Two stacked group members. They keep their offsets through the
    // drag (xyflow preserves relative position in multi-drag), but
    // since they are both in the group neither one should report a
    // conflict against the other.
    const tasks = [task('a', 0, 0), task('b', 400, 0)];
    const group = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 400, y: 0 }],
    ]);
    expect(findGroupConflicts(tasks, group)).toEqual(new Set());
  });

  it('respects the breathing-room pad like the single-node check', () => {
    // Blocker at (300, 0); the group consists of just `a`. Walk through
    // the same conflict / no-conflict boundary findOverlap is tested at
    // (NODE_WIDTH + NODE_COLLISION_PAD on the x axis), but applied to
    // the group helper so the pad math stays in lockstep.
    const tasks = [task('blocker', 300, 0)];
    // Just inside the pad → conflict.
    expect(
      findGroupConflicts(
        tasks,
        new Map([['a', { x: 300 - (NODE_WIDTH + NODE_COLLISION_PAD - 1), y: 0 }]]),
      ),
    ).toEqual(new Set(['blocker']));
    // Just outside the pad → clear.
    expect(
      findGroupConflicts(
        tasks,
        new Map([['a', { x: 300 - (NODE_WIDTH + NODE_COLLISION_PAD), y: 0 }]]),
      ),
    ).toEqual(new Set());
  });
});

describe('polish: findFreePosition', () => {
  it('returns the desired position (snapped) when it is already clear', () => {
    expect(findFreePosition([], { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });

  it('avoids overlapping an existing task and lands on the grid', () => {
    const tasks = [task('a', 0, 0)];
    const result = findFreePosition(tasks, { x: 5, y: 5 });
    // Result is grid-aligned.
    expect(result.x % GRID_SIZE).toBe(0);
    expect(result.y % GRID_SIZE).toBe(0);
    // Result does not overlap the existing task.
    expect(findOverlap(tasks, null, result)).toBeNull();
  });

  it('finds a free spot even when the desired location is surrounded', () => {
    // Six neighbours around the desired position. Spiral should still
    // find an opening.
    const stepX = Math.ceil((NODE_WIDTH + NODE_COLLISION_PAD) / GRID_SIZE) * GRID_SIZE;
    const stepY = Math.ceil((NODE_HEIGHT + NODE_COLLISION_PAD) / GRID_SIZE) * GRID_SIZE;
    const tasks = [
      task('centre', 0, 0),
      task('n', 0, -stepY),
      task('s', 0, stepY),
      task('e', stepX, 0),
      task('w', -stepX, 0),
    ];
    const result = findFreePosition(tasks, { x: 0, y: 0 });
    expect(findOverlap(tasks, null, result)).toBeNull();
  });
});

describe('findChildPosition (ADR 0084)', () => {
  const stepX = Math.ceil((NODE_WIDTH + NODE_COLLISION_PAD) / GRID_SIZE) * GRID_SIZE;
  const stepY = Math.ceil((NODE_HEIGHT + NODE_COLLISION_PAD) / GRID_SIZE) * GRID_SIZE;

  it('lands directly one row below the parent when that slot is free', () => {
    const parent = task('p', 240, 96);
    expect(findChildPosition([parent], parent)).toEqual({ x: 240, y: 96 + stepY });
  });

  it('lines successive children up to the right in the row below', () => {
    const parent = task('p', 0, 0);
    const first = task('c1', 0, stepY);
    const second = task('c2', stepX, stepY);
    expect(findChildPosition([parent, first], parent)).toEqual({ x: stepX, y: stepY });
    expect(findChildPosition([parent, first, second], parent)).toEqual({
      x: 2 * stepX,
      y: stepY,
    });
  });

  it('snaps an off-grid parent onto the grid', () => {
    const parent = task('p', 13, 5);
    const pos = findChildPosition([parent], parent);
    expect(pos.x % GRID_SIZE).toBe(0);
    expect(pos.y % GRID_SIZE).toBe(0);
  });

  it('falls back to a free spot when the whole row below is taken', () => {
    const parent = task('p', 0, 0);
    const row = Array.from({ length: 21 }, (_, i) => task(`r${i}`, i * stepX, stepY));
    const tasks = [parent, ...row];
    const pos = findChildPosition(tasks, parent);
    expect(findOverlap(tasks, null, pos)).toBeNull();
  });
});
