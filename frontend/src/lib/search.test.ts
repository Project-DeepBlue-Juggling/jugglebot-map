import { describe, expect, it } from 'vitest';
import type { Glossary } from '../api/schemas';
import { mapTask } from '../test/mapFixtures';
import { GROUP_CAP, searchMap } from './search';

const glossary: Glossary = {
  clusters: [
    {
      name: 'Juggling',
      terms: [
        {
          term: 'Throw',
          definition: 'The release of a ball.',
          avoid: ['toss', 'lob'],
          anchor: 'term-throw',
        },
        {
          term: 'Feed',
          definition: 'A ball handed in by Ball Butler.',
          avoid: ['reload'],
          anchor: 'term-feed',
        },
        { term: 'Hop', definition: 'A short throw between cups.', avoid: [], anchor: 'term-hop' },
      ],
    },
  ],
};

type Groups = ReturnType<typeof searchMap>;
const titles = (g: Groups[number] | undefined) => (g?.hits ?? []).map((h) => h.title);
const first = (g: Groups): Groups[number] => {
  const x = g[0];
  if (x === undefined) throw new Error('no group');
  return x;
};

describe('searchMap', () => {
  it('returns nothing for a blank query', () => {
    expect(searchMap([mapTask({ id: 'a' })], glossary, '   ')).toEqual([]);
  });

  it('groups by kind in the fixed order, omitting empty groups', () => {
    const tasks = [
      mapTask({ id: 'pl', kind: 'plan', title: 'Wave plan' }),
      mapTask({ id: 'ti', kind: 'ticket', title: 'Wave ticket' }),
      mapTask({ id: 'pw', kind: 'pathway', title: 'Wave pathway' }),
      mapTask({ id: 'ide', kind: 'idea', title: 'Wave idea' }),
      mapTask({ id: 'fe', kind: 'feature', title: 'Wave feature' }),
      mapTask({ id: 'bu', kind: 'bug', title: 'Wave bug' }),
      mapTask({ id: 'ph', kind: 'phase', title: 'Wave phase' }),
    ];
    const g = searchMap(
      tasks,
      {
        clusters: [
          { name: '', terms: [{ term: 'Wave', definition: '', avoid: [], anchor: 'term-wave' }] },
        ],
      },
      'wave',
    );
    expect(g.map((x) => x.key)).toEqual([
      'pathway',
      'bug',
      'feature',
      'idea',
      'ticket',
      'plan',
      'glossary',
    ]);
    expect(g.map((x) => x.label)[6]).toBe('Glossary terms');
  });

  it('is case-insensitive and matches slug and body', () => {
    const tasks = [
      mapTask({ id: 'a', kind: 'bug', title: 'Unrelated', slug: 'cup-wobble' }),
      mapTask({ id: 'b', kind: 'bug', title: 'Other', description: 'The CUP slips' }),
    ];
    const g = searchMap(tasks, undefined, 'CUP');
    expect(g[0]?.hits.map((h) => [h.id, h.tier])).toEqual([
      ['a', 1],
      ['b', 3],
    ]);
  });

  it('ranks title prefix before title word before body, alphabetically within a tier', () => {
    const tasks = [
      mapTask({ id: '1', kind: 'feature', title: 'Zeta cup', description: '' }),
      mapTask({ id: '2', kind: 'feature', title: 'Body only', description: 'about a cup here' }),
      mapTask({ id: '3', kind: 'feature', title: 'Cup beta' }),
      mapTask({ id: '4', kind: 'feature', title: 'Cup alpha' }),
      mapTask({ id: '5', kind: 'feature', title: 'Teacup mid' }),
    ];
    const g = searchMap(tasks, undefined, 'cup');
    expect(titles(g[0])).toEqual(['Cup alpha', 'Cup beta', 'Zeta cup', 'Teacup mid', 'Body only']);
    expect(first(g).hits.map((h) => h.tier)).toEqual([0, 0, 1, 2, 3]);
  });

  it('ranks closed items below open ones, drawn with their status', () => {
    const tasks = [
      mapTask({ id: 'c', kind: 'bug', title: 'Cup prefix closed', status: 'complete' }),
      mapTask({ id: 'o', kind: 'bug', title: 'Body cup open', status: 'open', description: 'x' }),
      mapTask({ id: 'o2', kind: 'bug', title: 'Cup zzz open', status: 'open' }),
    ];
    const hits = first(searchMap(tasks, undefined, 'cup')).hits;
    expect(hits.map((h) => h.id)).toEqual(['o2', 'o', 'c']);
    expect(hits[2]).toMatchObject({ closed: true, status: 'complete' });
  });

  it('matches plans on title and summary', () => {
    const tasks = [
      mapTask({
        id: 'p',
        kind: 'plan',
        title: 'Skill stack',
        description: 'a schedule-driven stack',
      }),
    ];
    expect(searchMap(tasks, undefined, 'schedule')[0]?.key).toBe('plan');
  });

  it('finds the preferred term from an Avoid word and says which word matched', () => {
    const g = searchMap([], glossary, 'toss');
    expect(g).toHaveLength(1);
    expect(first(g).hits).toEqual([
      expect.objectContaining({
        id: 'term-throw',
        title: 'Throw',
        avoid: 'toss',
        group: 'glossary',
      }),
    ]);
  });

  it('does not label a direct term match as an Avoid redirect', () => {
    const hit = first(searchMap([], glossary, 'throw')).hits[0];
    expect(hit).toMatchObject({ title: 'Throw', avoid: null, tier: 0 });
    // Hop's definition mentions "throw": a body-tier hit, ranked after the term itself.
    expect(titles(searchMap([], glossary, 'throw')[0])).toEqual(['Throw', 'Hop']);
  });

  it('caps each group at 8 and counts the rest', () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      mapTask({ id: `b${i}`, kind: 'bug', title: `Cup ${i}` }),
    );
    const g = first(searchMap(tasks, undefined, 'cup'));
    expect(g.hits).toHaveLength(GROUP_CAP);
    expect(g.more).toBe(4);
  });

  it('searches ~300 items plus a glossary in under 100 ms', () => {
    const kinds = ['bug', 'feature', 'idea', 'ticket', 'plan', 'pathway'];
    const tasks = Array.from({ length: 300 }, (_, i) =>
      mapTask({
        id: `t${i}`,
        kind: kinds[i % kinds.length] ?? 'bug',
        title: `Item number ${i} about the hand`,
        description: 'lorem ipsum dolor sit amet '.repeat(40) + `needle${i}`,
      }),
    );
    const big: Glossary = {
      clusters: [
        {
          name: 'x',
          terms: Array.from({ length: 120 }, (_, i) => ({
            term: `Term ${i}`,
            definition: 'd '.repeat(50),
            avoid: [`old${i}`],
            anchor: `term-${i}`,
          })),
        },
      ],
    };
    const t0 = performance.now();
    for (const q of ['hand', 'needle299', 'old7', 'zzz']) searchMap(tasks, big, q);
    expect((performance.now() - t0) / 4).toBeLessThan(100);
  });
});
