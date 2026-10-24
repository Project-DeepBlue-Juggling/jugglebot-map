import { Fragment, useEffect } from 'react';

/**
 * Cheat-sheet modal for the keyboard shortcuts defined in ADR 0019.
 * Opened by `s` or by clicking the "?" button in the sidebar. Esc /
 * click-outside / × all close it. Pure presentation: the bindings
 * themselves are wired into ListPage / CanvasView / TaskDetailPanel /
 * AppLayout / AvailabilityPage — the dialog just lists what those
 * bindings do.
 *
 * **Undo is two different mechanisms and the list has to say so**
 * (ADR 0067 §3, §3a). Inside a project, Ctrl+Z is
 * `POST /projects/{id}/undo` — server-side, durable across a reload, and
 * with **no redo at all** (`useUndo` returns early on Shift). On the
 * Team Calendar it is a client-side stack of captured inverses, per tab,
 * lost on reload, and it *does* have redo on Ctrl+Shift+Z. They are
 * therefore separate sections rather than one row: the two keystrokes
 * look identical and behave differently, and a cheat sheet that flattened
 * them would teach the wrong expectation about which survives a refresh.
 * The Team Calendar is workspace-level and mounts no project, so only one
 * of the two is ever listening.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Row {
  keys: string[];
  description: string;
}

const GLOBAL_ROWS: Row[] = [
  { keys: ['s'], description: 'Show this dialog' },
  {
    keys: ['Ctrl', 'z'],
    description: 'Undo the last edit in this project — kept on the server, and no redo',
  },
  { keys: ['Ctrl', 'k'], description: 'Focus the global task search' },
  { keys: ['Enter'], description: "Edit the open task (focus the detail panel's Title field)" },
  {
    keys: ['Ctrl', 'Enter'],
    description:
      'Save your edits and return to navigating — or, in the New task form, create the task',
  },
  { keys: ['Esc'], description: 'Close the frontmost dialog or panel' },
];

const LIST_ROWS: Row[] = [
  { keys: ['N'], description: 'New task' },
  { keys: ['/'], description: 'Focus the assignee filter' },
];

const CANVAS_ROWS: Row[] = [
  { keys: ['N'], description: 'New task (at viewport centre)' },
  { keys: ['/'], description: 'Focus the highlight filter' },
  {
    keys: ['↑', '↓', '←', '→'],
    description: 'Move selection to the nearest task in that direction',
  },
  {
    keys: ['Shift', 'Drag'],
    description: 'Select a group of tasks (drag a box over empty canvas)',
  },
  { keys: ['Drag'], description: 'Pan the canvas (drag empty space; or hold Space and drag)' },
  { keys: ['Scroll'], description: 'Zoom the canvas around the cursor' },
];

const TIMELINE_ROWS: Row[] = [
  { keys: ['↑', '↓'], description: 'Move selection to the row immediately above / below' },
  {
    keys: ['←', '→'],
    description: 'Move selection within the row (or pan when no bar is focused)',
  },
  { keys: ['Shift', '←', '→'], description: 'Nudge the focused bar back / forward by one day' },
  { keys: ['Enter'], description: 'Open the focused bar in the detail panel' },
  { keys: ['Scroll'], description: 'Scroll the page / lanes vertically' },
  { keys: ['Shift', 'Scroll'], description: 'Pan the chart horizontally' },
  { keys: ['Ctrl', 'Scroll'], description: 'Zoom the time axis around the cursor' },
];

const TEAM_CALENDAR_ROWS: Row[] = [
  {
    keys: ['Ctrl', 'z'],
    description: 'Undo your last change to your own entries — this tab only, lost on reload',
  },
  { keys: ['Ctrl', 'Shift', 'z'], description: 'Redo the change you have just undone' },
];

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
          <Section title="Global" rows={GLOBAL_ROWS} />
          <Section title="List view" rows={LIST_ROWS} />
          <Section title="Canvas view" rows={CANVAS_ROWS} />
          <Section title="Timeline view" rows={TIMELINE_ROWS} />
          <Section title="Team Calendar" rows={TEAM_CALENDAR_ROWS} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
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
