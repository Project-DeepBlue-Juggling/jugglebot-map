import { useDependencies, useTasks, useUsers } from '../../api/hooks';
import { FrontPageView } from './FrontPageView';

const noop = () => {};

export interface FrontPageProps {
  /** Opens the shared drawer for a task (the shell wires TaskDetailPanel). */
  onOpen?: (taskId: string) => void;
}

/** The Front page route: loads tasks, dependencies and users, renders the view. */
export default function FrontPage({ onOpen = noop }: FrontPageProps) {
  const tasks = useTasks();
  const deps = useDependencies();
  const users = useUsers();
  if (tasks.error !== null || deps.error !== null) {
    return <div className="p-6 text-red-600 dark:text-red-400">Could not load the map.</div>;
  }
  if (tasks.data === undefined || deps.data === undefined) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Loading the map…</div>;
  }
  return (
    <FrontPageView tasks={tasks.data} deps={deps.data} users={users.data ?? []} onOpen={onOpen} />
  );
}
