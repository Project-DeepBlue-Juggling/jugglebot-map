import { describe, expect, it } from 'vitest';
import { clipTitle, KEY_HEAD, railCaps } from './layout';

describe('railCaps', () => {
  it('leaves every panel at its content height when all fit', () => {
    expect(railCaps([100, 60, KEY_HEAD], 400)).toEqual([100, 60, KEY_HEAD]);
  });

  it('caps only the panel above its fair share and gives the surplus of small ones to it', () => {
    // 3 panels, 300 px: fair share 100; the 40 px panel keeps 40, the other two split 260 -> 130.
    expect(railCaps([40, 200, 400], 300)).toEqual([40, 130, 130]);
  });

  it('caps every over-share panel equally when none is small', () => {
    expect(railCaps([300, 300, 300], 300)).toEqual([100, 100, 100]);
  });

  it('never exceeds the available height in total when something is capped', () => {
    const caps = railCaps([500, 20, 90], 250);
    expect(caps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(250);
    expect(caps[1]).toBe(20);
  });
});

describe('clipTitle', () => {
  it('cuts past 85 characters with an ellipsis and leaves short titles alone', () => {
    expect(clipTitle('short')).toBe('short');
    const long = 'x'.repeat(100);
    expect(clipTitle(long)).toHaveLength(85);
    expect(clipTitle(long).endsWith('…')).toBe(true);
  });
});
