import { useEffect, useRef, type RefObject } from 'react';
import { modalIsOpen } from './keyboard';

/** What ended the edit: a click elsewhere, `Ctrl`/`⌘`+`Enter`, or `Esc`. */
export type DismissReason = 'click-out' | 'shortcut' | 'escape';

/**
 * A click outside a dirty panel, held while the panel saves.
 *
 * `pending` while the save is in flight; `refused` once it failed before
 * the click arrived, so the click is swallowed when it does.
 */
interface HeldClick {
  settled: 'pending' | 'refused';
  target: HTMLElement | null;
}

/**
 * Leaving an edit panel saves it, and `Ctrl`/`⌘`+`Enter` or `Esc` does the
 * same.
 *
 * The convention this app already had and the BOM and catalogue panels
 * did not follow: [ADR 0012](../../../docs/adr/0012-task-detail-panel.md)'s
 * click-out auto-save, and [ADR 0047](../../../docs/adr/0047-ctrl-enter-saves-and-returns-to-navigation.md)'s
 * save-and-return keystroke. `TaskDetailPanel` implements both directly,
 * because it also has to host a conflict dialog and re-sync server-derived
 * schedule fields.
 *
 * **None of that applies here**, which is why this is a hook rather than
 * a copy. Catalogue and BOM writes are unaudited and last-write-wins
 * ([ADR 0077 §12](../../../docs/adr/0077-bom-and-parts-catalogue.md)), so
 * there is no `if_unchanged_since`, no 409 to reconcile and no dialog to
 * keep mounted. What is left is the gesture itself.
 *
 * The details, each of which was a way to lose an edit (#207):
 *
 * - **A clean panel closes without saving.** Firing a write because
 *   somebody opened a row and clicked away would put their name on
 *   `updated_by` for a change they did not make — and `updated_by` is
 *   the entire change record this feature has (§12).
 * - **A refused save keeps the panel open.** `save` resolves `false` when
 *   the server said no (having said why, in a toast), and the panel stays
 *   with every edit still in it. Closing anyway threw them all away.
 * - **The click that left a dirty panel is held, then delivered.** The
 *   save is async, so a click on another BOM row used to open that row
 *   *during* the save, and the close that followed shut it again. Now the
 *   click waits: it is delivered once the save lands, so one click both
 *   saves this row and opens the next, and swallowed if the save is
 *   refused, so the page does not move out from under the failed panel.
 * - **A keyboard "click" counts as leaving too.** `Enter` on a focused row
 *   or button elsewhere fires a click with no pointer behind it
 *   (`detail === 0`); while the panel is dirty it is held the same way.
 * - **`Esc` saves and closes, through the same path.** Discarding on `Esc`
 *   would be the one gesture that silently loses an edit. It fires only
 *   while focus is in the panel or nowhere in particular, so `Esc` in a
 *   field elsewhere on the page keeps meaning whatever it means there.
 * - **Clicks on a toast or a dialog are not "outside",** and neither key
 *   fires while a modal dialog is in front of the panel: `Ctrl+Enter` in
 *   the Move dialog must not also save and close the line behind it.
 */
export function useSaveOnDismiss({
  panelRef,
  isDirty,
  save,
  close,
  enabled = true,
}: {
  panelRef: RefObject<HTMLElement | null>;
  isDirty: boolean;
  /** Resolves `true` once the write landed, `false` if it was refused.
   *  Raises its own toast either way. */
  save: (reason: DismissReason) => Promise<boolean>;
  close: () => void;
  enabled?: boolean;
}): void {
  // The handlers are re-created on every keystroke (they close over the
  // draft), so the listeners read them through a ref and subscribe once.
  // Without this, every character typed would detach and re-attach a
  // document listener.
  const latest = useRef({ isDirty, save, close, enabled });
  latest.current = { isDirty, save, close, enabled };

  // Blocks a second dismissal starting before the first settles — a
  // double click-out, or Ctrl+Enter during a click-out's save.
  const busy = useRef(false);
  const held = useRef<HeldClick | null>(null);
  // Set while a held click is re-dispatched, so the capture listener
  // lets its own replay through.
  const replaying = useRef(false);

  useEffect(() => {
    function isOutside(target: HTMLElement): boolean {
      if (panelRef.current?.contains(target)) return false;
      // A toast is how the save reports itself and a dialog is modal
      // over the panel; neither is "outside" in the sense that means
      // "the user has finished here".
      if (target.closest('[role="dialog"]')) return false;
      if (target.closest('[aria-live="polite"]')) return false;
      return true;
    }

    async function dismiss(reason: DismissReason, click: HeldClick | null): Promise<void> {
      const { isDirty: dirty, save: doSave, close: doClose } = latest.current;
      if (busy.current) return;
      if (!dirty) {
        doClose();
        return;
      }
      busy.current = true;
      held.current = click;
      try {
        const saved = await doSave(reason);
        if (!saved) {
          // Already swallowed if it arrived; otherwise swallow it when it
          // does, so the page stays where the failed panel is.
          if (click !== null) {
            if (click.target === null) click.settled = 'refused';
            else if (held.current === click) held.current = null;
          }
          return;
        }
        if (held.current === click) held.current = null;
        doClose();
        const target = click?.target ?? null;
        if (target?.isConnected) {
          replaying.current = true;
          try {
            target.click();
          } finally {
            replaying.current = false;
          }
        }
      } finally {
        busy.current = false;
      }
    }

    function onPointerDown(event: MouseEvent): void {
      if (!latest.current.enabled || busy.current) return;
      // A new gesture: whatever an earlier one left behind is moot.
      held.current = null;
      const target = event.target as HTMLElement | null;
      if (target === null || !isOutside(target)) return;
      void dismiss('click-out', { settled: 'pending', target: null });
    }

    function onClick(event: MouseEvent): void {
      if (replaying.current || !latest.current.enabled) return;
      const target = event.target as HTMLElement | null;
      const gesture = held.current;
      if (gesture !== null) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (gesture.settled === 'pending') gesture.target = target;
        else held.current = null;
        return;
      }
      // Enter or Space on a focused control: a click with no pointer
      // behind it, which no mousedown announced.
      if (event.detail !== 0 || target === null || !isOutside(target)) return;
      if (!latest.current.isDirty && !busy.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (busy.current) return;
      void dismiss('click-out', { settled: 'pending', target });
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (!latest.current.enabled) return;
      if (modalIsOpen(panelRef.current)) return;
      if (event.key === 'Escape') {
        const focused = document.activeElement;
        const inPanel =
          focused === null ||
          focused === document.body ||
          (panelRef.current?.contains(focused) ?? false);
        if (inPanel) void dismiss('escape', null);
        return;
      }
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
      if (event.altKey || event.shiftKey) return;
      // Deliberately not focus-gated: firing from inside a field is the
      // whole gesture (ADR 0047).
      event.preventDefault();
      void dismiss('shortcut', null);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [panelRef]);
}

/**
 * `Enter` or `Ctrl`/`⌘`+`Enter` commits a single-line creation field.
 *
 * Plain `Enter` is the convention for a one-line input and already
 * worked; the modifier is accepted too so the "commit this" gesture is
 * the same everywhere, including on the panels where plain `Enter`
 * cannot mean commit because the field is multi-line (ADR 0047).
 */
export function isCommitKey(event: { key: string; altKey: boolean; shiftKey: boolean }): boolean {
  // `ctrlKey` and `metaKey` are deliberately *not* read: both plain
  // `Enter` and `Ctrl`/`⌘`+`Enter` commit here, so testing them would
  // only be able to reject one of the two gestures this accepts. Taking
  // them as parameters and ignoring them would read as a bug.
  //
  // `Alt` and `Shift` are rejected, because `Shift+Enter` means "newline"
  // wherever it means anything at all, and a creation field that consumed
  // it would be surprising the first time somebody pasted into one.
  return event.key === 'Enter' && !event.altKey && !event.shiftKey;
}
