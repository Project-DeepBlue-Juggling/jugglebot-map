import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { modalIsOpen } from '../../ui/keyboard';
import { DrawerCtx, type DrawerValue } from './drawerContext';
import ItemDrawer from './ItemDrawer';

/** How many history entries the drawer has pushed on top of the page. */
interface DrawerState {
  drawerDepth?: number;
}

/**
 * The open item is URL state: `?item=<id>` on the current page. Opening pushes
 * a history entry (so Back closes it, and in-drawer links walk back through the
 * items); closing goes back over every entry the drawer pushed, or, for a pasted
 * `?item=` URL where none were pushed, replaces the URL without the parameter.
 * Esc closes unless a modal dialog is in front.
 */
export function DrawerProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const openId = new URLSearchParams(location.search).get('item') || null;
  const depth = (location.state as DrawerState | null)?.drawerDepth ?? 0;

  const open = useCallback(
    (id: string) => {
      const params = new URLSearchParams(location.search);
      params.set('item', id);
      const state: DrawerState = { drawerDepth: openId === null ? 1 : depth + 1 };
      navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { state });
    },
    [location.pathname, location.search, openId, depth, navigate],
  );

  const close = useCallback(() => {
    if (depth > 0) {
      navigate(-depth);
      return;
    }
    const params = new URLSearchParams(location.search);
    params.delete('item');
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search === '' ? '' : `?${search}` },
      { replace: true },
    );
  }, [depth, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (openId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modalIsOpen()) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId, close]);

  const value = useMemo<DrawerValue>(
    () => ({ openId, open, close, setSlot }),
    [openId, open, close],
  );
  const drawer =
    openId === null ? null : (
      <ItemDrawer taskId={openId} onClose={close} onOpen={open} docked={slot !== null} />
    );
  return (
    <DrawerCtx.Provider value={value}>
      {children}
      {drawer !== null && (slot === null ? drawer : createPortal(drawer, slot))}
    </DrawerCtx.Provider>
  );
}
