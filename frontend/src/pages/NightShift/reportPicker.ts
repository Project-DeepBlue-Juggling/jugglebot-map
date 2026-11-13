import type { NightShiftReportEntry } from '../../api/schemas';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
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

/** `2026-11-13` as `Fri 13 Nov` (calendar arithmetic in UTC, so the zone never shifts the day). */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return `${DAYS[dow] ?? ''} ${d ?? ''} ${MONTHS[(m ?? 1) - 1] ?? ''}`;
}

/** `2026-11-13` as `November 2026`. */
export function monthLabel(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return `${MONTHS_LONG[(m ?? 1) - 1] ?? ''} ${y ?? ''}`;
}

export interface RowCells {
  day: string;
  /** merged / held / questions; a null count renders as a dash placeholder. */
  counts: { cell: 'merged' | 'held' | 'questions'; n: number | null; unit: string }[];
  /** True when the night has no counts at all (a stub or a failed night). */
  noCounts: boolean;
  /** The runner's status word when it is not OK; shown in place of the counts if they are absent. */
  status: string | null;
}

/** The cells of one picker row: date, merged / held / questions (singular or plural unit), status. */
export function rowCells(r: NightShiftReportEntry): RowCells {
  const n = (v: number | null | undefined) => (v == null ? null : v);
  const noCounts = r.merged == null && r.held == null && r.questions == null;
  return {
    day: dayLabel(r.date),
    counts: [
      { cell: 'merged', n: n(r.merged), unit: 'merged' },
      { cell: 'held', n: n(r.held), unit: 'held' },
      { cell: 'questions', n: n(r.questions), unit: r.questions === 1 ? 'question' : 'questions' },
    ],
    noCounts,
    status: r.status != null && r.status !== 'OK' ? r.status : null,
  };
}

export interface MonthGroup {
  label: string;
  reports: NightShiftReportEntry[];
}

/** Reports (newest first) grouped by month, newest month first. */
export function groupByMonth(reports: readonly NightShiftReportEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const r of reports) {
    const label = monthLabel(r.date);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.label === label) last.reports.push(r);
    else groups.push({ label, reports: [r] });
  }
  return groups;
}
