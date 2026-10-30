import clsx from 'clsx';
import type { NightShiftQuestion, NightShiftReportEntry } from '../../api/schemas';
import Markdown from '../../ui/Markdown';
import { QuestionCard } from './QuestionCard';

export interface NightShiftViewProps {
  reports: readonly NightShiftReportEntry[];
  date: string | null;
  onPick: (date: string) => void;
  report: string | undefined;
  reportError: string | null;
  questions: readonly NightShiftQuestion[];
  onOpen: (taskId: string) => void;
  onAnswer: (taskId: string, answer: string) => Promise<void>;
}

export function NightShiftView(p: NightShiftViewProps) {
  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-xl font-semibold">Night Shift</h1>
      <section aria-label="Questions for the Operator" className="mb-8">
        <h2 className="mb-2 text-base font-semibold">Questions for the Operator</h2>
        {p.questions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No open questions</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {p.questions.map((q) => (
              <QuestionCard key={q.id} question={q} onOpen={p.onOpen} onAnswer={p.onAnswer} />
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Reports">
        <h2 className="mb-2 text-base font-semibold">Reports</h2>
        {p.reports.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No reports yet</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-1">
              {p.reports.map((r) => (
                <button
                  key={r.date}
                  type="button"
                  aria-pressed={r.date === p.date}
                  onClick={() => p.onPick(r.date)}
                  className={clsx(
                    'rounded border px-2 py-0.5 text-xs',
                    r.date === p.date
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700',
                  )}
                >
                  {r.date}
                </button>
              ))}
            </div>
            <div className="max-w-3xl text-sm" data-testid="night-shift-report">
              {p.reportError !== null && (
                <p className="text-slate-500">Report unavailable: {p.reportError}</p>
              )}
              {p.report !== undefined && <Markdown source={p.report} />}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
