import { useContext } from 'react';
import { HoverCtx } from './hoverContext';

export interface ItemHoverProps {
  'data-item-id': string;
  className: string;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

/**
 * Props for an element that renders item `id`: spread them onto the element
 * (merge your own classes with `clsx(props.className, ...)`). The hover classes
 * are applied by the HoverProvider straight on the DOM, so `className` is
 * constant. pointerenter/leave do not bubble: nested elements (a dep tag in a
 * card) each push their own id and the innermost one under the pointer wins.
 * Outside a HoverProvider the props are inert.
 */
export function useItemHover(id: string): ItemHoverProps {
  const ctx = useContext(HoverCtx);
  return {
    'data-item-id': id,
    className: '',
    onPointerEnter: () => ctx?.enter(id),
    onPointerLeave: () => ctx?.leave(id),
  };
}
