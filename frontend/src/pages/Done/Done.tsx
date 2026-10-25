import { useTasks } from '../../api/hooks';
import { DoneView } from './DoneView';

const noop = () => {};

export interface DoneProps {
  /** Opens the shared drawer for a task (the shell wires TaskDetailPanel). */
  onOpen?: (taskId: string) => void;
}

/** The Done route: loads the tasks, renders the view. */
export default function Done({ onOpen = noop }: DoneProps) {
  const tasks = useTasks();
  if (tasks.error !== null) {
    return <div className="p-6 text-red-600 dark:text-red-400">Could not load the map.</div>;
  }
  if (tasks.data === undefined) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Loading the map…</div>;
  }
  return <DoneView tasks={tasks.data} onOpen={onOpen} />;
}
