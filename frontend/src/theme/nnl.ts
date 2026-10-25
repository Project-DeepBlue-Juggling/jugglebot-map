/**
 * The Now / Next / Later page's dark palette: three channels, three encodings
 * (Pathway hue / stage status / item kind). Separate from `palette.ts` because
 * this page paints on its own canvas and amber is reserved for Next.
 */
export const NNL = {
  canvas: '#0e131a',
  surface: '#151b24',
  raised: '#1c2430',
  border: '#2b3542',
  borderStrong: '#3b4757',
  textHi: '#e7ecf3',
  textMed: '#a8b3c2',
  textLo: '#8390a2',
  status: {
    /** Reserved: amber means Next and nothing else. */
    next: '#f7b83d',
    later: '#7d8899',
    blocked: '#f75d59',
    /** Blocked as TEXT (the mark hue fails 4.5:1). */
    blockedText: '#fe8b83',
    complete: '#7d8792',
  },
  kind: {
    bug: { hex: '#ef6e88', glyph: '■', label: 'Bug' },
    feature: { hex: '#5abdf2', glyph: '●', label: 'Feature' },
    idea: { hex: '#c2a7f4', glyph: '◇', label: 'Idea' },
  },
  /** Eight Pathway hues (indigo, teal, orange, lime, orchid, olive, sage, sand). */
  pathwayHues: [
    '#95a4f6',
    '#39c3ae',
    '#e79363',
    '#99b860',
    '#d58ecf',
    '#b4af61',
    '#6fc082',
    '#d3b99b',
  ],
} as const;

/** The three inbox kinds, in the order the page lists them. */
export type InboxKind = 'bug' | 'feature' | 'idea';
export const INBOX_ORDER: readonly InboxKind[] = ['bug', 'feature', 'idea'];
