import type { CSSProperties } from 'react';
import { displayTitle } from '../../lib/derive';
import { splitTrack, type PlanTrack as PlanTrackData, type Station } from '../../lib/journey';
import { NNL } from '../../theme/nnl';
import { Openable } from '../FrontPage/bits';
import type { MapView } from '../FrontPage/mapView';
import { LATER_H, NAME_W, PITCH } from './layout';
import { ChipMark, LaterMark } from './marks';
import { SELECTED, useOpenId } from './selection';

const S = NNL.status;

function Chip({ s, hue, view }: { s: Station; hue: string; view: MapView }) {
  const selected = useOpenId() === s.task.id;
  return (
    <Openable
      id={s.task.id}
      view={view}
      label={displayTitle(s.task)}
      className="absolute top-0 flex items-center justify-center"
      style={{ width: PITCH, height: 22 }}
    >
      <ChipMark
        state={s.state}
        code={s.code}
        isTicket={s.isTicket}
        hue={hue}
        title={displayTitle(s.task)}
        selected={selected}
      />
    </Openable>
  );
}

/** Station chips on a line; a blocked station turns the rest of the line red-dashed. */
function ChipTrack({
  stations,
  hue,
  view,
  dashed,
}: {
  stations: readonly Station[];
  hue: string;
  view: MapView;
  dashed: boolean;
}) {
  const n = stations.length;
  let prefix = 0;
  while (prefix < n && stations[prefix].state === 'done') prefix += 1;
  const blockedAt = stations.findIndex((s) => s.state === 'blocked');
  const xc = (i: number) => i * PITCH + PITCH / 2;
  const line = (from: number, to: number, color: string, dash: boolean): CSSProperties => ({
    left: from,
    width: Math.max(to - from, 0),
    top: 10,
    borderTop: `2px ${dash ? 'dashed' : 'solid'} ${color}`,
  });
  return (
    <div className="relative shrink-0" style={{ width: n * PITCH, height: 22 }}>
      {n > 1 && <div className="absolute" style={line(xc(0), xc(n - 1), NNL.border, dashed)} />}
      {prefix > 1 && <div className="absolute" style={line(xc(0), xc(prefix - 1), hue, dashed)} />}
      {blockedAt !== -1 && n - 1 > blockedAt && (
        <div className="absolute" style={line(xc(blockedAt), xc(n - 1), S.blocked, true)} />
      )}
      {stations.map((s, i) => (
        <div key={s.task.id} className="absolute top-0" style={{ left: i * PITCH, width: PITCH, height: 22 }}>
          <Chip s={s} hue={hue} view={view} />
        </div>
      ))}
    </div>
  );
}

function LaterLine({ x, view, compact }: { x: Station; view: MapView; compact: boolean }) {
  const selected = useOpenId() === x.task.id;
  return (
    <Openable
      id={x.task.id}
      view={view}
      label={displayTitle(x.task)}
      className="flex items-center truncate text-[11px]"
      style={{ height: LATER_H, paddingLeft: compact ? 0 : NAME_W + 8, color: NNL.textLo }}
    >
      <LaterMark text={displayTitle(x.task)} title={displayTitle(x.task)} style={selected ? SELECTED : undefined} />
    </Openable>
  );
}

/**
 * One plan (or the tickets) as a track: its name, the chip line, the focus
 * stage's title (white for Now, amber for Next, red for blocked) and either the
 * Later stages as lines below (`laterLines`) or a `then:` tail.
 */
export function PlanTrack({
  name,
  track,
  hue,
  view,
  dashed,
  laterLines,
  compact,
}: {
  name: string;
  track: PlanTrackData;
  hue: string;
  view: MapView;
  dashed: boolean;
  laterLines: boolean;
  compact: boolean;
}) {
  const { stations } = track;
  const { focus, later } = splitTrack(stations);
  // A phase-less plan's only station is the plan itself: its title would repeat the name.
  const showFocus = focus !== null && focus.task.id !== track.plan.id;
  return (
    <div className="shrink-0">
      {compact && (
        <div className="h-3 truncate text-[10px] leading-3" style={{ color: NNL.textMed }} title={name}>
          {name}
        </div>
      )}
      <div className="flex h-[22px] items-center gap-2 overflow-hidden">
        {!compact && (
          <span className="shrink-0 truncate text-[11px]" style={{ color: NNL.textMed, width: NAME_W }} title={name}>
            {name}
          </span>
        )}
        <ChipTrack stations={stations} hue={hue} view={view} dashed={dashed} />
        <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: NNL.textLo }}>
          {showFocus && (
            <span
              style={{
                color: focus.state === 'next' ? S.next : focus.state === 'blocked' ? S.blockedText : NNL.textHi,
              }}
            >
              {displayTitle(focus.task)}
            </span>
          )}
          {!laterLines && later.length > 0 && (
            <>
              {showFocus ? '  ·  ' : ''}then: {later.map((x) => displayTitle(x.task)).join(', ')}
            </>
          )}
        </span>
      </div>
      {laterLines && later.map((x) => <LaterLine key={x.task.id} x={x} view={view} compact={compact} />)}
    </div>
  );
}
