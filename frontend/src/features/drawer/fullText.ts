/**
 * The drawer's text for a plan/phase description: all of it (the cards clip
 * with `phaseSummary`, the drawer never does), with markdown emphasis and code
 * markers stripped and paragraph breaks kept.
 */
export function fullDescription(description: string | null | undefined): string {
  return (description ?? '')
    .replace(/\*\*|__|`/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
