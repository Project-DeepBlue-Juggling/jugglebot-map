import type { Verdict } from '../../api/schemas';

/** Verdict labels, hints and colours shared by the per-Item row and the sheet's step cards. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  pass: 'Pass',
  fail: 'Fail',
  pending: 'Pending',
};
export const VERDICT_HINT: Record<Verdict, string> = {
  pass: 'Flown and passed',
  fail: 'Flown and failed',
  pending: 'Flown, but the pass needs the logs or an analysis: /sitting-debrief decides',
};
export const VERDICT_COLOUR: Record<string, string> = {
  pass: 'text-emerald-700 dark:text-emerald-400',
  fail: 'text-red-700 dark:text-red-400',
  pending: 'text-amber-700 dark:text-amber-400',
};
