import { ApiError } from '../../api/client';
import { useRunbook, useSaveSittingResult } from '../../api/hooks';
import { useToast } from '../../ui/useToast';
import { NextSittingView } from './NextSittingView';
import { localToday } from './today';

const noop = () => {};

export interface NextSittingProps {
  /** Opens the shared drawer for a task (the shell wires the drawer). */
  onOpen?: (taskId: string) => void;
}

/** The Next Sitting route: loads the Runbook, saves a row's result with today's date. */
export default function NextSitting({ onOpen = noop }: NextSittingProps) {
  const runbook = useRunbook();
  const save = useSaveSittingResult();
  const toast = useToast();
  if (runbook.error !== null) {
    return <div className="p-6 text-red-600 dark:text-red-400">Could not load Next Sitting.</div>;
  }
  if (runbook.data === undefined) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Loading Next Sitting…</div>;
  }
  return (
    <NextSittingView
      runbook={runbook.data}
      today={localToday()}
      onOpen={onOpen}
      onSave={async (id, verdict, notes) => {
        try {
          await save.mutateAsync({ id, date: localToday(), verdict, notes });
          toast.success('Result saved');
        } catch (err) {
          toast.error('Could not save', err instanceof ApiError ? err.message : String(err));
        }
      }}
    />
  );
}
