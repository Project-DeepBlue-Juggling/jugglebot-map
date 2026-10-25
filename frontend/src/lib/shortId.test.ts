import { describe, expect, it } from 'vitest';
import { mapTask } from '../test/mapFixtures';
import {
  SHORT_ID_IN_TEXT,
  itemParam,
  parseShortId,
  resolveItemParam,
  shortIdIndex,
} from './shortId';

const tasks = [
  mapTask({ id: 'uuid-a', kind: 'bug', short_id: 'JB-12' }),
  mapTask({ id: 'uuid-plan', kind: 'plan', short_id: null }),
];

describe('short Item IDs', () => {
  it('parses any case with an optional hyphen, never a zero or a suffix', () => {
    for (const t of ['JB-12', 'jb12', 'Jb-12', ' jb-12 ']) expect(parseShortId(t)).toBe(12);
    for (const t of ['JB-0', 'JB-012', 'XB-3', 'jb-8a', '12', ''])
      expect(parseShortId(t)).toBeNull();
  });

  it('finds only the exact, case-sensitive, word-bounded form in prose', () => {
    const found = 'see JB-12, JB-3. not jb-4, JB-05, JB-8a or xJB-9'.match(SHORT_ID_IN_TEXT);
    expect(found).toEqual(['JB-12', 'JB-3']);
  });

  it('resolves ?item= values to the uuid and writes Items by their short ID', () => {
    for (const p of ['uuid-a', 'JB-12', 'jb12', '12'])
      expect(resolveItemParam(tasks, p)).toBe('uuid-a');
    expect(resolveItemParam(tasks, 'JB-99')).toBe('JB-99'); // unknown: passes through
    expect(resolveItemParam(undefined, 'jb12')).toBe('jb12'); // tasks not loaded yet
    expect(itemParam(tasks, 'uuid-a')).toBe('JB-12');
    expect(itemParam(tasks, 'uuid-plan')).toBe('uuid-plan'); // plans keep the uuid
    const sent = [mapTask({ id: 'uuid-u', kind: 'bug', short_id: 'JB-13', unpushed: true })];
    expect(itemParam(sent, 'uuid-u')).toBe('uuid-u'); // unpushed: the ID is provisional
    expect(shortIdIndex(tasks)).toEqual(new Map([['JB-12', 'uuid-a']]));
  });
});
