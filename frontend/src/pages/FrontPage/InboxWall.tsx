import { wallItems } from '../../lib/derive';
import { InboxCard } from './InboxCard';
import { FRONT_LAYOUT, type MapView } from './mapView';

/** Every open idea / feature / bug, a fixed-height band that scrolls inside itself. */
export function InboxWall({ view }: { view: MapView }) {
  const items = wallItems(view.ix);
  return (
    <section aria-label="Inbox wall" className="flex shrink-0 flex-col">
      <h2
        className="flex items-baseline gap-2 text-sm font-semibold"
        style={{ height: FRONT_LAYOUT.wallHead }}
      >
        Inbox wall
        <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
          {items.length} open · a pin names the pathway, &quot;unattached&quot; means no home yet
        </span>
      </h2>
      <div
        data-testid="inbox-wall"
        className="grid grid-cols-4 content-start gap-2 overflow-y-auto pr-1"
        style={{ height: FRONT_LAYOUT.wall }}
      >
        {items.map((t) => (
          <InboxCard key={t.id} task={t} view={view} />
        ))}
      </div>
    </section>
  );
}
