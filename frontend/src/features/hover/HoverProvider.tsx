import { useMemo, useState, type ReactNode } from 'react';
import { HoverCtx } from './hoverContext';

export interface HoverProviderProps {
  /** Open blocker ids of an item (derive.openBlockers mapped to ids). */
  openBlockerIds: (id: string) => readonly string[];
  children: ReactNode;
}

/**
 * Holds the hovered item id. Every element rendered with `useItemHover(id)`
 * glows (`is-hovered`) while any element with the same id is hovered, and the
 * hovered item's open blockers get `is-blocker-of-hovered`. Nothing dims.
 */
export function HoverProvider({ openBlockerIds, children }: HoverProviderProps) {
  const [hoveredId, setHovered] = useState<string | null>(null);
  const value = useMemo(
    () => ({
      hoveredId,
      blockerIds: new Set(hoveredId === null ? [] : openBlockerIds(hoveredId)),
      setHovered,
    }),
    [hoveredId, openBlockerIds],
  );
  return <HoverCtx.Provider value={value}>{children}</HoverCtx.Provider>;
}
