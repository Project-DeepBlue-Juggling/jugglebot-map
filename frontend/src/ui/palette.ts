/**
 * Curated colour palette for tasks and users (ADR 0016).
 *
 * Single source of truth for `tasks.color` and `users.color`. The picker
 * UIs in [TaskDetailPanel] and the profile popover both read from this
 * module, so a palette change only requires a one-file edit. The backend
 * mirrors the palette values in `app/colours.py` and rejects off-palette
 * values at the API boundary.
 */

export interface PaletteEntry {
  /** Display name surfaced as the swatch's accessible label. */
  name: string;
  /** Lower-case `#rrggbb` hex stored on the row. */
  hex: string;
}

export const PALETTE: readonly PaletteEntry[] = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Lime', hex: '#84cc16' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Sky', hex: '#0ea5e9' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Fuchsia', hex: '#d946ef' },
  { name: 'Rose', hex: '#f43f5e' },
];

/** Neutral fallback used when a user has no colour picked yet. */
export const NEUTRAL_USER_COLOUR = '#64748b';
