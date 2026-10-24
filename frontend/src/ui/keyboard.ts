/**
 * Shared keyboard-shortcut helpers (ADR 0019).
 *
 * The focus-gating rule: shortcuts fire only when the active element
 * absorbs the key as a command rather than as text input. Form inputs
 * (input / textarea / select) and contenteditable elements are exempt
 * so typing 'N' into a Title field stays a literal N.
 *
 * Esc is the exception — every panel / modal / dialog listens for Esc
 * unconditionally so the user can dismiss even from inside an input.
 */

export function isShortcutTarget(): boolean {
  const el = document.activeElement;
  if (el === null || el === document.body) return true;
  if (el instanceof HTMLInputElement) return false;
  if (el instanceof HTMLTextAreaElement) return false;
  if (el instanceof HTMLSelectElement) return false;
  if (el.getAttribute('contenteditable') === 'true') return false;
  return true;
}

/** True when any of Ctrl, Cmd, or Alt is held. We don't bind modifier
 *  combos in v1 — the modifier-key space is reserved for Phase 6+. */
export function hasModifier(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}

/** True when a modal-mode dialog is currently mounted somewhere on the
 *  page. Non-modal panels (the task-detail aside, the profile popover)
 *  use this to ignore Esc while something more focused is in front of
 *  them — establishing the Esc precedence committed to in ADR 0019.
 *
 *  Pass `self` — any node inside the asking component — to mean "is
 *  something in front of *me*", and a dialog that **contains** that node
 *  stops counting. Without it, a component rendered inside a modal reads
 *  its own wrapper as "a modal is in front of me" and silently disables
 *  every binding it gates this way. That is not hypothetical: the My
 *  tasks page opens the Task detail panel inside a dialog (ADR 0076 §8),
 *  and the panel gates Esc-to-close, Ctrl+Enter save-and-return and
 *  Enter-to-focus-title on this helper being false.
 *
 *  Containment, not identity, is the right test. A `ConflictDialog`
 *  mounted *inside* the panel does not contain the panel, so it still
 *  counts — which is exactly the case those three gates were written
 *  for. Called with no argument, behaviour is unchanged. */
export function modalIsOpen(self?: Node | null): boolean {
  const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  for (const dialog of dialogs) {
    if (self != null && dialog.contains(self)) continue;
    return true;
  }
  return false;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep `Tab` and `Shift+Tab` inside a modal dialog.
 *
 * Call from the dialog's `keydown`. On the last focusable control `Tab`
 * wraps to the first, and on the first `Shift+Tab` wraps to the last, so
 * a keyboard user cannot tab out into the page the dialog is modal over
 * -- where a keystroke would act on something they can no longer see
 * (F34 of the 2026-10 review, for the BOM's Move dialog).
 */
export function trapTab(
  event: { key: string; shiftKey: boolean; preventDefault: () => void },
  container: HTMLElement | null,
): void {
  if (event.key !== 'Tab' || container === null) return;
  const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}
