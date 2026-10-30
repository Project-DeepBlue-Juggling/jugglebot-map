import { useState } from 'react';
import {
  useAnswerQuestion,
  useNightShiftQuestions,
  useNightShiftReport,
  useNightShiftReports,
} from '../../api/hooks';
import { ApiError } from '../../api/client';
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
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? reports.data?.[0]?.date ?? null;
  const report = useNightShiftReport(date);

  if (reports.error !== null || questions.error !== null) {
    return <div className="p-6 text-red-600 dark:text-red-400">Could not load Night Shift.</div>;
  }
  if (reports.data === undefined || questions.data === undefined) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Loading Night Shift…</div>;
  }
  return (
    <NightShiftView
      reports={reports.data}
      date={date}
      onPick={setPicked}
      report={report.data}
      reportError={report.isError ? report.error.message : null}
      questions={questions.data}
      onOpen={onOpen}
      onAnswer={async (id, text) => {
        try {
          await answer.mutateAsync({ id, answer: text });
          toast.success('Answer saved');
        } catch (err) {
          toast.error('Could not save', err instanceof ApiError ? err.message : String(err));
        }
      }}
    />
  );
}
