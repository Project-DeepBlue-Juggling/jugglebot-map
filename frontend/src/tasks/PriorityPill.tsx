import clsx from 'clsx';
import type { TaskPriority } from '../api/schemas';
import { PRIORITY_LABELS, PRIORITY_STYLES } from './priority';

/**
 * Small pill showing a task's triage level (ADR 0052). Renders `null` when the
 * priority is `null` ("no priority") so the absence is the quiet default — every
 * surface can drop `<PriorityPill priority={task.priority} />` in unconditionally.
 * The pill carries a `Priority: <level>` tooltip so the signal is named without
 * needing an inline glyph.
 */
export default function PriorityPill({
  priority,
  className,
}: {
  priority: TaskPriority | null;
  className?: string;
}) {
  if (priority === null) return null;
  const style = PRIORITY_STYLES[priority];
  const label = PRIORITY_LABELS[priority];
  return (
    <span
      title={`Priority: ${label}`}
      className={clsx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
        style.pillBg,
        style.pillText,
        className,
      )}
    >
      {label}
    </span>
  );
}
