import type { NightShiftReportEntry, NightShiftRun } from '../../api/schemas';
import { groupByMonth, optionLabel } from './reportPicker';

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

/**
 * The report picker: previous / select / next, a Latest link off the newest report, a
 * notice for an unknown `?date=`, and the runner's last run so a night with no report shows.
 * One native select (optgroups by month) stays one control however many nights pile up.
 */
export function ReportPicker(p: ReportPickerProps) {
  const dates = p.reports.map((r) => r.date);
  const at = p.date === null ? -1 : dates.indexOf(p.date);
  const latest = dates[0];
  const onLatest = at === 0;
  const older = at >= 0 ? dates[at + 1] : undefined;
  const newer = at > 0 ? dates[at - 1] : undefined;
  const run = p.lastRun ?? null;
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
        <select
          aria-label="Report date"
          value={p.date ?? ''}
          onChange={(e) => p.onPick(e.target.value)}
          className="max-w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          {groupByMonth(p.reports).map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.reports.map((r) => (
                <option key={r.date} value={r.date}>
                  {optionLabel(r, r.date === latest)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
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
