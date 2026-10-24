const NODE_WIDTH = 150;
const NODE_HEIGHT = 80;

/**
 * Pure placement helpers for the canvas: grid snapping, overlap
 * detection, and a spiral search for the nearest non-overlapping
 * position. Extracted from CanvasView so they can be unit-tested
 * without dragging the React Flow surface into the test setup.
 *
 * Grid size matches the visible Background dot spacing in
 * CanvasView so the snap lattice aligns with what the user sees.
 * The collision-pad keeps a small visual gap between adjacent
 * nodes — picked once and shared by drag-time, drag-stop, and
 * new-task placement so the rule is consistent everywhere.
 */
export const GRID_SIZE = 24;
export const NODE_COLLISION_PAD = 12;

export interface Positioned {
  id: string;
  canvas_x: number;
  canvas_y: number;
}

export function snapToGrid(x: number, y: number): { x: number; y: number } {
  // The `|| 0` collapses JS's `-0` (from Math.round on small negatives)
  // back to `+0` so callers and tests don't have to think about that
  // particular numeric quirk.
  const sx = Math.round(x / GRID_SIZE) * GRID_SIZE || 0;
  const sy = Math.round(y / GRID_SIZE) * GRID_SIZE || 0;
  return { x: sx, y: sy };
}

export function findOverlap<T extends Positioned>(
  tasks: T[],
  excludeId: string | null,
  pos: { x: number; y: number },
): T | null {
  for (const t of tasks) {
    if (t.id === excludeId) continue;
    if (
      Math.abs(t.canvas_x - pos.x) < NODE_WIDTH + NODE_COLLISION_PAD &&
      Math.abs(t.canvas_y - pos.y) < NODE_HEIGHT + NODE_COLLISION_PAD
    ) {
      return t;
    }
  }
  return null;
}

/** Group-drag overlap detector. For every (id, position) in `groupPositions`,
 *  find any task in `tasks` whose id is NOT in `groupPositions` that overlaps.
 *  Members of the group are excluded from collision checks against each
 *  other because the multi-select drag preserves their relative offsets —
 *  they move in lockstep and so by construction cannot collide with each
 *  other.
 *
 *  Returns the set of non-group task ids that any group member overlaps
 *  with. Empty set means the group can land at these positions cleanly.
 *  Mirrors `findOverlap`'s pad / NODE_WIDTH / NODE_HEIGHT primitive. */
export function findGroupConflicts<T extends Positioned>(
  tasks: T[],
  groupPositions: ReadonlyMap<string, { x: number; y: number }>,
): Set<string> {
  const targets = new Set<string>();
  for (const t of tasks) {
    if (groupPositions.has(t.id)) continue;
    for (const pos of groupPositions.values()) {
      if (
        Math.abs(t.canvas_x - pos.x) < NODE_WIDTH + NODE_COLLISION_PAD &&
        Math.abs(t.canvas_y - pos.y) < NODE_HEIGHT + NODE_COLLISION_PAD
      ) {
        targets.add(t.id);
        break;
      }
    }
  }
  return targets;
}

/** Spiral-search the nearest grid-aligned position that doesn't overlap
 *  any other task. Step size is one node-bounding-box plus the collision
 *  pad on each axis, snapped to the grid. ~20 rings is enough for any
 *  plausible fixture. Falls back to the snapped desired position if
 *  every nearby position is taken (the drag-overlap rule will refuse
 *  any move on top of that fallback anyway). */
export function findFreePosition<T extends Positioned>(
  tasks: T[],
  desired: { x: number; y: number },
): { x: number; y: number } {
  const start = snapToGrid(desired.x, desired.y);
  if (findOverlap(tasks, null, start) === null) return start;
  const stepX = Math.ceil((NODE_WIDTH + NODE_COLLISION_PAD) / GRID_SIZE) * GRID_SIZE;
  const stepY = Math.ceil((NODE_HEIGHT + NODE_COLLISION_PAD) / GRID_SIZE) * GRID_SIZE;
  for (let r = 1; r <= 20; r += 1) {
    for (const [dx, dy] of [
      [0, r],
      [r, 0],
      [0, -r],
      [-r, 0],
      [r, r],
      [-r, r],
      [r, -r],
      [-r, -r],
    ] as const) {
      const candidate = { x: start.x + dx * stepX, y: start.y + dy * stepY };
      if (findOverlap(tasks, null, candidate) === null) return candidate;
    }
  }
  return start;
}

/** Where a new child of `parent` lands (ADR 0084): the first free slot in
 *  the row one node-step below the parent, scanning rightwards from directly
 *  underneath it, so successive sub-tasks line up side by side as a tree
 *  row (the parent→child handle is on the node's bottom edge). Falls back
 *  to the spiral search from below the parent if that row is full. */
export function findChildPosition<T extends Positioned>(
  tasks: T[],
  parent: Positioned,
): { x: number; y: number } {
  const stepX = Math.ceil((NODE_WIDTH + NODE_COLLISION_PAD) / GRID_SIZE) * GRID_SIZE;
  const stepY = Math.ceil((NODE_HEIGHT + NODE_COLLISION_PAD) / GRID_SIZE) * GRID_SIZE;
  const below = snapToGrid(parent.canvas_x, parent.canvas_y + stepY);
  for (let i = 0; i <= 20; i += 1) {
    const candidate = { x: below.x + i * stepX, y: below.y };
    if (findOverlap(tasks, null, candidate) === null) return candidate;
  }
  return findFreePosition(tasks, below);
}
