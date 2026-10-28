import type { Task } from '../api/schemas';

/**
 * The six item metrics (frontmatter keys after `priority`, spec
 * `metrics/spec.md` of the Jugglebot checkout). Values are lowercase enums in
 * rank order; null on a Task means unrated. `diagnosis` is for bugs only.
 */
export const METRIC_ENUMS = {
  effort: ['xs', 's', 'm', 'l', 'xl'],
  hardware: ['none', 'bench-leg', 'robot'],
  owner: ['none', 'decision', 'hands'],
  radius: ['local', 'subsystem', 'cross-cutting', 'normative'],
  diagnosis: ['unknown', 'hypothesis', 'confirmed'],
  area: [
    'firmware',
    'can-bridge',
    'legs',
    'hand',
    'platform-teensy',
    'tracking',
    'ball-butler',
    'skill-stack',
    'learner',
    'gui',
    'map-app',
    'tests-tooling',
    'docs',
    'sim',
  ],
} as const;

export type MetricKey = keyof typeof METRIC_ENUMS;
export const METRIC_KEYS = Object.keys(METRIC_ENUMS) as MetricKey[];

export const METRIC_LABELS: Record<MetricKey, string> = {
  effort: 'Effort',
  hardware: 'Hardware',
  owner: 'Owner needed',
  radius: 'Radius',
  diagnosis: 'Diagnosis',
  area: 'Area',
};

export const EFFORT_VALUES = METRIC_ENUMS.effort;

/** Rank of an effort (xs = 0); unrated or unknown sorts after xl. */
export function effortRank(e: string | null): number {
  const i = e === null ? -1 : (EFFORT_VALUES as readonly string[]).indexOf(e);
  return i === -1 ? EFFORT_VALUES.length : i;
}

/**
 * "Break-sized": effort xs or s AND hardware none AND owner none (AND
 * diagnosis confirmed for a bug). An unrated field disqualifies the item.
 */
export function isBreakSized(t: Task): boolean {
  if (t.effort !== 'xs' && t.effort !== 's') return false;
  if (t.hardware !== 'none' || t.owner !== 'none') return false;
  return t.kind !== 'bug' || t.diagnosis === 'confirmed';
}

/** The metric keys that apply to this kind (diagnosis is bugs only). */
export function metricKeysFor(kind: string): MetricKey[] {
  return METRIC_KEYS.filter((k) => k !== 'diagnosis' || kind === 'bug');
}
