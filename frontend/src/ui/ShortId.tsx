import type { Task } from '../api/schemas';
import { idPillHue } from '../theme/palette';

/** The kind label as a small coloured pill; sits immediately before an Item ID. */
export function KindPill({
  kind,
  ticketType,
}: {
  kind: string;
  ticketType?: string | null | undefined;
}) {
  const hue = idPillHue(kind, ticketType);
  return (
    <span
      data-testid="kind-pill"
      className={`mr-1 inline-block shrink-0 rounded px-1.5 py-px align-baseline text-[10px] font-medium leading-tight ${hue.chip}`}
    >
      {hue.label}
    </span>
  );
}

/**
 * A kind pill plus an Item's short ID in muted mono (`Bug BUG-12`). While the app
 * has not pushed the Item yet its ID is provisional (a rebase may renumber it), so
 * it reads fainter with an "unsent" tag and nobody quotes an ID that is about to change.
 */
export function IdPill({
  shortId,
  kind,
  ticketType,
  unpushed = false,
  className = '',
}: {
  shortId: string | null;
  kind: string | null | undefined;
  ticketType?: string | null | undefined;
  unpushed?: boolean;
  className?: string;
}) {
  if (shortId === null) return null;
  return (
    <span className="inline-flex shrink-0 items-baseline">
      {kind != null && <KindPill kind={kind} ticketType={ticketType} />}
      <span
        data-testid="short-id"
        title={unpushed ? 'Not pushed yet: this ID may still change' : undefined}
        className={`shrink-0 font-mono text-[11px] tabular-nums ${unpushed ? 'opacity-50' : 'opacity-70'} ${className}`}
      >
        {shortId}
        {unpushed && <span className="ml-1 font-sans italic">unsent</span>}
      </span>
    </span>
  );
}

export default function ShortId({
  task,
  className = '',
}: {
  task: Pick<Task, 'short_id' | 'unpushed' | 'kind'> & { ticket_type?: string | null };
  className?: string;
}) {
  return (
    <IdPill
      shortId={task.short_id}
      kind={task.kind}
      ticketType={task.ticket_type}
      unpushed={task.unpushed}
      className={className}
    />
  );
}
