import type { Task } from '../api/schemas';

/**
 * An Item's short ID in muted mono (`JB-12`). While the app has not pushed the
 * Item yet its ID is provisional (a rebase may renumber it), so it reads fainter
 * with an "unsent" tag and nobody quotes an ID that is about to change.
 */
export default function ShortId({
  task,
  className = '',
}: {
  task: Pick<Task, 'short_id' | 'unpushed'>;
  className?: string;
}) {
  if (task.short_id === null) return null;
  return (
    <span
      data-testid="short-id"
      title={task.unpushed ? 'Not pushed yet: this ID may still change' : undefined}
      className={`shrink-0 font-mono text-[11px] tabular-nums ${task.unpushed ? 'opacity-50' : 'opacity-70'} ${className}`}
    >
      {task.short_id}
      {task.unpushed && <span className="ml-1 font-sans italic">unsent</span>}
    </span>
  );
}
