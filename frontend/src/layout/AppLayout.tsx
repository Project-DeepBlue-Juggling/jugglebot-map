import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useEventStream } from '../api/eventStream';
import { HealthBanner } from './HealthBanner';
import { useNightShiftSummary, useProjects, useRunbook } from '../api/hooks';
import NewItemModal from '../features/drawer/NewItemModal';
import { ActiveProjectProvider } from '../projects/ActiveProjectContext';
import { hasModifier, isShortcutTarget, modalIsOpen } from '../ui/keyboard';
import { KeyboardShortcutsDialog } from '../ui/KeyboardShortcutsDialog';

function navClass({ isActive }: { isActive: boolean }) {
  return clsx(
    'rounded px-3 py-2 text-sm',
    isActive
      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
  );
}

export default function AppLayout() {
  useEventStream();
  const location = useLocation();
  const { data: projects } = useProjects();
  const { data: nightShift } = useNightShiftSummary();
  const openQuestions = nightShift?.open_questions ?? 0;
  const { data: runbook } = useRunbook();
  const sittingRows = runbook?.blocks.reduce((n, b) => n + b.rows.length, 0) ?? 0;
  // The server has exactly one project; the nav links point at it.
  const fromPath = location.pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null;
  const projectId = fromPath ?? projects?.[0]?.id ?? null;

  // Plain `s` toggles the keyboard cheat-sheet.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // "+ New" button and plain `n` open the five-field new-item modal.
  const [newOpen, setNewOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isShortcutTarget() || hasModifier(e)) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if ((e.key === 'n' || e.key === 'N') && !modalIsOpen()) {
        e.preventDefault();
        setNewOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <HealthBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        <aside className="flex w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-6 flex shrink-0 items-center justify-between px-2">
            <div className="text-lg font-semibold">Jugglebot map</div>
          </div>
          {projectId !== null && (
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              title="New item (n)"
              className="mb-3 shrink-0 rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              + New
            </button>
          )}
          <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {projectId !== null && (
              <>
                <NavLink to={`/projects/${projectId}`} end className={navClass}>
                  Front page
                </NavLink>
                <NavLink to={`/projects/${projectId}/now`} className={navClass}>
                  Now / Next / Later
                </NavLink>
                <NavLink to={`/projects/${projectId}/done`} className={navClass}>
                  Done
                </NavLink>
                <NavLink
                  to={`/projects/${projectId}/night-shift`}
                  className={(s) => clsx(navClass(s), 'flex items-center justify-between')}
                >
                  Night Shift
                  {openQuestions > 0 && (
                    <span
                      data-testid="night-shift-badge"
                      aria-label={`${openQuestions} open questions`}
                      className="ml-2 rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white"
                    >
                      {openQuestions}
                    </span>
                  )}
                </NavLink>
                <NavLink
                  to={`/projects/${projectId}/next-sitting`}
                  className={(s) => clsx(navClass(s), 'flex items-center justify-between')}
                >
                  Next Sitting
                  {sittingRows > 0 && (
                    <span
                      data-testid="next-sitting-badge"
                      aria-label={`${sittingRows} hardware checks`}
                      className="ml-2 rounded-full bg-sky-600 px-1.5 text-xs font-medium text-white"
                    >
                      {sittingRows}
                    </span>
                  )}
                </NavLink>
                <NavLink to={`/projects/${projectId}/dictionary`} className={navClass}>
                  Dictionary
                </NavLink>
              </>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts (s)"
            aria-label="Show keyboard shortcuts"
            className="mt-2 flex shrink-0 items-center justify-center gap-2 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[10px] text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
              s
            </kbd>
            Keyboard shortcuts
          </button>
        </aside>
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </main>
        {newOpen && projectId !== null && (
          <ActiveProjectProvider projectId={projectId}>
            <NewItemModal onClose={() => setNewOpen(false)} />
          </ActiveProjectProvider>
        )}
        <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </div>
    </div>
  );
}
