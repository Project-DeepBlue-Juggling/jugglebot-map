import { Fragment, useEffect } from 'react';
import { SHORTCUT_ROWS, type ShortcutRow } from './shortcutRows';

/**
 * Cheat-sheet modal listing exactly the key bindings that exist in this app.
 * Opened by `s` or the sidebar button; Esc / click-outside / x close it.
 *
 * Every row below is wired somewhere (`SHORTCUT_ROWS`, in shortcutRows.ts, drives the
 * AppLayout test that presses each listed key and sees its handler fire):
 * `s` and `n` in layout/AppLayout, Esc in DrawerProvider / NewItemModal /
 * this dialog / the profile popover, Enter on a focused card or tag in
 * pages/FrontPage/bits (Openable). Add a binding and a row together.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsDialog({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-heading"
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Cap the panel to the viewport and lay it out as a column with a
          scrolling body, so a short window scrolls the shortcut list instead
          of clipping it top and bottom (issue #127). Mirrors NewTaskModal. */}
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-white shadow-lg dark:bg-slate-800 dark:text-slate-100">
        <header className="flex items-center justify-between px-5 pb-4 pt-5">
          <h2 id="shortcuts-heading" className="text-lg font-semibold">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts dialog"
            className="rounded px-2 text-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
          >
            ×
          </button>
        </header>
        <div className="overflow-auto px-5 pb-5">
          <Section title="Keys" rows={SHORTCUT_ROWS} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: ShortcutRow[] }) {
  return (
    <section className="mb-3 last:mb-0">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map((row) => (
          <Fragment key={row.description}>
            <dt className="flex items-center gap-1">
              {row.keys.map((k, i) => (
                <kbd
                  key={i}
                  className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                >
                  {k}
                </kbd>
              ))}
            </dt>
            <dd className="text-slate-700 dark:text-slate-300">{row.description}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}
