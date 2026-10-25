import { createContext } from 'react';

/**
 * What Markdown needs to turn `JB-<n>` mentions into links: the known short IDs
 * (`JB-12` -> uuid) and the drawer's opener. Only the item drawer provides it;
 * elsewhere (the nightly report, the Dictionary) IDs stay plain text.
 */
export interface ItemLinks {
  ids: ReadonlyMap<string, string>;
  open: (taskId: string) => void;
}

export const ItemLinkCtx = createContext<ItemLinks | null>(null);

/** The href a linkified mention carries (a hash URL: react-markdown keeps it). */
export const ITEM_HREF_PREFIX = '#item-ref/';
