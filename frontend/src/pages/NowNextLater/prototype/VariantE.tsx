// PROTOTYPE variant E (smoke page for the round-2 helpers; the real E is built on top of this).
import { useMemo } from 'react';
import { DrawerSlot } from '../../../features/drawer/DrawerSlot';
import { HoverProvider } from '../../../features/hover';
import { displayTitle } from '../../../lib/derive';
import { buildMapView, openBlockerIdsOf } from '../../FrontPage/mapView';
import type { NowNextLaterViewProps } from '../NowNextLaterView';
import {
  activePathways,
  attachedInboxSorted,
  inboxByKind,
  journey,
  laterOneLiners,
  pathwayHue,
  pathwayHueReused,
  progressLabel,
  TOKENS,
} from './round2.ts';
import { ArrivedShelf, KindGlyph, Legend, Track } from './round2.tsx';

export function VariantE({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(
    () => buildMapView(tasks, deps, users, onOpen),
    [tasks, deps, users, onOpen],
  );
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const inbox = inboxByKind(view);
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div
        data-testid="nnl-page"
        className="flex h-full flex-col gap-2 overflow-hidden p-3"
        style={{ backgroundColor: TOKENS.canvas, color: TOKENS.textHi }}
      >
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <header className="flex h-7 shrink-0 items-baseline justify-between">
              <h1 className="text-lg font-semibold">Now / Next / Later</h1>
              <Legend />
            </header>
            <div data-testid="lanes" className="flex min-h-0 flex-1 flex-col">
              {activePathways(view).map((pw) => {
                const j = journey(view.ix, pw);
                const pl = progressLabel(view.ix, pw);
                const later = laterOneLiners(view.ix, pw);
                const att = attachedInboxSorted(view.ix, pw);
                return (
                  <section key={pw.id} className="flex min-h-0 flex-1 items-center gap-3">
                    <div className="w-44 shrink-0 text-[13px] font-bold leading-tight">
                      <i
                        className="mr-2 inline-block h-3.5 w-[3px]"
                        style={{ backgroundColor: pathwayHue(view, pw.id) }}
                      />
                      {pw.title}{' '}
                      <span title={pl.title} className="font-normal" style={{ color: TOKENS.textMed }}>
                        {pl.text}
                      </span>
                    </div>
                    <Track
                      stations={j.stations}
                      hue={pathwayHue(view, pw.id)}
                      view={view}
                      capsule={j.doneCapsule}
                      external={j.external}
                      dashed={pathwayHueReused(view, pw.id)}
                    />
                    <div className="min-w-0 flex-1 truncate text-[11px]" style={{ color: TOKENS.textMed }}>
                      later: {later.map((s) => `${s.code} ${displayTitle(s.task)}`).join(' | ')}
                      {' · '}
                      {att.map((t) => t.kind[0]).join('')}
                      {j.parked.length > 0 ? ` · ‖ ${j.parked.length} parked` : ''}
                    </div>
                  </section>
                );
              })}
            </div>
            <ArrivedShelf view={view} />
          </div>
          <DrawerSlot />
        </div>
        <div className="grid h-24 shrink-0 grid-cols-3 gap-3 text-[11px]">
          {(['bug', 'feature', 'idea'] as const).map((k) => (
            <div key={k} className="overflow-y-auto rounded p-1" style={{ backgroundColor: TOKENS.surface }}>
              <KindGlyph kind={k} /> {k} {inbox[k].unattached.length}/{inbox[k].attached.length} attached
            </div>
          ))}
        </div>
      </div>
    </HoverProvider>
  );
}
