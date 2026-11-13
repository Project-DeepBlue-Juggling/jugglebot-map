import { useRef } from 'react';
import type { NightShiftQuestion, NightShiftReportEntry, NightShiftRun } from '../../api/schemas';
import Markdown from '../../ui/Markdown';
import { QuestionCard } from './QuestionCard';
import { ReportPicker } from './ReportPicker';

export interface NightShiftViewProps {
  reports: readonly NightShiftReportEntry[];
  date: string | null;
  onPick: (date: string) => void;
  /** The `?date=` the URL asked for when no report has it (the latest is shown instead). */
  unknownDate?: string | null | undefined;
  /** The runner's newest history line, when the server has a history file. */
  lastRun?: NightShiftRun | null | undefined;
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
            <ReportPicker
              reports={p.reports}
              date={p.date}
              onPick={p.onPick}
              unknownDate={p.unknownDate}
              lastRun={p.lastRun}
            />
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
