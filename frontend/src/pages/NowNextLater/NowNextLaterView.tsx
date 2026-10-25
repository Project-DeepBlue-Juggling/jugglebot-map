import { useMemo, useState } from 'react';
import type { DependencyEdge, Task, User } from '../../api/schemas';
import { DrawerSlot } from '../../features/drawer/DrawerSlot';
import { HoverProvider } from '../../features/hover';
import { activePathways, inboxPartition, journeyByPlan } from '../../lib/journey';
import { NNL, INBOX_ORDER } from '../../theme/nnl';
import { buildMapView, openBlockerIdsOf } from '../FrontPage/mapView';
import { InboxRail } from './InboxRail';
import { Key, KeyBody } from './Key';
import { keyDrawn } from './keyMarks';
import { fitBlocks, KEY_HEAD, levelsOf, listBeside, trackColumnWidth } from './layout';
import { PathwayBlock } from './PathwayBlock';
import { useOpenId } from './selection';
import { useSize } from './useSize';

export interface NowNextLaterViewProps {
  tasks: readonly Task[];
  deps: readonly DependencyEdge[];
  users: readonly User[];
  onOpen: (taskId: string) => void;
}

const KEY_STORE = 'nnl-key-open';
/** Below this measured main-column width the blocks use the stacked (compact) layout. */
const COMPACT_BELOW = 760;

function readKeyOpen(): boolean {
  try {
    return window.localStorage.getItem(KEY_STORE) !== '0';
  } catch {
    return true;
  }
}

function writeKeyOpen(open: boolean): void {
  try {
    window.localStorage.setItem(KEY_STORE, open ? '1' : '0');
  } catch {
    /* storage unavailable: the toggle still works for this visit */
  }
}

/**
 * The Now / Next / Later page: one block per active Pathway (a track per open
 * plan, its Later stages and its own inbox items), the Pathways' unattached
 * inbox items in a right rail, and a Key of the marks drawn; a complete
 * Pathway is not drawn. Layout switches on the measured width of the main column
 * (the element that shrinks when the drawer takes room), never on the drawer.
 */
export function NowNextLaterView({ tasks, deps, users, onOpen }: NowNextLaterViewProps) {
  const view = useMemo(() => buildMapView(tasks, deps, users, onOpen), [tasks, deps, users, onOpen]);
  const blockerIds = useMemo(() => openBlockerIdsOf(view), [view]);
  const openId = useOpenId();
  const [colRef, colW] = useSize<HTMLDivElement>(openId);
  const [areaRef, , areaH] = useSize<HTMLDivElement>(openId);
  const [measRef, , keyBodyH] = useSize<HTMLDivElement>();
  const [keyOpen, setKeyOpen] = useState<boolean>(readKeyOpen);
  const [overlay, setOverlay] = useState(false);

  const active = useMemo(() => activePathways(view.pathways), [view]);
  const partition = useMemo(() => inboxPartition(view.ix, view.pathways), [view]);
  const journeys = useMemo(() => active.map((pw) => journeyByPlan(view.ix, pw)), [view, active]);
  const compact = colW > 0 && colW < COMPACT_BELOW;
  const trackColW = useMemo(() => trackColumnWidth(journeys), [journeys]);
  const listBelow = !listBeside(colW, trackColW);
  const levels = useMemo(
    () => journeys.map((j, i) => levelsOf(j, compact, partition.attached.get(active[i].id)?.length ?? 0, listBelow)),
    [journeys, active, partition, compact, listBelow],
  );
  const { idx, free } = useMemo(() => {
    if (areaH === 0) return { idx: levels.map(() => 0), free: 0 };
    return fitBlocks(levels, areaH - 6 * levels.length - KEY_HEAD);
  }, [levels, areaH]);
  const chosen = levels.map((l, i) => l[idx[i]]);
  const drawn = useMemo(
    () =>
      keyDrawn(
        journeys,
        chosen,
        active.some((pw) => (partition.attached.get(pw.id)?.length ?? 0) > 0) ||
          INBOX_ORDER.some((k) => partition.unattached[k].length > 0),
      ),
    // `chosen` is derived from levels + idx
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [journeys, levels, idx, view, active, partition],
  );
  const fits = free >= keyBodyH;
  const onToggle = () => {
    if (fits) {
      const next = !keyOpen;
      setKeyOpen(next);
      writeKeyOpen(next);
    } else setOverlay((o) => !o);
  };
  return (
    <HoverProvider openBlockerIds={blockerIds}>
      <div
        data-testid="nnl-page"
        className="flex h-full gap-3 overflow-hidden p-3"
        style={{ backgroundColor: NNL.canvas, color: NNL.textHi }}
      >
        <div ref={colRef} data-testid="lanes" className="flex min-w-0 flex-1 flex-col gap-1">
          <header className="flex h-9 shrink-0 items-baseline justify-between">
            <h1 className="shrink-0 whitespace-nowrap pr-3 text-lg font-semibold">Now / Next / Later</h1>
          </header>
          <div ref={areaRef} data-testid="blocks" className="relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
            <div ref={measRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 w-full">
              <KeyBody drawn={drawn} />
            </div>
            {active.map((pw, i) => (
              <PathwayBlock
                key={pw.id}
                view={view}
                active={active}
                pathway={pw}
                journey={journeys[i]}
                items={partition.attached.get(pw.id) ?? []}
                level={chosen[i]}
                compact={compact}
                listBelow={listBelow}
                trackColW={trackColW}
              />
            ))}
            <div className="mt-auto">
              <Key
                open={keyOpen}
                overlay={overlay}
                onToggle={onToggle}
                fits={fits}
                drawn={drawn}
                maxH={Math.max(areaH - 40, 100)}
              />
            </div>
          </div>
        </div>
        <DrawerSlot />
        <InboxRail view={view} items={partition.unattached} />
      </div>
    </HoverProvider>
  );
}
