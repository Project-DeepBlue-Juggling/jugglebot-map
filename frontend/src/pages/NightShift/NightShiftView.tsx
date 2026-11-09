import clsx from 'clsx';
import { useRef } from 'react';
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
  /** Resolves true when the answer was saved. */
  onAnswer: (taskId: string, answer: string) => Promise<boolean>;
}

export function NightShiftView(p: NightShiftViewProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // After a save the answered card leaves the list; the cursor goes to the next
  // question's box (or the previous one when the last was answered), ready to type
  // (BUG-46). A failed save keeps the cursor and the text where they were.
  const answerAndAdvance = async (id: string, text: string) => {
    const ids = p.questions.map((q) => q.id);
    const at = ids.indexOf(id);
    const next = ids[at + 1] ?? (at > 0 ? ids[at - 1] : undefined);
    const ok = await p.onAnswer(id, text);
    if (ok && next !== undefined) {
      listRef.current
        ?.querySelector<HTMLTextAreaElement>(`textarea[data-question-id="${CSS.escape(next)}"]`)
        ?.focus();
    }
    return ok;
  };
  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-xl font-semibold">Night Shift</h1>
      <section aria-label="Questions for the Operator" className="mb-8">
        <h2 className="mb-2 text-base font-semibold">Questions for the Operator</h2>
        {p.questions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No open questions</p>
        ) : (
          <ul ref={listRef} className="flex flex-col gap-3">
            {p.questions.map((q) => (
              <QuestionCard key={q.id} question={q} onOpen={p.onOpen} onAnswer={answerAndAdvance} />
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
            <div className="text-sm" data-testid="night-shift-report">
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
