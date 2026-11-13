import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { NightShiftReportEntry, NightShiftRun } from '../../api/schemas';
import { groupByMonth, rowCells } from './reportPicker';

export interface ReportPickerProps {
  /** Newest first, as the server lists them. */
  reports: readonly NightShiftReportEntry[];
  date: string | null;
  onPick: (date: string) => void;
  unknownDate?: string | null | undefined;
  lastRun?: NightShiftRun | null | undefined;
}

const BTN =
  'rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ' +
  'dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';

/** One grid for the closed button and every row, so the columns line up between them. */
const GRID =
  'grid items-baseline gap-x-3 grid-cols-[6.5rem_4.75rem_3.75rem_6rem_3.25rem] ' +
  'max-[480px]:grid-cols-[5.5rem_3.75rem_3rem_4.75rem_auto] max-[480px]:gap-x-2';

function Row({ r, latest }: { r: NightShiftReportEntry; latest: boolean }) {
  const c = rowCells(r);
  return (
    <>
      <span className="whitespace-nowrap">{c.day}</span>
      {c.noCounts && c.status !== null ? (
        <span className="col-span-3 truncate text-amber-700 dark:text-amber-400">{c.status}</span>
      ) : (
        c.counts.map((k) => (
          <span
            key={k.cell}
            className="whitespace-nowrap text-right tabular-nums"
            data-cell={k.cell}
          >
            {k.n === null ? '–' : k.n}{' '}
            <span data-unit className="text-slate-500 dark:text-slate-400">
              {k.unit}
            </span>
          </span>
        ))
      )}
      <span className="text-right text-[0.7rem] uppercase tracking-wide">
        {latest ? (
          <span className="rounded bg-blue-100 px-1 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            Latest
          </span>
        ) : !c.noCounts && c.status !== null ? (
          <span className="text-amber-700 dark:text-amber-400">{c.status}</span>
        ) : null}
      </span>
    </>
  );
}

/**
 * The report picker: previous / listbox / next, a Latest link off the newest report, a
 * notice for an unknown `?date=`, and the runner's last run so a night with no report shows.
 * A custom listbox (not a native select) because a select cannot align columns in a
 * proportional font: every row is one grid, so merged / held / questions line up.
 */
export function ReportPicker(p: ReportPickerProps) {
  const dates = p.reports.map((r) => r.date);
  const at = p.date === null ? -1 : dates.indexOf(p.date);
  const latest = dates[0];
  const onLatest = at === 0;
  const older = at >= 0 ? dates[at + 1] : undefined;
  const newer = at > 0 ? dates[at - 1] : undefined;
  const run = p.lastRun ?? null;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const uid = useId();
  const optId = (i: number) => `${uid}-opt-${i}`;
  const groups = groupByMonth(p.reports);
  const selected = at >= 0 ? p.reports[at] : undefined;

  const [narrow, setNarrow] = useState<{ top: number } | null>(null);
  const show = () => {
    const r = button.current?.getBoundingClientRect();
    setNarrow(r !== undefined && window.innerWidth <= 480 ? { top: r.bottom + 4 } : null);
    setActive(Math.max(at, 0));
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const choose = (i: number) => {
    const r = p.reports[i];
    if (r !== undefined) p.onPick(r.date);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const down = (e: MouseEvent) => {
      if (wrap.current !== null && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const last = p.reports.length - 1;
  const onButtonKey = (e: KeyboardEvent) => {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      show();
    }
  };
  const onListKey = (e: KeyboardEvent) => {
    const go = (i: number) => {
      e.preventDefault();
      setActive(Math.min(Math.max(i, 0), last));
    };
    if (e.key === 'ArrowDown') go(active + 1);
    else if (e.key === 'ArrowUp') go(active - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(last);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') close(false);
  };

  let idx = -1;
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Older report"
          disabled={older === undefined}
          onClick={() => older !== undefined && p.onPick(older)}
          className={BTN}
        >
          ‹
        </button>
        <div ref={wrap} className="relative max-w-full">
          <button
            ref={button}
            type="button"
            aria-label="Report date"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => (open ? close(false) : show())}
            onKeyDown={onButtonKey}
            className={`${GRID} w-full max-[480px]:[&_[data-unit]]:hidden overflow-hidden rounded border border-slate-300 bg-white px-2 py-1 text-left text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100`}
          >
            {selected !== undefined ? (
              <Row r={selected} latest={at === 0} />
            ) : (
              <span className="col-span-5 text-slate-500">Choose a report</span>
            )}
          </button>
          {open && (
            <ul
              ref={list}
              role="listbox"
              tabIndex={-1}
              aria-label="Reports"
              aria-activedescendant={optId(active)}
              onKeyDown={onListKey}
              style={narrow !== null ? { top: narrow.top } : undefined}
              className={`z-20 max-h-72 overflow-auto rounded border border-slate-300 bg-white py-1 text-sm text-slate-800 shadow-lg outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 ${
                narrow !== null ? 'fixed inset-x-2' : 'absolute left-0 top-full mt-1 min-w-full'
              }`}
            >
              {groups.map((g) => (
                <li key={g.label} role="presentation">
                  <div
                    role="presentation"
                    className="sticky top-0 bg-white px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  >
                    {g.label}
                  </div>
                  <ul role="group" aria-label={g.label}>
                    {g.reports.map((r) => {
                      idx += 1;
                      const i = idx;
                      return (
                        <li
                          key={r.date}
                          id={optId(i)}
                          role="option"
                          aria-selected={r.date === p.date}
                          onMouseMove={() => active !== i && setActive(i)}
                          onClick={() => choose(i)}
                          className={`${GRID} cursor-pointer px-2 py-1 ${
                            i === active ? 'bg-blue-100 dark:bg-slate-700' : ''
                          } ${r.date === p.date ? 'text-blue-700 dark:text-blue-300' : ''}`}
                        >
                          <Row r={r} latest={r.date === latest} />
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          aria-label="Newer report"
          disabled={newer === undefined}
          onClick={() => newer !== undefined && p.onPick(newer)}
          className={BTN}
        >
          ›
        </button>
        {!onLatest && latest !== undefined && (
          <button
            type="button"
            onClick={() => p.onPick(latest)}
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            Latest
          </button>
        )}
      </div>
      {p.unknownDate != null && (
        <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          No report for {p.unknownDate}; showing the latest.
        </p>
      )}
      {run !== null && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" data-testid="last-run">
          Last run: {run.date}
          {run.status != null ? ` ${run.status}` : ''}
        </p>
      )}
    </div>
  );
}
