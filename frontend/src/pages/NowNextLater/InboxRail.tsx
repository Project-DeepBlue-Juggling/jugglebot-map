import type { Task } from '../../api/schemas';
import { INBOX_ORDER, NNL, type InboxKind } from '../../theme/nnl';
import { Openable } from '../FrontPage/bits';
import type { MapView } from '../FrontPage/mapView';
import { KEY_HEAD, railCaps, railItemHeight } from './layout';
import { useSize } from './useSize';
import { isStale, staleAge, staleClock } from '../../lib/stale';
import { KindGlyph, StaleMark } from './marks';
import { SELECTED, useOpenId } from './selection';
import ShortId from '../../ui/ShortId';

const RAIL_GAP = 8;
const KIND_PLURAL: Record<InboxKind, string> = { bug: 'Bugs', feature: 'Features', idea: 'Ideas' };

/** The right-hand rail: open bugs, features and ideas that no drawn Pathway lists, each exactly once. */
export function InboxRail({ view, items }: { view: MapView; items: Record<InboxKind, Task[]> }) {
  const openId = useOpenId();
  const [ref, , height] = useSize<HTMLElement>(openId);
  const needs = INBOX_ORDER.map((k) =>
    items[k].length === 0
      ? KEY_HEAD
      : KEY_HEAD + 4 + items[k].reduce((n, t) => n + railItemHeight(t.title), 0),
  );
  const caps = height === 0 ? needs : railCaps(needs, height - 2 * RAIL_GAP);
  return (
    <aside
      ref={ref}
      data-testid="rail"
      aria-label="Unattached inbox"
      className="flex shrink-0 flex-col self-stretch"
      style={{ width: 'clamp(232px, 19vw, 300px)', gap: RAIL_GAP }}
    >
      {INBOX_ORDER.map((k, n) => {
        const list = items[k];
        return (
          <section
            key={k}
            data-testid={`rail-${k}`}
            className="flex shrink-0 flex-col overflow-hidden rounded"
            style={{ backgroundColor: NNL.surface, maxHeight: caps[n] }}
          >
            <header
              className="flex h-6 shrink-0 items-center gap-1.5 px-2 text-[11px] font-semibold uppercase"
              style={{ color: NNL.textMed }}
            >
              <KindGlyph kind={k} />
              {KIND_PLURAL[k]} {'·'} no Pathway
              <span className="font-normal" style={{ color: NNL.textLo }}>
                {list.length}
              </span>
            </header>
            <div className="min-h-0 overflow-y-auto px-1 pb-1">
              {list.map((t) => (
                <Openable
                  key={t.id}
                  id={t.id}
                  view={view}
                  label={t.title}
                  className="flex min-h-[22px] items-center rounded px-1 py-0.5 text-[12px] leading-4"
                  style={openId === t.id ? SELECTED : {}}
                >
                  <i
                    aria-hidden
                    className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: NNL.kind[k].hex }}
                  />
                  <span className="line-clamp-2 min-w-0 flex-1" title={t.title}>
                    {t.title}
                  </span>
                  <ShortId task={t} className="ml-1" />
                  {isStale(t, view.now) && (
                    <StaleMark days={staleAge(t, view.now)} since={staleClock(t)} />
                  )}
                </Openable>
              ))}
            </div>
          </section>
        );
      })}
    </aside>
  );
}
