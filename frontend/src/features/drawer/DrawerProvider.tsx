import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { modalIsOpen } from '../../ui/keyboard';
import { DrawerCtx, type DrawerValue } from './drawerContext';
import ItemDrawer from './ItemDrawer';

/**
 * Holds the open task id and renders the one shared drawer. Mounted once in
 * the project shell; both pages open it through `useOpenItem()`. Esc closes it
 * unless a modal dialog (the conflict dialog, the new-item modal) is in front.
 */
export function DrawerProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useCallback((id: string) => setOpenId(id), []);
  const close = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    if (openId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modalIsOpen()) setOpenId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId]);

  const value = useMemo<DrawerValue>(() => ({ openId, open, close }), [openId, open, close]);
  return (
    <DrawerCtx.Provider value={value}>
      {children}
      {openId !== null && <ItemDrawer taskId={openId} onClose={close} onOpen={open} />}
    </DrawerCtx.Provider>
  );
}
