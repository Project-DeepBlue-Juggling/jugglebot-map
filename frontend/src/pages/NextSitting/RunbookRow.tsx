import { useState } from 'react';
import clsx from 'clsx';
import type { RunbookRow as Row } from '../../api/schemas';

export interface RunbookRowProps {
  row: Row;
  today: string;
  onOpen: (taskId: string) => void;
  onSave: (taskId: string, verdict: 'pass' | 'fail', notes: string) => Promise<void>;
}

const label = 'text-xs font-semibold uppercase text-slate-500 dark:text-slate-400';

/** One hardware check: its Sitting section, and the pass / fail strip. */
export function RunbookRow({ row, today, onOpen, onSave }: RunbookRowProps) {
  const todays = row.results.filter((r) => r.date === today);
  const [adding, setAdding] = useState(todays.length === 0);
  const [verdict, setVerdict] = useState<'pass' | 'fail' | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (verdict === null) return;
    setSaving(true);
    try {
      await onSave(row.task_id, verdict, notes.trim());
      setVerdict(null);
      setNotes('');
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };
  return (
    <li
      data-testid="runbook-row"
      className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => onOpen(row.task_id)}
          className="font-mono text-sm text-sky-700 hover:underline dark:text-sky-400"
        >
          {row.short_id}
        </button>
        <span className="text-sm font-semibold">{row.title}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {row.minutes} min · {row.priority || 'unrated'} · {row.pathway_title ?? 'unattached'}
        </span>
      </div>
      <dl className="mb-3 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className={label}>why</dt>
        <dd>{row.why}</dd>
        <dt className={label}>do</dt>
        <dd>
          <ol className="list-decimal pl-5">
            {row.do.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </dd>
        <dt className={label}>pass</dt>
        <dd>{row.pass}</dd>
        <dt className={label}>record</dt>
        <dd>{row.record}</dd>
        {row.branch !== null && (
          <>
            <dt className={label}>branch</dt>
            <dd className="font-mono text-xs">{row.branch}</dd>
          </>
        )}
      </dl>
      {todays.map((r, i) => (
        <p key={i} data-testid="runbook-result" className="mb-1 text-sm">
          <span
            className={clsx(
              'font-semibold',
              r.verdict === 'pass'
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400',
            )}
          >
            {r.verdict}
          </span>
          {r.notes !== '' && <span>, {r.notes}</span>}
        </p>
      ))}
      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-slate-500 underline dark:text-slate-400"
        >
          add another
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {(['pass', 'fail'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={verdict === v}
                onClick={() => setVerdict(v)}
                className={clsx(
                  'rounded border px-3 py-1 text-sm',
                  verdict === v
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700',
                )}
              >
                {v === 'pass' ? 'Pass' : 'Fail'}
              </button>
            ))}
          </div>
          <textarea
            aria-label={`Notes for ${row.short_id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <button
            type="button"
            disabled={verdict === null || saving}
            onClick={() => void submit()}
            className="self-start rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            Save result
          </button>
        </div>
      )}
    </li>
  );
}
