import { ApiError } from '../../api/client';

/** One Item the server matched against a new title (mapkit.similar.as_dict + id). */
export interface TitleMatch {
  id: string;
  short_id: string | null;
  stem: string;
  kind: string;
  title: string;
  status: string;
  exact: boolean;
  score: number;
}

export type TitleConflict =
  | { code: 'duplicate'; duplicate: TitleMatch }
  | { code: 'similar'; similar: TitleMatch[] };

/** The create endpoint's 409 title screen, or null for any other error. */
export function titleConflict(err: unknown): TitleConflict | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const b = err.body as {
    code?: unknown;
    duplicate?: TitleMatch | null;
    similar?: TitleMatch[];
  } | null;
  if (b?.code === 'duplicate' && b.duplicate) return { code: 'duplicate', duplicate: b.duplicate };
  if (b?.code === 'similar' && Array.isArray(b.similar) && b.similar.length > 0) {
    return { code: 'similar', similar: b.similar };
  }
  return null;
}

export function matchLabel(m: TitleMatch): string {
  return `${m.short_id ?? m.stem} (${m.status.replace('_', ' ')}) ${m.title}`;
}
