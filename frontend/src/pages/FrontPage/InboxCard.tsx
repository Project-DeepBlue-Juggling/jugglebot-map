import type { Task } from '../../api/schemas';
import { formatAge } from '../../lib/derive';
import { isStale, staleAge } from '../../lib/stale';
import { kindHue, statusLabel, TICKET_HUE } from '../../theme/palette';
import { Openable, Owners, PriorityTag, StaleBadge } from './bits';
import { DepTags } from './DepTags';
import { FRONT_LAYOUT, linkLabel, type MapView } from './mapView';
import ShortId from '../../ui/ShortId';
import { metricValueLabel } from '../../lib/metrics';

function LinkChips({ links }: { links: readonly string[] }) {
  if (links.length === 0) return null;
  return (
    <span className="flex min-w-0 shrink gap-1 overflow-hidden">
      {links.map((l) => (
        <a
          key={l}
          href={l}
          title={l}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="max-w-[12rem] truncate rounded border border-slate-300 px-1 text-[10px] text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {linkLabel(l)}
        </a>
      ))}
    </span>
  );
}

function PathwayPin({ task, view }: { task: Task; view: MapView }) {
  const pw = task.pathway_id === null ? undefined : view.ix.byId.get(task.pathway_id);
  if (pw === undefined) {
    return <span className="text-slate-400 dark:text-slate-500">unattached</span>;
  }
  const hue = view.hues.get(pw.id) ?? '#64748b';
  return (
    <span className="flex min-w-0 items-center gap-1" data-testid="pathway-pin">
      <i aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: hue }} />
      <span className="truncate">{pw.title}</span>
    </span>
  );
}

interface CardShellProps {
  task: Task;
  view: MapView;
  edgeHex: string;
  label: string;
  labelClass: string;
}

function CardShell({ task, view, edgeHex, label, labelClass }: CardShellProps) {
  return (
    <Openable
      id={task.id}
      view={view}
      label={task.title}
      className="flex flex-col gap-1 overflow-hidden rounded border border-l-4 border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800"
      style={{ borderLeftColor: edgeHex, height: FRONT_LAYOUT.card }}
    >
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
        <span className={`rounded px-1 font-semibold ${labelClass}`}>{label}</span>
        <span>{statusLabel(task.status)}</span>
        <PriorityTag priority={task.priority} />
        {task.effort !== null && (
          <span
            title="Effort"
            data-testid="tag-effort"
            className="rounded border border-slate-300 px-1 font-semibold uppercase dark:border-slate-600"
          >
            {metricValueLabel('effort', task.effort)}
          </span>
        )}
        {task.hardware !== null && (
          <span
            title="Hardware"
            data-testid="tag-hardware"
            className="rounded border border-slate-300 px-1 dark:border-slate-600"
          >
            {task.hardware}
          </span>
        )}
        <ShortId task={task} />
        {isStale(task, view.now) && <StaleBadge days={staleAge(task, view.now)} item={task} />}
        <span className="ml-auto" title={`Filed ${task.created_at}`}>
          {formatAge(task.created_at, view.now)}
        </span>
      </div>
      <div className="line-clamp-2 h-[2.2rem] text-sm font-medium leading-tight" title={task.title}>
        {task.title}
      </div>
      <div className="line-clamp-2 h-8 text-slate-500 dark:text-slate-400">{task.description}</div>
      <div className="flex min-h-[1.125rem] min-w-0 items-center gap-1 overflow-hidden">
        <LinkChips links={task.links} />
        <DepTags task={task} view={view} />
      </div>
      <div className="mt-auto flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
        <PathwayPin task={task} view={view} />
        {task.assignee_ids.length > 0 && <Owners task={task} view={view} />}
        {task.status === 'promoted' && (
          <span className="ml-auto truncate font-medium" data-testid="promoted-to">
            → {task.promoted_to ?? 'promoted'}
          </span>
        )}
      </div>
    </Openable>
  );
}

/** One card for idea / feature / bug: kind hue edge and label. */
export function InboxCard({ task, view }: { task: Task; view: MapView }) {
  const hue = kindHue(task.kind);
  return (
    <CardShell task={task} view={view} edgeHex={hue.hex} label={hue.label} labelClass={hue.chip} />
  );
}

/** A ticket: the inbox card with a neutral edge and the ticket type as its label. */
export function TicketCard({ task, view }: { task: Task; view: MapView }) {
  return (
    <CardShell
      task={task}
      view={view}
      edgeHex={TICKET_HUE.hex}
      label={task.ticket_type ?? 'ticket'}
      labelClass={TICKET_HUE.chip}
    />
  );
}
