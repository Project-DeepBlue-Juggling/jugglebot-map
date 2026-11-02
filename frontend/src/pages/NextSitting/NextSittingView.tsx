import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { Runbook, Verdict } from '../../api/schemas';
import { KindPill } from '../../ui/ShortId';
import { RigChip } from '../../ui/RigChip';
import { RunbookRow } from './RunbookRow';

export interface NextSittingViewProps {
  runbook: Runbook;
  today: string;
  onOpen: (taskId: string) => void;
  onSave: (taskId: string, verdict: Verdict, notes: string) => Promise<void>;
}

const UNATTACHED = 'unattached';

/** The page's `## Setup 0` lines, taken from the generated Markdown (the file is the source). */
function setupZero(page: string): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of page.split('\n')) {
    if (line.startsWith('## ')) inside = line.startsWith('## Setup 0');
    else if (inside && line.startsWith('- ')) out.push(line.slice(2).replace(/`/g, ''));
  }
  return out;
}

export function NextSittingView({ runbook, today, onOpen, onSave }: NextSittingViewProps) {
  const [pathway, setPathway] = useState<string | null>(null);
  const pathways = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of runbook.blocks)
      for (const r of b.rows)
        seen.set(r.pathway_short_id ?? UNATTACHED, r.pathway_title ?? UNATTACHED);
    return [...seen.entries()];
  }, [runbook]);
  const blocks = runbook.blocks
    .map((b) => ({
      ...b,
      rows: b.rows.filter(
        (r) => pathway === null || (r.pathway_short_id ?? UNATTACHED) === pathway,
      ),
    }))
    .filter((b) => b.rows.length > 0);
  const before = setupZero(runbook.page);
  const empty = runbook.blocks.length === 0;
  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-xl font-semibold">Next Sitting</h1>
      {empty ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No hardware checks waiting</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1" aria-label="Pathways">
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
          {before.length > 0 && (
            <section aria-label="Before power" className="mb-6">
              <h2 className="mb-1 text-base font-semibold">Before power</h2>
              <ul className="list-disc pl-5 text-sm">
                {before.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </section>
          )}
          {runbook.rigs.map((rig) => {
            const mine = blocks
              .map((b, n) => ({ b, n }))
              .filter(({ b }) => b.hardware === rig.hardware);
            if (mine.length === 0) return null;
            const minutes = mine.reduce(
              (m, { b }) => m + b.rows.reduce((k, r) => k + r.minutes, 0),
              0,
            );
            return (
              <section key={rig.hardware} aria-label={`Rig: ${rig.label}`} className="mb-8">
                <h2 className="mb-3 border-b border-slate-200 pb-1 text-lg font-semibold dark:border-slate-700">
                  <RigChip hardware={rig.hardware} />
                  {rig.label}{' '}
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                    {mine.length} {mine.length === 1 ? 'block' : 'blocks'} · {minutes} min
                  </span>
                </h2>
                {mine.map(({ b, n }) => (
                  <section
                    key={b.setup.join(',') + n}
                    aria-label={`Block ${n + 1}`}
                    className="mb-6"
                  >
                    <h3 className="mb-2 text-base font-semibold">
                      Setup: {b.setup.join(', ') || 'none'}{' '}
                      <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                        ({b.rows.reduce((m, r) => m + r.minutes, 0)} min)
                      </span>
                    </h3>
                    <ul className="flex flex-col gap-3">
                      {b.rows.map((r) => (
                        <RunbookRow
                          key={r.task_id}
                          row={r}
                          today={today}
                          onOpen={onOpen}
                          onSave={onSave}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
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
