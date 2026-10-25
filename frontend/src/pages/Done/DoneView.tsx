import { useMemo, useState } from 'react';
import type { Task } from '../../api/schemas';
import { arrivedPathways, closedItems, closedMonths, groupClosed, monthOf } from '../../lib/done';
import { kindHue, statusLabel } from '../../theme/palette';
import { NNL } from '../../theme/nnl';

const SHOW_DROPPED_KEY = 'jugglebot-map-done-show-dropped';
const KIND_CHIPS = ['bug', 'feature', 'idea', 'ticket'] as const;

function loadShowDropped(): boolean {
  try {
    return window.localStorage.getItem(SHOW_DROPPED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveShowDropped(v: boolean): void {
  try {
    window.localStorage.setItem(SHOW_DROPPED_KEY, v ? '1' : '0');
  } catch {
    // Storage blocked: the toggle still works for this visit.
  }
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `2026-10` -> `October 2026`. */
function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

export interface DoneViewProps {
  tasks: readonly Task[];
  onOpen: (taskId: string) => void;
}

/** The Done page: complete Pathways with their plans, then closed items by Pathway. */
export function DoneView({ tasks, onOpen }: DoneViewProps) {
  const [showDropped, setShowDropped] = useState(loadShowDropped);
  const [kinds, setKinds] = useState<string[]>([]);
  const [month, setMonth] = useState<string>('');

  const arrived = useMemo(() => arrivedPathways(tasks, showDropped), [tasks, showDropped]);
  const months = useMemo(() => closedMonths(closedItems(tasks, showDropped)), [tasks, showDropped]);
  // A month that vanished (dropped hidden again) must not leave the list empty.
  const activeMonth = months.includes(month) ? month : '';
  const groups = useMemo(
    () =>
      groupClosed(tasks, { showDropped, kinds, month: activeMonth === '' ? null : activeMonth }),
    [tasks, showDropped, kinds, activeMonth],
  );

  const toggleKind = (k: string) =>
    setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  return (
    <div
      data-testid="done-page"
      className="h-full overflow-y-auto overflow-x-hidden px-4 pb-8 pt-3"
      style={{ backgroundColor: NNL.canvas, color: NNL.textHi }}
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-lg font-semibold">Done</h1>
        <label className="flex items-center gap-2 text-sm" style={{ color: NNL.textMed }}>
          <input
            type="checkbox"
            checked={showDropped}
            onChange={(e) => {
              setShowDropped(e.target.checked);
              saveShowDropped(e.target.checked);
            }}
          />
          Show dropped
        </label>
      </header>

      <section aria-label="Pathways arrived" className="mb-8">
        <h2
          className="mb-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide"
          style={{ color: NNL.textMed, borderColor: NNL.border }}
        >
          Pathways arrived
        </h2>
        {arrived.length === 0 ? (
          <p data-testid="arrived-empty" className="py-3 text-sm" style={{ color: NNL.textMed }}>
            Nothing has arrived yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {arrived.map(({ pathway, date, plans }) => (
              <li
                key={pathway.id}
                data-testid="arrived-pathway"
                className="min-w-0 rounded border px-3 py-2"
                style={{ backgroundColor: NNL.surface, borderColor: NNL.border }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={() => onOpen(pathway.id)}
                    className="min-w-0 break-words text-left text-[15px] font-semibold hover:underline"
                  >
                    {pathway.title}
                  </button>
                  <span className="text-xs" style={{ color: NNL.textMed }}>
                    {date}
                  </span>
                  {pathway.status === 'dropped' && (
                    <span className="text-[11px]" style={{ color: NNL.textLo }}>
                      {statusLabel(pathway.status)}
                    </span>
                  )}
                </div>
                {plans.length > 0 && (
                  <ul
                    className="mt-1 flex flex-col gap-0.5"
                    aria-label={`Plans of ${pathway.title}`}
                  >
                    {plans.map((p) => (
                      <li key={p.id} className="min-w-0 text-[13px]">
                        <button
                          type="button"
                          onClick={() => onOpen(p.id)}
                          className="max-w-full break-words text-left hover:underline"
                          style={{ color: NNL.textMed }}
                        >
                          {p.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Closed items">
        <h2
          className="mb-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide"
          style={{ color: NNL.textMed, borderColor: NNL.border }}
        >
          Closed items
        </h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {KIND_CHIPS.map((k) => {
            const on = kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => toggleKind(k)}
                className={`rounded px-2 py-0.5 text-xs ${on ? 'ring-2 ring-dr-focus' : 'opacity-70'} ${kindHue(k).chip}`}
              >
                {kindHue(k).label}
              </button>
            );
          })}
          <select
            aria-label="Month"
            value={activeMonth}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border px-2 py-0.5 text-xs"
            style={{ backgroundColor: NNL.surface, borderColor: NNL.border, color: NNL.textHi }}
          >
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        {groups.length === 0 ? (
          <p data-testid="closed-empty" className="py-3 text-sm" style={{ color: NNL.textMed }}>
            No closed items match.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.pathway?.id ?? 'none'} data-testid="closed-group" className="mb-4">
              <h3 className="mb-1 min-w-0 break-words text-sm font-semibold">
                {g.pathway === null ? 'No Pathway' : g.pathway.title}
              </h3>
              <ul className="flex flex-col gap-1">
                {g.items.map(({ task, date }) => (
                  <li
                    key={task.id}
                    data-testid="closed-item"
                    className="flex min-w-0 items-baseline gap-2"
                  >
                    <span
                      className={`shrink-0 rounded px-1.5 py-px text-[10px] font-medium ${kindHue(task.kind).chip}`}
                    >
                      {kindHue(task.kind).label}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpen(task.id)}
                      className="min-w-0 flex-1 break-words text-left text-[13px] hover:underline"
                    >
                      {task.title}
                      {task.status === 'dropped' && (
                        <span className="ml-2 text-[11px]" style={{ color: NNL.textLo }}>
                          {statusLabel(task.status)}
                        </span>
                      )}
                    </button>
                    <span
                      className="shrink-0 text-xs"
                      style={{ color: NNL.textMed }}
                      title={monthOf(date)}
                    >
                      {date}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
