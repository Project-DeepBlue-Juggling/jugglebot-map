import { createContext, useContext } from 'react';

export interface DrawerValue {
  openId: string | null;
  open: (taskId: string) => void;
  close: () => void;
  /** Set by a page's `<DrawerSlot />`: the drawer docks there instead of overlaying. */
  setSlot: (el: HTMLElement | null) => void;
  /**
   * Set by the drawer's edit form: saves unsaved edits and resolves false when
   * the save failed or raised a conflict, so the drawer stays open. A clean form
   * answers `true` synchronously, so closing it stays instant.
   */
  setFlush: (fn: (() => boolean | Promise<boolean>) | null) => void;
}

export const DrawerCtx = createContext<DrawerValue | null>(null);

/** The opener both pages receive as `onOpen`; a no-op outside a provider. */
export function useOpenItem(): (taskId: string) => void {
  const ctx = useContext(DrawerCtx);
  return ctx === null ? () => {} : ctx.open;
}

export function useDrawer(): DrawerValue | null {
  return useContext(DrawerCtx);
}
