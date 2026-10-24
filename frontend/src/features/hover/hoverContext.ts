import { createContext } from 'react';

export interface HoverValue {
  /** Pointer entered an element rendering item `id`. */
  enter: (id: string) => void;
  /** Pointer left an element rendering item `id`. */
  leave: (id: string) => void;
}

export const HoverCtx = createContext<HoverValue | null>(null);
