import { createContext } from 'react';

export interface HoverValue {
  /** The hovered item's id, or null. */
  hoveredId: string | null;
  /** Ids of the hovered item's open blockers (outlined red). */
  blockerIds: ReadonlySet<string>;
  setHovered: (id: string | null) => void;
}

export const HoverCtx = createContext<HoverValue | null>(null);
