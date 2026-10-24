import { describe, expect, it } from 'vitest';
import {
  SENTINEL,
  SENTINEL_ISO,
  addDays,
  sentinelPlusDays,
  sentinelPlusDaysAsDay,
} from './dateFixtures';

describe('frozen test clock (ADR 0033)', () => {
  it('pins `new Date()` to SENTINEL inside test bodies', () => {
    expect(new Date().toISOString()).toBe(SENTINEL_ISO);
  });

  it('pins `Date.now()` to SENTINEL', () => {
    expect(Date.now()).toBe(SENTINEL.getTime());
  });

  it('addDays offsets cleanly forward and backward', () => {
    expect(addDays(SENTINEL, 7).toISOString()).toBe('2026-05-20T12:00:00.000Z');
    expect(addDays(SENTINEL, -1).toISOString()).toBe('2026-05-12T12:00:00.000Z');
  });

  it('sentinelPlusDays / sentinelPlusDaysAsDay produce the right shapes', () => {
    expect(sentinelPlusDays(0)).toBe(SENTINEL_ISO);
    expect(sentinelPlusDays(7)).toBe('2026-05-20T12:00:00.000Z');
    expect(sentinelPlusDaysAsDay(0)).toBe('2026-05-13');
    expect(sentinelPlusDaysAsDay(7)).toBe('2026-05-20');
  });
});
