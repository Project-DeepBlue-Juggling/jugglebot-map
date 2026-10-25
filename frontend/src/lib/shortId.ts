import type { Task } from '../api/schemas';

/**
 * Short Item IDs (`JB-<n>`, one global sequence; mapkit `ids.py`). The task uuid
 * stays the API key; the short ID is what people type and say. Plans and phases
 * have none (`short_id: null`) and keep the uuid in links.
 */

/** A typed ID in any case, hyphen optional (`JB-12`, `jb12`) -> 12; else null. */
export function parseShortId(text: string): number | null {
  const m = /^jb-?([1-9]\d*)$/i.exec(text.trim());
  return m === null ? null : Number(m[1]);
}

/** Exact, case-sensitive, word-bounded `JB-<n>` in prose (never `jb-8a`, never `JB-01`). */
export const SHORT_ID_IN_TEXT = /\bJB-[1-9]\d*\b/g;

/**
 * The `?item=` value -> the task uuid it names: a uuid as is, else a short ID in
 * any read form (`JB-12`, `jb12`, bare `12`). Unknown values pass through, so the
 * drawer shows its usual "not found" instead of a blank.
 */
export function resolveItemParam(tasks: readonly Task[] | undefined, param: string): string {
  if (tasks === undefined || tasks.some((t) => t.id === param)) return param;
  const n = parseShortId(param) ?? (/^[1-9]\d*$/.test(param) ? Number(param) : null);
  if (n === null) return param;
  const hit = tasks.find((t) => t.short_id === `JB-${n}`);
  return hit === undefined ? param : hit.id;
}

/** The `?item=` value to write for a task: its short ID when it has one, else its uuid. */
export function itemParam(tasks: readonly Task[] | undefined, id: string): string {
  return tasks?.find((t) => t.id === id)?.short_id ?? id;
}

/** `JB-<n>` -> uuid, for linkifying prose to known Items only. */
export function shortIdIndex(tasks: readonly Task[] | undefined): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const t of tasks ?? []) if (t.short_id !== null) out.set(t.short_id, t.id);
  return out;
}
