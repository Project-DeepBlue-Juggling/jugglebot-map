import type { Task } from '../api/schemas';

/**
 * Short Item IDs: one sequence per kind, `BUG-12`, `FEAT-7`, `IDEA-3`, `PWAY-2`,
 * `TKT-31`, plus the legacy global `JB-<n>` (mapkit `ids.py`, plan item-id-per-kind
 * § 2.1). The task uuid stays the API key; the short ID is what people type and
 * say. The ID shown is always the server's `short_id`: nothing here re-derives
 * one from a number. Plans and phases have none (`short_id: null`).
 */

const PREFIXES = ['JB', 'BUG', 'FEAT', 'IDEA', 'PWAY', 'TKT'] as const;
const ALT = PREFIXES.join('|');

/** A typed ID in any case, hyphen optional (`BUG-12`, `jb12`) -> canonical `BUG-12`; else null. */
export function parseShortId(text: string): string | null {
  const m = new RegExp(`^(${ALT})-?([1-9]\\d*)$`, 'i').exec(text.trim());
  return m === null ? null : `${(m[1] ?? '').toUpperCase()}-${m[2]}`;
}

/** Exact, case-sensitive, word-bounded ID in prose (never `bug-12`, `BUG-01`, `FEAT-8a`, `xBUG-9`). */
export const SHORT_ID_IN_TEXT = new RegExp(`\\b(?:${ALT})-[1-9]\\d*\\b`, 'g');

/** A bare number (`12`) -> the digits; else null. */
export function parseBareNumber(text: string): string | null {
  const t = text.trim();
  return /^[1-9]\d*$/.test(t) ? t : null;
}

/** True when `shortId` is `<PREFIX>-<n>` for this bare number, whatever the prefix. */
export function carriesNumber(shortId: string | null, n: string): boolean {
  return (
    shortId !== null &&
    shortId.endsWith(`-${n}`) &&
    /^[A-Z]+$/.test(shortId.slice(0, -n.length - 1))
  );
}

/**
 * The `?item=` value -> the task uuid it names: a uuid as is, else a short ID in
 * any read form (`BUG-12`, `jb12`, bare `12`). Unknown values pass through, so the
 * drawer shows its usual "not found" instead of a blank.
 */
export function resolveItemParam(tasks: readonly Task[] | undefined, param: string): string {
  if (tasks === undefined || tasks.some((t) => t.id === param)) return param;
  const typed = parseShortId(param);
  if (typed !== null) return tasks.find((t) => t.short_id === typed)?.id ?? param;
  const n = parseBareNumber(param);
  if (n === null) return param;
  // A bare number names an Item only when exactly one kind carries it; with several
  // it passes through and the server's 409 `children` answer is the chooser's data.
  const holders = tasks.filter((t) => carriesNumber(t.short_id, n));
  return holders.length === 1 ? (holders[0] as Task).id : param;
}

/**
 * The `?item=` value to write for a task: its short ID once pushed, else its uuid.
 * An unpushed Item's short ID is provisional: the git writer may renumber it after
 * its rebase, and a `?item=BUG-63` left in the URL would then name another Item.
 */
export function itemParam(tasks: readonly Task[] | undefined, id: string): string {
  const t = tasks?.find((x) => x.id === id);
  return t === undefined || t.unpushed ? id : (t.short_id ?? id);
}

/** Short ID -> uuid, for linkifying prose to known Items only. */
export function shortIdIndex(tasks: readonly Task[] | undefined): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const t of tasks ?? []) if (t.short_id !== null) out.set(t.short_id, t.id);
  return out;
}

/** Short ID -> kind (and ticket type), for the pill beside a linkified mention. */
export function shortIdKinds(
  tasks: readonly Task[] | undefined,
): ReadonlyMap<string, { kind: string; ticketType: string | null }> {
  const out = new Map<string, { kind: string; ticketType: string | null }>();
  for (const t of tasks ?? [])
    if (t.short_id !== null) out.set(t.short_id, { kind: t.kind, ticketType: t.ticket_type });
  return out;
}
