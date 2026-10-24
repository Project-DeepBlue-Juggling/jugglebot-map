import { ApiError } from './client';

/**
 * The sentence a person should read when a write is refused.
 *
 * `ApiError.message` is built for logs: `422 [object Object]` for a
 * validation error, `409 Part is referenced by…` with a status code in
 * front, `Network error: Failed to fetch`. None of that belongs in a
 * toast. The server already writes a readable `detail` for every refusal
 * a user can cause ("Quantity must be greater than zero."), so this
 * returns that, and the caller's own fallback when there is none.
 *
 * - A string `detail` is returned as written.
 * - A FastAPI/Pydantic 422 carries a **list** of errors; the first one's
 *   `msg` is returned, without Pydantic's `Value error, ` prefix.
 * - A failed fetch (status 0) says the server could not be reached,
 *   because "Could not save" alone reads as though the data were wrong.
 * - Anything else returns `fallback`. A status code is never shown.
 *
 * The extraction `useLineMove` used to do inline (F47 of the 2026-10
 * review), in one place every BOM and catalogue toast can share.
 */
export function apiErrorText(error: unknown, fallback: string): string {
  return apiErrorDetail(error) ?? fallback;
}

/**
 * The same sentence, or `undefined` when the server gave none -- for a
 * toast whose title already says what failed and whose second line is
 * the reason.
 */
export function apiErrorDetail(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  if (error.status === 0) return 'Could not reach the server. Check your connection and try again.';
  const body = error.body;
  if (typeof body !== 'object' || body === null || !('detail' in body)) return undefined;
  const detail: unknown = (body as { detail: unknown }).detail;
  if (typeof detail === 'string' && detail.trim() !== '') return detail;
  if (Array.isArray(detail)) {
    const first: unknown = detail[0];
    if (typeof first === 'object' && first !== null && 'msg' in first) {
      const msg: unknown = (first as { msg: unknown }).msg;
      if (typeof msg === 'string' && msg.trim() !== '') return msg.replace(/^Value error, /, '');
    }
  }
  return undefined;
}
