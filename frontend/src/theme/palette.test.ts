import { describe, expect, it } from 'vitest';
import type { Task } from '../api/schemas';
import { KIND_HUES, kindHue, pathwayHues, STATE_STYLES, TICKET_HUE } from './palette';

describe('palette', () => {
  it('gives six pathways six distinct hues', () => {
    const pws = Array.from({ length: 6 }, (_, i) => ({ id: `pw${i}` }) as Task);
    const hues = pathwayHues(pws);
    expect(new Set(hues.values()).size).toBe(6);
  });

  it('maps the inbox kinds to rose / sky / amber and anything else to the ticket neutral', () => {
    expect(kindHue('bug')).toBe(KIND_HUES.bug);
    expect(KIND_HUES.bug.chip).toContain('rose');
    expect(KIND_HUES.feature.chip).toContain('sky');
    expect(KIND_HUES.idea.chip).toContain('amber');
    expect(kindHue('ticket')).toBe(TICKET_HUE);
  });

  it('gives every state a distinct segment colour', () => {
    const hexes = Object.values(STATE_STYLES).map((s) => s.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
  });
});
