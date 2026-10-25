/**
 * The Now / Next / Later page's palette: three channels, three encodings
 * (Pathway hue / stage status / item kind). Separate from `palette.ts` because
 * this page paints on its own canvas and amber is reserved for Next.
 *
 * Every colour is a CSS custom property (`--nnl-*`, defined for both themes in
 * `index.css`), so the pages follow the `dark` class on <html>. These are
 * `var()` references, not hex: never append alpha digits (`${hue}59`); use
 * `tint()` below.
 */
export const NNL = {
  canvas: 'var(--nnl-canvas)',
  surface: 'var(--nnl-surface)',
  raised: 'var(--nnl-raised)',
  border: 'var(--nnl-border)',
  borderStrong: 'var(--nnl-border-strong)',
  textHi: 'var(--nnl-text-hi)',
  textMed: 'var(--nnl-text-med)',
  textLo: 'var(--nnl-text-lo)',
  /** Text on a solid Pathway-hue fill. */
  onHue: 'var(--nnl-on-hue)',
  status: {
    /** Reserved: amber means Next and nothing else. */
    next: 'var(--nnl-next)',
    later: 'var(--nnl-later)',
    blocked: 'var(--nnl-blocked)',
    /** Blocked as TEXT (the mark hue fails 4.5:1). */
    blockedText: 'var(--nnl-blocked-text)',
    complete: 'var(--nnl-complete)',
  },
  kind: {
    bug: { hex: 'var(--nnl-kind-bug)', glyph: '■', label: 'Bug' },
    feature: { hex: 'var(--nnl-kind-feature)', glyph: '●', label: 'Feature' },
    idea: { hex: 'var(--nnl-kind-idea)', glyph: '◇', label: 'Idea' },
  },
  /** Eight Pathway hues (indigo, teal, orange, lime, orchid, olive, sage, sand). */
  pathwayHues: [
    'var(--nnl-hue-0)',
    'var(--nnl-hue-1)',
    'var(--nnl-hue-2)',
    'var(--nnl-hue-3)',
    'var(--nnl-hue-4)',
    'var(--nnl-hue-5)',
    'var(--nnl-hue-6)',
    'var(--nnl-hue-7)',
  ],
} as const;

/** A translucent version of a colour (any CSS colour, including a `var()`), `pct` percent opaque. */
export function tint(colour: string, pct: number): string {
  return `color-mix(in srgb, ${colour} ${pct}%, transparent)`;
}

/** The three inbox kinds, in the order the page lists them. */
export type InboxKind = 'bug' | 'feature' | 'idea';
export const INBOX_ORDER: readonly InboxKind[] = ['bug', 'feature', 'idea'];
