import { createContext, useContext } from 'react';

export interface DrawerValue {
  openId: string | null;
  open: (taskId: string) => void;
  close: () => void;
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
