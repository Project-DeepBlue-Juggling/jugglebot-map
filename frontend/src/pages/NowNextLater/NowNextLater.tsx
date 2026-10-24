import { useDependencies, useTasks, useUsers } from '../../api/hooks';
import { NowNextLaterView } from './NowNextLaterView';
import { PROTOTYPE_ON } from '../../ui/PrototypeSwitcher';
import { PrototypeNowNextLater } from './prototype';

const noop = () => {};

export interface NowNextLaterProps {
  /** Opens the shared drawer for a task (the shell wires TaskDetailPanel). */
  onOpen?: (taskId: string) => void;
}

/** The Now / Next / Later route: loads tasks, dependencies and users. */
export default function NowNextLater({ onOpen = noop }: NowNextLaterProps) {
  const tasks = useTasks();
  const deps = useDependencies();
  const users = useUsers();
  if (tasks.error !== null || deps.error !== null) {
    return <div className="p-6 text-red-600 dark:text-red-400">Could not load the map.</div>;
  }
  if (tasks.data === undefined || deps.data === undefined) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Loading the map…</div>;
  }
  const View = PROTOTYPE_ON ? PrototypeNowNextLater : NowNextLaterView;
  return (
    <View
      tasks={tasks.data}
      deps={deps.data}
      users={users.data ?? []}
      onOpen={onOpen}
    />
  );
}
