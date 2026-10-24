// PROTOTYPE variant G (round 2): Plan tracks. A pathway is a block; each open plan inside it is
// its own track of 14 px chips (26 px pitch) with its Now/Next title and the Later one-liners
// inline. The inbox is a full-height right rail (Bugs, Features, Ideas), each item once.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { Task } from '../../../api/schemas';
import { DrawerSlot } from '../../../features/drawer/DrawerSlot';
import { HoverProvider } from '../../../features/hover';
import { displayTitle } from '../../../lib/derive';
import { Openable } from '../../FrontPage/bits';
import { buildMapView, openBlockerIdsOf, type MapView } from '../../FrontPage/mapView';
import type { NowNextLaterViewProps } from '../NowNextLaterView';
import {
  activePathways,
  attachedInboxSorted,
  INBOX_ORDER,
  inboxByKind,
  journeyByPlan,
  pathwayHue,
  pathwayHueReused,
  progressLabel,
  TOKENS,
  type PlanTrack,
  type Station,
} from './round2.ts';
import { ArrivedShelf, KindGlyph, Legend } from './round2.tsx';

const S = TOKENS.status;
const PITCH = 26;
/** Plan tracks shown per pathway before the rest collapse into one `+n queued plans` line. */
const MAX_TRACKS = 2;
const KIND_PLURAL = { bug: 'Bugs', feature: 'Features', idea: 'Ideas' } as const;

/** Raise `is-hovered` on every rail element of these ids (a kind badge covers several items). */
function setGroupHover(ids: readonly string[], on: boolean) {
  const want = new Set(ids);
  document.querySelectorAll('[data-item-id]').forEach((el) => {
    if (want.has(el.getAttribute('data-item-id') ?? '')) el.classList.toggle('is-hovered', on);
  });
}

/** A 14 px chip with the phase code inside: done filled, now filled + halo, next amber ring, later hollow. */
function Chip({ s, hue, view }: { s: Station; hue: string; view: MapView }) {
  const base: CSSProperties = {
    width: 22,
    height: 14,
    borderRadius: s.isTicket ? 2 : 7,
    fontSize: 9,
    lineHeight: '10px',
    fontWeight: 600,
  };
  let style: CSSProperties = base;
  let text: string = s.code;
  if (s.state === 'done') style = { ...base, backgroundColor: hue, color: TOKENS.canvas };
  else if (s.state === 'now')
    style = { ...base, backgroundColor: hue, color: TOKENS.canvas, boxShadow: `0 0 0 3px ${hue}33` };
  else if (s.state === 'next')
    style = { ...base, border: `2px solid ${S.next}`, color: S.next, backgroundColor: TOKENS.canvas };
  else if (s.state === 'blocked') {
    style = { ...base, backgroundColor: S.blocked, color: '#fff' };
    text = '✕';
  } else style = { ...base, border: `1.5px solid ${S.later}`, color: TOKENS.textLo, backgroundColor: TOKENS.canvas };
  return (
    <Openable
      id={s.task.id}
      view={view}
      label={displayTitle(s.task)}
      className="absolute top-0 flex items-center justify-center"
      style={{ width: PITCH, height: 22 }}
    >
      <span
        title={displayTitle(s.task)}
        className="flex items-center justify-center"
        style={style}
      >
        {text}
      </span>
    </Openable>
  );
}

/** Station chips on a line; blocked stations turn the rest of the line red-dashed. */
function ChipTrack({ stations, hue, view, dashed }: { stations: readonly Station[]; hue: string; view: MapView; dashed: boolean }) {
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
      {n > 1 && <div className="absolute" style={line(xc(0), xc(n - 1), TOKENS.border, dashed)} />}
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

function TrackLine({ name, track, hue, view, dashed }: { name: string; track: PlanTrack | null; hue: string; view: MapView; dashed: boolean; }) {
  const stations = track?.stations ?? [];
  const firstOpen = stations.findIndex((s) => s.state !== 'done');
  const focus = firstOpen === -1 ? null : stations[firstOpen];
  const later = stations.filter((s, i) => i > firstOpen && firstOpen !== -1 && s.state === 'later');
  return (
    <div className="flex h-[22px] shrink-0 items-center gap-2 overflow-hidden">
      <span className="w-[140px] shrink-0 truncate text-[11px]" style={{ color: TOKENS.textMed }} title={name}>
        {name}
      </span>
      <ChipTrack stations={stations} hue={hue} view={view} dashed={dashed} />
      <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: TOKENS.textLo }}>
        {focus !== null && (
          <span style={{ color: focus.state === 'next' ? S.next : focus.state === 'blocked' ? S.blockedText : TOKENS.textHi }}>
            {displayTitle(focus.task)}
          </span>
        )}
        {later.length > 0 && (
          <>
            {focus !== null ? '  ·  ' : ''}then: {later.map((s) => displayTitle(s.task)).join(', ')}
          </>
        )}
      </span>
    </div>
  );
}

function Block({ view, pw }: { view: MapView; pw: Task }) {
  const hue = pathwayHue(view, pw.id);
  const dashed = pathwayHueReused(view, pw.id);
  const j = journeyByPlan(view.ix, pw);
  const pl = progressLabel(view.ix, pw);
  const att = attachedInboxSorted(view.ix, pw);
  const shown = j.plans.slice(0, MAX_TRACKS);
  const queued = j.plans.slice(MAX_TRACKS);
  const kinds = INBOX_ORDER.map((k) => ({ k, items: att.filter((t) => t.kind === k) })).filter((x) => x.items.length > 0);
  const nothing = j.plans.length === 0 && j.tickets.length === 0;
  return (
    <section className="flex shrink-0 flex-col gap-px rounded px-2 py-1" style={{ backgroundColor: TOKENS.surface }}>
      <div className="flex h-5 items-center gap-2">
        <i className="inline-block h-3.5 w-[3px] shrink-0" style={{ backgroundColor: hue }} />
        <Openable id={pw.id} view={view} label={pw.title} as="span" className="truncate text-[13px] font-bold">
          {pw.title}
        </Openable>
        <span title={pl.title} className="text-[11px]" style={{ color: TOKENS.textMed }}>
          {pl.text} stages
        </span>
        {j.doneCapsule.units > 0 && (
          <span
            title={`${j.doneCapsule.units} done plans or tickets, not drawn`}
            className="rounded-full px-1.5 text-[10px]"
            style={{ backgroundColor: TOKENS.raised, color: TOKENS.textMed, border: `1px solid ${TOKENS.borderStrong}` }}
          >
            ✓ {j.doneCapsule.units} plans
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-[11px]">
          {kinds.map(({ k, items }) => (
            <span
              key={k}
              title={`${items.length} ${k}${items.length > 1 ? 's' : ''} attached`}
              className="flex cursor-default items-center gap-0.5"
              onPointerEnter={() => setGroupHover(items.map((t) => t.id), true)}
              onPointerLeave={() => setGroupHover(items.map((t) => t.id), false)}
            >
              <KindGlyph kind={k} />
              <span style={{ color: TOKENS.textMed }}>{items.length}</span>
            </span>
          ))}
        </span>
      </div>
      {shown.map((g) => (
        <TrackLine key={g.plan.id} name={g.plan.title} track={g} hue={hue} view={view} dashed={dashed} />
      ))}
      {queued.length > 0 && (
        <div className="h-[18px] truncate pl-1 text-[11px]" style={{ color: TOKENS.textLo }} title={queued.map((g) => g.plan.title).join(', ')}>
          +{queued.length} queued plan{queued.length > 1 ? 's' : ''}
        </div>
      )}
      {j.tickets.length > 0 && (
        <TrackLine name="tickets" track={{ plan: pw, stations: j.tickets }} hue={hue} view={view} dashed={dashed} />
      )}
      {j.external !== null && (
        <div className="h-[18px] truncate pl-1 text-[11px]" style={{ color: S.next }}>
          ↗ next is outside: {displayTitle(j.external)}
        </div>
      )}
      {j.parked.length > 0 && (
        <div className="h-[18px] truncate pl-1 text-[11px]" style={{ color: TOKENS.textLo }}>
          ‖ parked: {j.parked.map((p) => p.title).join(', ')}
        </div>
      )}
      {nothing && j.parked.length === 0 && (
        <div className="h-[18px] pl-1 text-[11px]" style={{ color: TOKENS.textLo }}>
          no open plans
        </div>
      )}
    </section>
  );
}

function Rail({ view }: { view: MapView }) {
  const inbox = inboxByKind(view);
  return (
    <aside data-testid="rail" className="flex w-[340px] shrink-0 flex-col gap-2">
      {INBOX_ORDER.map((k) => {
        const items = [...inbox[k].unattached, ...inbox[k].attached];
        const hex = TOKENS.kind[k].hex;
        return (
          <section
            key={k}
            className="flex min-h-[28px] flex-col overflow-hidden rounded"
            style={{ backgroundColor: TOKENS.surface, flex: `${Math.max(items.length, 1)} 1 0` }}
          >
            <header className="flex h-6 shrink-0 items-center gap-1.5 px-2 text-[11px] font-semibold uppercase" style={{ color: TOKENS.textMed }}>
              <KindGlyph kind={k} />
              {KIND_PLURAL[k]}
              <span className="font-normal" style={{ color: TOKENS.textLo }}>
                {items.length}
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
              {items.map((t) => {
                const pw = t.pathway_id === null ? undefined : view.ix.byId.get(t.pathway_id);
                const attached = pw !== undefined && activePathways(view).some((p) => p.id === pw.id);
                return (
                  <Openable
                    key={t.id}
                    id={t.id}
                    view={view}
                    label={t.title}
                    className="flex h-[22px] items-center gap-1.5 rounded px-1 text-[12px]"
                    style={{ borderLeft: `2px solid ${hex}` }}
                  >
                    <span className="min-w-0 flex-1 truncate" title={t.title}>
                      {t.title}
                    </span>
                    {attached && pw !== undefined && (
                      <span className="flex shrink-0 items-center gap-1 text-[10px]" style={{ color: TOKENS.textLo }}>
                        <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pathwayHue(view, pw.id) }} />
                        <span className="max-w-[80px] truncate">{pw.title}</span>
                      </span>
                    )}
                  </Openable>
                );
              })}
            </div>
          </section>
        );
      })}
    </aside>
  );
}

export function VariantG({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(() => buildMapView(tasks, deps, users, onOpen), [tasks, deps, users, onOpen]);
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div
        data-testid="nnl-page"
        className="flex h-full gap-3 overflow-hidden p-3"
        style={{ backgroundColor: TOKENS.canvas, color: TOKENS.textHi }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <header className="flex h-9 shrink-0 items-baseline justify-between">
            <h1 className="shrink-0 whitespace-nowrap pr-3 text-lg font-semibold">Now / Next / Later</h1>
            <div className="min-w-0 overflow-hidden whitespace-nowrap"><Legend /></div>
          </header>
          <div data-testid="blocks" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
            {activePathways(view).map((pw) => (
              <Block key={pw.id} view={view} pw={pw} />
            ))}
          </div>
          <ArrivedShelf view={view} />
        </div>
        <DrawerSlot />
        <Rail view={view} />
      </div>
    </HoverProvider>
  );
}
