import type { Runbook, SheetSummary } from '../../api/schemas';
import { HARDWARE_LABELS } from '../../lib/metrics';

/** Rig display order: the Runbook's (mapkit.sitting.HARDWARE). */
export const RIG_ORDER = ['robot', 'bench-leg', 'bench-hand'] as const;

export const rigLabel = (rig: string): string => HARDWARE_LABELS[rig] ?? rig;

/** Sheets grouped by rig in rig order (an unknown rig last), each group keeping the list's newest-first order. */
export function groupSheets(list: SheetSummary[]): { rig: string; sheets: SheetSummary[] }[] {
  const rigs = [
    ...RIG_ORDER,
    ...list.map((s) => s.rig).filter((r) => !RIG_ORDER.includes(r as never)),
  ];
  return [...new Set(rigs)]
    .map((rig) => ({ rig, sheets: list.filter((s) => s.rig === rig) }))
    .filter((g) => g.sheets.length > 0);
}

/**
 * Rigs with waiting Items and no open sheet (a sheet is open while a step is unsaved), in rig
 * order. The Items come from the Runbook's rows, so this holds on a mapkit that still groups
 * them by setup set.
 */
export function rigsWithoutSheet(
  runbook: Runbook | undefined,
  list: SheetSummary[],
): { hardware: string; items: number }[] {
  if (runbook === undefined) return [];
  const count = new Map<string, number>();
  for (const b of runbook.blocks)
    count.set(b.hardware, (count.get(b.hardware) ?? 0) + b.rows.length);
  return RIG_ORDER.filter(
    (hw) => (count.get(hw) ?? 0) > 0 && !list.some((s) => s.rig === hw && s.saved < s.steps),
  ).map((hw) => ({ hardware: hw, items: count.get(hw) ?? 0 }));
}
