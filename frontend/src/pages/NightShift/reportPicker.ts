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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `Fri 13 Nov · 1 merged · 2 held · 1 question`, plus ` · STATUS` for a night that did not finish. */
export function optionLabel(r: NightShiftReportEntry, latest: boolean): string {
  const parts = [dayLabel(r.date)];
  if (r.merged != null && r.held != null && r.questions != null) {
    parts.push(
      `${r.merged} merged`,
      `${r.held} held`,
      plural(r.questions, 'question', 'questions'),
    );
  }
  if (r.status != null && r.status !== 'OK') parts.push(r.status);
  return (latest ? 'Latest · ' : '') + parts.join(' · ');
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
