import { createContext } from 'react';

/**
 * What Markdown needs to turn short-ID (`BUG-<n>`, `FEAT-<n>`, ...) mentions into links: the known short IDs
 * (`BUG-12` -> uuid) and the drawer's opener. The item drawer and the Night Shift page
 * provide it; elsewhere (the Dictionary) IDs stay plain text.
 */
export interface ItemLinks {
  ids: ReadonlyMap<string, string>;
  /** `BUG-12` -> kind and ticket type, for the pill before a linked mention. */
  kinds: ReadonlyMap<string, { kind: string; ticketType: string | null }>;
  open: (taskId: string) => void;
}

export const ItemLinkCtx = createContext<ItemLinks | null>(null);

/** The href a linkified mention carries (a hash URL: react-markdown keeps it). */
export const ITEM_HREF_PREFIX = '#item-ref/';
