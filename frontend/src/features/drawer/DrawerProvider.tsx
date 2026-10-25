import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTasks } from '../../api/hooks';
import { itemParam, resolveItemParam } from '../../lib/shortId';
import { modalIsOpen } from '../../ui/keyboard';
import { DrawerCtx, type DrawerValue } from './drawerContext';
import ItemDrawer from './ItemDrawer';

const INTERACTIVE =
  'a, button, input, textarea, select, label, summary, [role="button"], [role="dialog"], [role="listbox"], [role="option"], [role="menu"], [role="status"], [role="alert"]';

/** How many history entries the drawer has pushed on top of the page. */
interface DrawerState {
  drawerDepth?: number;
}

/**
 * The open item is URL state: `?item=<ref>` on the current page, where an Item
 * is written by its short ID (`?item=JB-12`) and a plan or phase by its uuid; a
 * pasted `?item=jb12`, `?item=12` or uuid resolves to the same drawer. An Item
 * not yet pushed is written by its uuid (its short ID may still be renumbered),
 * and the URL takes the `JB-` form once the push lands. Opening pushes
 * a history entry (so Back closes it, and in-drawer links walk back through the
 * items); closing goes back over every entry the drawer pushed, or, for a pasted
 * `?item=` URL where none were pushed, replaces the URL without the parameter.
 * Esc closes unless a modal dialog is in front, and so does a click on empty
 * space outside the drawer. Every close and every switch to another item first
 * saves the form's unsaved edits; a failed or conflicting save keeps it open.
 */
export function DrawerProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const tasks = useTasks().data;
  const param = new URLSearchParams(location.search).get('item') || null;
  // Always the task uuid: callers compare it with `task.id`.
  const openId = param === null ? null : resolveItemParam(tasks, param);
  const depth = (location.state as DrawerState | null)?.drawerDepth ?? 0;
  // The element that opened the drawer: focus returns to it on close.
  const opener = useRef<Element | null>(null);
  const flush = useRef<(() => boolean | Promise<boolean>) | null>(null);
  const setFlush = useCallback((fn: (() => boolean | Promise<boolean>) | null) => {
    flush.current = fn;
  }, []);
  /** Runs `then` once unsaved edits are saved; never if the save failed. */
  const afterSave = (then: () => void) => {
    const r = flush.current === null ? true : flush.current();
    if (r === true) then();
    else if (r !== false) void r.then((ok) => ok && then());
  };

  const open = useCallback(
    (id: string) => {
      if (openId === null) opener.current = document.activeElement;
      const go = () => {
        const params = new URLSearchParams(location.search);
        params.set('item', itemParam(tasks, id));
        const state: DrawerState = { drawerDepth: openId === null ? 1 : depth + 1 };
        navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { state });
      };
      if (id === openId) go();
      else afterSave(go);
    },
    [location.pathname, location.search, openId, depth, navigate, tasks],
  );

  const close = useCallback(() => {
    afterSave(() => {
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
    });
  }, [depth, location.pathname, location.search, navigate]);

  // Keep the URL on the open Item's settled name: an unpushed Item's uuid (a
  // renumber must not swap the drawer to another Item), then `JB-n` once pushed.
  const settled = openId === null ? null : itemParam(tasks, openId);
  useEffect(() => {
    if (param === null || settled === null || settled === param) return;
    const t = tasks?.find((x) => x.id === openId);
    if (t === undefined || t.short_id === null) return; // plans, phases, unknown: as typed
    if (!t.unpushed && param !== t.id) return; // a pushed Item by any short-ID form: as typed
    const params = new URLSearchParams(location.search);
    params.set('item', settled);
    navigate(
      { pathname: location.pathname, search: `?${params.toString()}` },
      { replace: true, state: location.state as DrawerState | null },
    );
  }, [param, settled, openId, tasks, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (openId !== null) return;
    const el = opener.current;
    opener.current = null;
    if (el instanceof HTMLElement && el.isConnected && el !== document.body) el.focus();
  }, [openId]);

  useEffect(() => {
    if (openId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modalIsOpen()) close();
    };
    // Empty space only: a control or another item does its own thing (an item
    // click switches the drawer to it, saving first via `open`).
    const onDown = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el === null || modalIsOpen()) return;
      if (el.closest('[aria-label="Item drawer"], [data-item-id], ' + INTERACTIVE) !== null) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [openId, close]);

  const value = useMemo<DrawerValue>(
    () => ({ openId, open, close, setSlot, setFlush }),
    [openId, open, close, setFlush],
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
