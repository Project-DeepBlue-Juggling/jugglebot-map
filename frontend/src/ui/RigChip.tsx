import { HARDWARE_LABELS } from '../lib/metrics';
import { RIG_HUES } from '../theme/palette';

/** The rig a Sitting needs (Robot, Bench leg, Bench hand) as a small coloured chip. */
export function RigChip({ hardware }: { hardware: string }) {
  const hue =
    RIG_HUES[hardware] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return (
    <span
      data-testid="rig-chip"
      className={`mr-1 inline-block shrink-0 rounded px-1.5 py-px align-baseline text-[10px] font-medium leading-tight ${hue}`}
    >
      {HARDWARE_LABELS[hardware] ?? hardware}
    </span>
  );
}
