import clsx from 'clsx';
import type { TaskStatus } from '../api/schemas';
import { STATUS_STYLES } from './statusStyles';
import type { ChildSegment } from './sectionStatus';
import { STATUS_LABELS } from './statusLabels';

/**
 * A section's progress, as a bar split into one equal segment per direct child
 * (ADR 0048 amendment 2026-06-16). Each segment is coloured by that child's
 * effective status; segments are grouped most-done → least-done so the green
 * portion reads as "how much of this branch is complete" at a glance. Hovering
 * a segment names the child. Used on the canvas node and the list row in place
 * of the single inferred-status pill.
 */

// Group order, most-done → least-done, so the bar "fills" green from the left
// as work finishes (ADR 0052 adds `qa` after complete and `backlog` last).
// `qa` is nearly-done (in review); `blocked` is at-least-started so it sits
// before not_started; `backlog` (not yet scheduled) is least-done of all.
// Every status must appear here — `indexOf` returns -1 for any omission, which
// would sort that segment to the very front.
//
// `dropped` (ADR 0075) is filtered out before the sort and so never reaches
// it, but it is listed anyway: if a future caller ever stops pre-filtering,
// the belt-and-braces entry puts it last rather than letting `indexOf`'s -1
// hoist abandoned work to the head of every bar.
const SEGMENT_ORDER: readonly TaskStatus[] = [
  'complete',
  'qa',
  'in_progress',
  'blocked',
  'not_started',
  'backlog',
  'dropped',
];

export default function SectionProgressBar({
  segments,
  className,
}: {
  segments: readonly ChildSegment[];
  className?: string;
}) {
  // ADR 0075: dropped children leave the bar and the denominator alike — two
  // complete and one dropped of four reads "2 of 3". They are still *counted*
  // for the label, because a bar that silently shrank its own denominator
  // would be indistinguishable from one that had lost a task.
  const droppedCount = segments.filter((s) => s.status === 'dropped').length;
  const live = segments.filter((s) => s.status !== 'dropped');
  const total = live.length;
  const completeCount = live.filter((s) => s.status === 'complete').length;
  // Stable sort into the grouped order; equal-status children keep their input
  // (natural tree) order.
  const ordered = live
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) => SEGMENT_ORDER.indexOf(a.s.status) - SEGMENT_ORDER.indexOf(b.s.status) || a.i - b.i,
    )
    .map(({ s }) => s);

  const droppedSuffix = droppedCount === 0 ? '' : ` · ${droppedCount} dropped`;
  const label =
    segments.length === 0
      ? 'Empty section — no sub-tasks yet'
      : total === 0
        ? // Every child was dropped: there is no progress left to report.
          `Section progress: all ${droppedCount} sub-tasks dropped`
        : `Section progress: ${completeCount} of ${total} complete${droppedSuffix}`;

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className={clsx(
        'flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700',
        className,
      )}
    >
      {ordered.map((s) => (
        <div
          key={s.id}
          // Equal width per child; a hairline divider keeps adjacent same-colour
          // segments legible. `last:border-r-0` drops the trailing divider.
          className="h-full flex-1 border-r border-white/70 last:border-r-0 dark:border-slate-900/40"
          style={{ backgroundColor: STATUS_STYLES[s.status].borderHex }}
          title={`${s.title} — ${STATUS_LABELS[s.status]}`}
        />
      ))}
    </div>
  );
}
