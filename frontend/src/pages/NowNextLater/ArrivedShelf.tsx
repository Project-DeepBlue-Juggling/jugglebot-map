import { arrivedPathways } from '../../lib/journey';
import type { Task } from '../../api/schemas';
import { NNL } from '../../theme/nnl';
import { Openable } from '../FrontPage/bits';
import type { MapView } from '../FrontPage/mapView';
import { ArrivedPill } from './marks';

/** One line of grey pills for complete Pathways (`✓ name · Oct 13`); a click opens one. Nothing when none. */
export function ArrivedShelf({ view, pathways }: { view: MapView; pathways: readonly Task[] }) {
  const arrived = arrivedPathways(pathways);
  if (arrived.length === 0) return null;
  return (
    <div data-testid="arrived" className="flex h-6 shrink-0 items-center gap-2 overflow-hidden">
      <span className="text-[10px] font-semibold uppercase" style={{ color: NNL.textLo }}>
        Arrived
      </span>
      {arrived.map((a) => (
        <Openable key={a.pathway.id} id={a.pathway.id} view={view} label={a.pathway.title} as="span">
          <ArrivedPill name={a.pathway.title} label={a.label} />
        </Openable>
      ))}
    </div>
  );
}
