import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { HoverCtx, type HoverValue } from './hoverContext';

export interface HoverProviderProps {
  /** Open blocker ids of an item (derive.openBlockers mapped to ids). */
  openBlockerIds: (id: string) => readonly string[];
  children: ReactNode;
}

const HOVERED = 'is-hovered';
const BLOCKER = 'is-blocker-of-hovered';

function itemElements(id: string): Element[] {
  return Array.from(document.querySelectorAll('[data-item-id]')).filter(
    (el) => el.getAttribute('data-item-id') === id,
  );
}

/**
 * Tracks which item is hovered and glows every element that renders it
 * (`is-hovered`), outlining the item's open blockers (`is-blocker-of-hovered`).
 * Nothing dims.
 *
 * Pointer enter/leave push and pop a stack, and the top of the stack is the
 * hovered item, so a dep tag inside a card wins while the pointer is on it and
 * the card is restored when the pointer comes back out. The classes are toggled
 * directly on the DOM nodes rather than through React state: a hover change
 * re-renders nothing, so no card is re-created or re-styled mid-hover (that
 * re-render was the flicker).
 */
export function HoverProvider({ openBlockerIds, children }: HoverProviderProps) {
  const stack = useRef<string[]>([]);
  const marked = useRef<Element[]>([]);
  const blockersOf = useRef(openBlockerIds);
  useEffect(() => {
    blockersOf.current = openBlockerIds;
  }, [openBlockerIds]);

  const value = useMemo<HoverValue>(() => {
    const paint = () => {
      for (const el of marked.current) el.classList.remove(HOVERED, BLOCKER);
      marked.current = [];
      const top = stack.current[stack.current.length - 1];
      if (top === undefined) return;
      for (const el of itemElements(top)) {
        el.classList.add(HOVERED);
        marked.current.push(el);
      }
      for (const b of blockersOf.current(top)) {
        for (const el of itemElements(b)) {
          el.classList.add(BLOCKER);
          marked.current.push(el);
        }
      }
    };
    return {
      enter: (id) => {
        stack.current.push(id);
        paint();
      },
      leave: (id) => {
        const i = stack.current.lastIndexOf(id);
        if (i !== -1) stack.current.splice(i, 1);
        paint();
      },
    };
  }, []);

  return <HoverCtx.Provider value={value}>{children}</HoverCtx.Provider>;
}
