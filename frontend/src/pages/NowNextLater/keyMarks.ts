import type { Journey } from '../../lib/journey';
import type { Level } from './layout';

/** Which optional marks are drawn on the page right now; the Key lists only these (plus the five stage states). */
export interface KeyDrawn {
  blocked: boolean;
  parked: boolean;
  queued: boolean;
  outside: boolean;
  arrived: boolean;
  items: boolean;
}

/** Scans the blocks as laid out (`levels[i]` is block i's chosen layout) for the marks the Key may explain. */
export function keyDrawn(
  journeys: readonly Journey[],
  levels: readonly Level[],
  arrived: boolean,
  items: boolean,
): KeyDrawn {
  const out: KeyDrawn = {
    blocked: false,
    parked: false,
    queued: false,
    outside: false,
    arrived,
    items,
  };
  journeys.forEach((j, i) => {
    const lv = levels[i];
    const tracks = j.plans.slice(0, lv?.tracks ?? j.plans.length);
    for (const g of tracks) {
      if (g.stations.some((s) => s.state === 'blocked')) out.blocked = true;
    }
    if (j.tickets.some((s) => s.state === 'blocked')) out.blocked = true;
    if (j.parked.length > 0) out.parked = true;
    if (j.plans.length > tracks.length) out.queued = true;
    if (j.external !== null) out.outside = true;
  });
  return out;
}
