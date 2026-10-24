import type { TaskStatus } from '../api/schemas';

export interface StatusStyle {
  pillBg: string;
  pillText: string;
  /** Hex value for the left-border accent. Applied via inline style so it
   *  beats the `dark:border-slate-700` shorthand on the wrapper (which
   *  would otherwise win on specificity in dark mode and wash the status
   *  signal out). */
  borderHex: string;
}

export const STATUS_STYLES: Record<TaskStatus, StatusStyle> = {
  backlog: {
    // A muted neutral that reads "parked" and stays distinct from
    // not_started's slate (ADR 0052).
    pillBg: 'bg-zinc-100',
    pillText: 'text-zinc-600',
    borderHex: '#a1a1aa', // zinc-400
  },
  not_started: {
    pillBg: 'bg-slate-200',
    pillText: 'text-slate-700',
    borderHex: '#94a3b8', // slate-400
  },
  in_progress: {
    pillBg: 'bg-blue-100',
    pillText: 'text-blue-800',
    borderHex: '#3b82f6', // blue-500
  },
  blocked: {
    pillBg: 'bg-red-100',
    pillText: 'text-red-800',
    borderHex: '#ef4444', // red-500
  },
  qa: {
    // Violet — distinct from in_progress's blue and complete's green (ADR 0052).
    pillBg: 'bg-violet-100',
    pillText: 'text-violet-800',
    borderHex: '#8b5cf6', // violet-500
  },
  complete: {
    pillBg: 'bg-green-100',
    pillText: 'text-green-800',
    borderHex: '#22c55e', // green-500
  },
  dropped: {
    // ADR 0075. A *warm* dark grey, deliberately: the two greys already in use
    // are both cool (backlog's zinc-400, not_started's slate-400), so warmth is
    // what separates a third grey from them, and darkness is what reads
    // "closed" rather than "parked". Colour alone is not asked to carry this —
    // a dropped task's title is struck through wherever it is drawn.
    pillBg: 'bg-stone-200',
    pillText: 'text-stone-700',
    borderHex: '#78716c', // stone-500
  },
};

export const DEPENDENCY_EDGE_COLOR = '#f59e0b';
export const PARENT_EDGE_COLOR = '#94a3b8';
