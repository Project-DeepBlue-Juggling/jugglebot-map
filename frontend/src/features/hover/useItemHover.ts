import { useContext, type MouseEvent } from 'react';
import clsx from 'clsx';
import { HoverCtx } from './hoverContext';

export interface ItemHoverProps {
  'data-item-id': string;
  className: string;
  onMouseOver: (e: MouseEvent) => void;
  onMouseOut: () => void;
}

/**
 * Props for an element that renders item `id`: spread them onto the element
 * (merge your own classes with `clsx(props.className, ...)`). The innermost
 * element under the pointer wins (mouseover bubbles and is stopped here), so a
 * dep tag inside a card highlights the tag's item, not the card's. Outside a
 * HoverProvider the props are inert.
 */
export function useItemHover(id: string): ItemHoverProps {
  const ctx = useContext(HoverCtx);
  return {
    'data-item-id': id,
    className: clsx(
      ctx?.hoveredId === id && 'is-hovered',
      ctx?.blockerIds.has(id) === true && 'is-blocker-of-hovered',
    ),
    onMouseOver: (e) => {
      e.stopPropagation();
      if (ctx !== null && ctx.hoveredId !== id) ctx.setHovered(id);
    },
    onMouseOut: () => ctx?.setHovered(null),
  };
}
