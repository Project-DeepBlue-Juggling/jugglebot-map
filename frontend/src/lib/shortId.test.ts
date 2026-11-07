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
    for (const t of ['JB-12', 'jb12', 'Jb-12', ' jb-12 ']) expect(parseShortId(t)).toBe('JB-12');
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

  it('T-U11: the five kind prefixes and JB link in prose; case, padding and suffixes do not', () => {
    const text =
      'BUG-12 FEAT-7 IDEA-3 PWAY-2 TKT-31 JB-5 / bug-12 BUG-01 FEAT-8a xBUG-9 BUG12 TICKET-4';
    expect(text.match(SHORT_ID_IN_TEXT)).toEqual([
      'BUG-12',
      'FEAT-7',
      'IDEA-3',
      'PWAY-2',
      'TKT-31',
      'JB-5',
    ]);
  });

  it('parses typed forms of every prefix to the canonical ID, a bare number is not typed', () => {
    expect(parseShortId('bug12')).toBe('BUG-12');
    expect(parseShortId(' Feat-7 ')).toBe('FEAT-7');
    expect(parseShortId('jb-12')).toBe('JB-12');
    for (const t of ['BUG-01', 'FEAT-8a', 'xBUG-9', 'BUG-0', '12', 'TICKET-4'])
      expect(parseShortId(t)).toBeNull();
  });

  it('resolves per-kind IDs; a bare number resolves only when one Item carries it', () => {
    const per = [
      mapTask({ id: 'u-bug', kind: 'bug', short_id: 'BUG-12' }),
      mapTask({ id: 'u-feat', kind: 'feature', short_id: 'FEAT-12' }),
      mapTask({ id: 'u-idea', kind: 'idea', short_id: 'IDEA-3' }),
    ];
    expect(resolveItemParam(per, 'BUG-12')).toBe('u-bug');
    expect(resolveItemParam(per, 'feat12')).toBe('u-feat');
    expect(resolveItemParam(per, '3')).toBe('u-idea');
    expect(resolveItemParam(per, '12')).toBe('12'); // two kinds carry 12: the server's 409 answers
    expect(resolveItemParam(per, '1')).toBe('1'); // never a prefix match
    expect(itemParam(per, 'u-feat')).toBe('FEAT-12');
  });
});
