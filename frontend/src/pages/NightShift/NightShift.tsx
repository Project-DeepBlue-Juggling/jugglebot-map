import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useAnswerQuestion,
  useNightShiftQuestions,
  useNightShiftReport,
  useNightShiftReports,
  useNightShiftRuns,
  useTasks,
} from '../../api/hooks';
import { ApiError } from '../../api/client';
import { ItemLinkCtx, type ItemLinks } from '../../ui/itemLinks';
import { shortIdIndex, shortIdKinds } from '../../lib/shortId';
import { useToast } from '../../ui/useToast';
import { NightShiftView } from './NightShiftView';

const noop = () => {};

export interface NightShiftProps {
  /** Opens the shared drawer for a task (the shell wires the drawer). */
  onOpen?: (taskId: string) => void;
}

/** The Night Shift route: loads reports and open questions, renders the view. */
export default function NightShift({ onOpen = noop }: NightShiftProps) {
  const reports = useNightShiftReports();
  const questions = useNightShiftQuestions();
  const answer = useAnswerQuestion();
  const toast = useToast();
  const runs = useNightShiftRuns();
  const [params, setParams] = useSearchParams();
  const latest = reports.data?.[0]?.date ?? null;
  const asked = params.get('date');
  // `?date=` names the report; a date with no report falls back to the latest, with a notice.
  const known = asked !== null && (reports.data ?? []).some((r) => r.date === asked);
  const date = known ? asked : latest;
  const unknownDate = asked !== null && !known && reports.data !== undefined ? asked : null;
  // Pushed (not replaced) so Back returns to the previous report; the newest is the bare URL.
  const onPick = useCallback(
    (d: string) => {
      const next = new URLSearchParams(params);
      if (d === latest) next.delete('date');
      else next.set('date', d);
      setParams(next);
    },
    [params, latest, setParams],
  );
  const report = useNightShiftReport(date);
  const tasks = useTasks();
  // Short IDs (`BUG-<n>`, per kind) in the report and the question bodies link to that Item, with its kind pill.
  const itemLinks = useMemo<ItemLinks>(
    () => ({ ids: shortIdIndex(tasks.data), kinds: shortIdKinds(tasks.data), open: onOpen }),
    [tasks.data, onOpen],
  );

  if (reports.error !== null || questions.error !== null) {
    return <div className="p-6 text-red-600 dark:text-red-400">Could not load Night Shift.</div>;
  }
  if (reports.data === undefined || questions.data === undefined) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Loading Night Shift…</div>;
  }
  return (
    <ItemLinkCtx.Provider value={itemLinks}>
      <NightShiftView
        reports={reports.data}
        date={date}
        onPick={onPick}
        unknownDate={unknownDate}
        lastRun={runs.data?.[0] ?? null}
        report={report.data}
        reportError={report.isError ? report.error.message : null}
        questions={questions.data}
        onOpen={onOpen}
        onAnswer={async (id, text) => {
          try {
            await answer.mutateAsync({ id, answer: text });
            toast.success('Answer saved');
            return true;
          } catch (err) {
            toast.error('Could not save', err instanceof ApiError ? err.message : String(err));
            return false;
          }
        }}
      />
    </ItemLinkCtx.Provider>
  );
}
