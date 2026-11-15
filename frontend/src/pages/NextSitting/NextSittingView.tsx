import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { Runbook, Verdict } from '../../api/schemas';
import { KindPill } from '../../ui/ShortId';
import { RigChip } from '../../ui/RigChip';
import { RunbookRow } from './RunbookRow';

export interface NextSittingViewProps {
  runbook: Runbook;
  onOpen: (taskId: string) => void;
  onSave: (taskId: string, verdict: Verdict, notes: string) => Promise<boolean>;
  /** Sheet picker and the way back, shown on the frozen title line. */
  toolbar?: ReactNode;
}

const UNATTACHED = 'unattached';

export function NextSittingView({ runbook, onOpen, onSave, toolbar }: NextSittingViewProps) {
  const [pathway, setPathway] = useState<string | null>(null);
  const pathways = useMemo(() => {
    const seen = new Map<string, string>();
    for (const g of runbook.rigs)
      for (const r of g.rows)
        seen.set(r.pathway_short_id ?? UNATTACHED, r.pathway_title ?? UNATTACHED);
    return [...seen.entries()];
  }, [runbook]);
  const rigs = runbook.rigs
    .map((g) => ({
      ...g,
      rows: g.rows.filter(
        (r) => pathway === null || (r.pathway_short_id ?? UNATTACHED) === pathway,
      ),
    }))
    .filter((g) => g.rows.length > 0);
  const empty = runbook.rigs.length === 0;
  return (
    <div className="px-6 pb-6">
      <div
        data-testid="runbook-banner"
        className="sticky top-0 z-30 -mx-6 mb-4 border-b border-slate-200 bg-slate-50 px-6 pb-2 pt-6 dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Next Sitting</h1>
          {toolbar}
        </div>
        {!empty && (
          <div className="mt-2 flex flex-wrap gap-1" aria-label="Pathways">
            {[[null, 'All'] as const, ...pathways].map(([id, name]) => (
              <button
                key={id ?? 'all'}
                type="button"
                aria-pressed={pathway === id}
                onClick={() => setPathway(id)}
                className={clsx(
                  'rounded-full border px-2 py-0.5 text-xs',
                  pathway === id
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700',
                )}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      {empty ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No hardware checks waiting</p>
      ) : (
        <>
          {rigs.map((rig) => {
            const minutes = rig.rows.reduce((k, r) => k + r.minutes, 0);
            const items = rig.rows.length;
            return (
              <section key={rig.hardware} aria-label={`Rig: ${rig.label}`} className="mb-8">
                <h2 className="mb-3 border-b border-slate-200 pb-1 text-lg font-semibold dark:border-slate-700">
                  <RigChip hardware={rig.hardware} />
                  {rig.label}{' '}
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                    {items} {items === 1 ? 'Item' : 'Items'} · {minutes} min
                  </span>
                </h2>
                <ul className="flex flex-col gap-3">
                  {rig.rows.map((r) => (
                    <RunbookRow key={r.task_id} row={r} onOpen={onOpen} onSave={onSave} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
      {runbook.needs_section.length > 0 && (
        <section aria-label="Needs a Sitting section" className="mb-6">
          <h2 className="mb-1 text-base font-semibold">Needs a Sitting section</h2>
          {/* An invisible table: rig, kind, ID, title and reason each line up in
              their own column, with no rules drawn (owner, 2026-11-01). */}
          <table className="text-sm">
            <tbody>
              {runbook.needs_section.map((n) => (
                <tr key={n.task_id} className="align-baseline">
                  <td className="py-0.5 pr-2 whitespace-nowrap">
                    <RigChip hardware={n.hardware} />
                  </td>
                  <td className="py-0.5 pr-1 whitespace-nowrap">
                    {n.kind != null && <KindPill kind={n.kind} ticketType={n.ticket_type} />}
                  </td>
                  <td className="py-0.5 pr-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpen(n.task_id)}
                      className="font-mono text-sky-700 hover:underline dark:text-sky-400"
                    >
                      {n.short_id}
                    </button>
                  </td>
                  <td className="py-0.5 pr-4">{n.title}</td>
                  <td className="py-0.5 whitespace-nowrap text-slate-500">{n.errors.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {runbook.questions.length > 0 && (
        <section aria-label="Questions a Sitting can answer">
          <h2 className="mb-1 text-base font-semibold">Questions a Sitting can answer</h2>
          <ul className="text-sm">
            {runbook.questions.map((q) => (
              <li key={q.task_id}>
                <KindPill kind={q.kind} ticketType={q.ticket_type} />
                <button
                  type="button"
                  onClick={() => onOpen(q.task_id)}
                  className="font-mono text-sky-700 hover:underline dark:text-sky-400"
                >
                  {q.short_id}
                </button>{' '}
                {q.title}{' '}
                <span className="text-slate-500">
                  (parent{' '}
                  {q.parent_kind != null && (
                    <KindPill kind={q.parent_kind} ticketType={q.parent_ticket_type} />
                  )}
                  {q.parent_short_id})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
