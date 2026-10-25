import type { Task } from '../../api/schemas';
import { displayTitle, planCardName } from '../../lib/derive';
import {
  pathwayHue,
  pathwayHueReused,
  progressLabel,
  type Journey,
} from '../../lib/journey';
import { NNL } from '../../theme/nnl';
import { Openable } from '../FrontPage/bits';
import type { MapView } from '../FrontPage/mapView';
import { clipTitle, COLUMN_GAP, LINE_H, type Level } from './layout';
import { CapsuleChip, HueBar, KindGlyph } from './marks';
import { SELECTED, useOpenId } from './selection';
import { PlanTrack } from './PlanTrack';

const S = NNL.status;

function NoteLine({ color, title, children }: { color: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="h-[18px] truncate pl-1 text-[11px]" style={{ color }} title={title}>
      {children}
    </div>
  );
}

function ItemLine({ t, view }: { t: Task; view: MapView }) {
  const selected = useOpenId() === t.id;
  return (
    <Openable
      id={t.id}
      view={view}
      label={t.title}
      className="flex items-center gap-1.5 rounded px-1 text-[12px]"
      style={{ height: LINE_H, color: NNL.textMed, ...(selected ? SELECTED : {}) }}
    >
      <KindGlyph kind={t.kind} className="text-[11px]" />
      <span className="min-w-0 flex-1 truncate" title={t.title}>
        {clipTitle(t.title)}
      </span>
    </Openable>
  );
}

/**
 * One active Pathway: header (name, `n/m stages`, done capsule), one track per
 * open plan (as many as `level` allows), the tickets track, the Next-outside /
 * parked notes, and the Pathway's own bugs, features and ideas as one-liners.
 */
export function PathwayBlock({
  view,
  active,
  pathway,
  journey,
  items,
  level,
  compact,
  listBelow,
  trackColW,
}: {
  view: MapView;
  active: readonly Task[];
  pathway: Task;
  journey: Journey;
  items: readonly Task[];
  level: Level;
  compact: boolean;
  listBelow: boolean;
  /** The track column width every block shares (one-liners start at the same x). */
  trackColW: number;
}) {
  const hue = pathwayHue(active, pathway.id);
  const dashed = pathwayHueReused(active, pathway.id);
  const pl = progressLabel(view.ix, pathway);
  const shown = journey.plans.slice(0, level.tracks);
  const queued = journey.plans.slice(level.tracks);
  const cap = journey.doneCapsule;
  const empty = journey.plans.length === 0 && journey.tickets.length === 0 && journey.parked.length === 0;
  return (
    <section
      aria-label={pathway.title}
      data-testid="pathway-block"
      className="flex shrink-0 flex-col gap-px overflow-hidden rounded px-2 py-1"
      style={{ backgroundColor: NNL.surface }}
    >
      <div className="flex h-5 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap">
        <HueBar hue={hue} />
        <Openable id={pathway.id} view={view} label={pathway.title} as="span" className="min-w-0 truncate text-[13px] font-bold">
          {pathway.title}
        </Openable>
        <span title={pl.title} className="shrink-0 text-[11px]" style={{ color: NNL.textMed }}>
          {pl.text} stages
        </span>
        {cap.units + cap.doneTickets > 0 && (
          <CapsuleChip
            units={cap.units}
            doneTickets={cap.doneTickets}
            compact={compact}
            title={`${cap.units} done plan${cap.units === 1 ? '' : 's'}${cap.doneTickets > 0 ? `, ${cap.doneTickets} done tickets` : ''}; not drawn`}
          />
        )}
      </div>
      <div
        className={listBelow ? 'flex flex-col gap-px' : 'grid items-start'}
        style={listBelow ? undefined : { gridTemplateColumns: `${trackColW}px minmax(0, 1fr)`, columnGap: COLUMN_GAP }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          {shown.map((g) => (
            <PlanTrack
              key={g.plan.id}
              name={planCardName(g.plan)}
              track={g}
              hue={hue}
              view={view}
              dashed={dashed}
              laterLines={level.laterLines}
              compact={compact}
            />
          ))}
          {queued.length > 0 && (
            <NoteLine color={NNL.textLo} title={queued.map((g) => g.plan.title).join(', ')}>
              +{queued.length} queued plan{queued.length > 1 ? 's' : ''}
            </NoteLine>
          )}
          {journey.tickets.length > 0 && (
            <PlanTrack
              name="tickets"
              track={{ plan: pathway, stations: journey.tickets }}
              hue={hue}
              view={view}
              dashed={dashed}
              laterLines={level.laterLines}
              compact={compact}
            />
          )}
          {journey.external !== null && (
            <NoteLine color={S.next}>
              {'↗'} next is outside: {displayTitle(journey.external)}
            </NoteLine>
          )}
          {journey.parked.length > 0 && (
            <NoteLine color={NNL.textLo}>
              {'‖'} parked: {journey.parked.map((p) => p.title).join(', ')}
            </NoteLine>
          )}
          {empty && <NoteLine color={NNL.textLo}>no open plans</NoteLine>}
        </div>
        {items.length > 0 && (
          <div data-testid="pw-items" className="flex shrink-0 flex-col">
            {items.map((t) => (
              <ItemLine key={t.id} t={t} view={view} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
