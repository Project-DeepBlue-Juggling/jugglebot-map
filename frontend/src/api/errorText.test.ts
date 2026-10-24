import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { apiErrorText } from './errorText';

describe('apiErrorText (F47)', () => {
  it("returns the server's sentence, without the status code", () => {
    const error = new ApiError(
      409,
      { detail: 'That part number and revision already exist.' },
      '409 That part number and revision already exist.',
    );
    expect(apiErrorText(error, 'Could not save.')).toBe(
      'That part number and revision already exist.',
    );
  });

  it('reads the first message of a validation list rather than "[object Object]"', () => {
    const error = new ApiError(
      422,
      {
        detail: [
          { loc: ['body', 'quantity'], msg: "Value error, '1,5' is not a quantity.", type: 'x' },
          { loc: ['body', 'notes'], msg: 'second', type: 'y' },
        ],
      },
      '422 [object Object]',
    );
    expect(apiErrorText(error, 'Could not save.')).toBe("'1,5' is not a quantity.");
  });

  it('says the server could not be reached on a network failure', () => {
    const error = new ApiError(0, null, 'Network error: Failed to fetch');
    expect(apiErrorText(error, 'Could not save.')).toMatch(/Could not reach the server/);
  });

  it('falls back when there is no readable detail', () => {
    expect(apiErrorText(new ApiError(500, 'oops', '500 Internal'), 'Could not save.')).toBe(
      'Could not save.',
    );
    expect(apiErrorText(new ApiError(422, { detail: [] }, '422'), 'Could not save.')).toBe(
      'Could not save.',
    );
    expect(apiErrorText(new Error('boom'), 'Could not save.')).toBe('Could not save.');
  });
});
