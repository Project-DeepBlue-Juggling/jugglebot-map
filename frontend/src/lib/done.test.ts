import { describe, expect, it } from 'vitest';
import { mapTask } from '../test/mapFixtures';
import {
  arrivedPathways,
  closedMonths,
  closedItems,
  completionDate,
  groupClosed,
  pathwayOf,
} from './done';

const upd = '2026-10-20T08:00:00Z';

describe('completionDate', () => {
  it('prefers "met <date>" in the Destination over Progress and updated', () => {
    const t = mapTask({
      id: 'a',
      destination: '30 Catches in one Attempt, met 2026-10-13.',
      description: '## Progress\n\n- 2026-10-25: later note\n',
      updated_at: upd,
    });
    expect(completionDate(t)).toBe('2026-10-13');
    expect(completionDate({ ...t, destination: 'Done when met on 2026-09-02.' })).toBe(
      '2026-09-02',
    );
  });

  it('else takes the newest dated Progress line, wherever it sits', () => {
    const t = mapTask({
      id: 'a',
      destination: 'Not yet stated as met.',
      description:
        'Intro 2026-12-31 is not a Progress line.\n\n## Progress\n\n- 2026-10-25: shipped\n- 2026-10-02: began\n- no date here\n\n## Notes\n\n- 2027-01-01: other section\n',
      updated_at: upd,
    });
    expect(completionDate(t)).toBe('2026-10-25');
  });

  it('shares the staleness parse rule: every section, any heading case, separator required, real dates', () => {
    const t = mapTask({
      id: 'a',
      description:
        '## progress\n\n- 2026-10-02: began\n2026-10-09 no separator\n2026-02-30: impossible\n\n## Progress\n\n2026-10-11 - second section\n',
      updated_at: upd,
    });
    expect(completionDate(t)).toBe('2026-10-11');
  });

  it('else falls back to the updated date', () => {
    expect(completionDate(mapTask({ id: 'a', updated_at: upd }))).toBe('2026-10-20');
    expect(
      completionDate(
        mapTask({ id: 'a', description: '## Progress\n\nnothing\n', updated_at: upd }),
      ),
    ).toBe('2026-10-20');
  });
});

const tasks = [
  mapTask({
    id: 'pwNew',
    title: 'New',
    status: 'complete',
    description: '## Progress\n- 2026-10-25: done',
  }),
  mapTask({ id: 'pwOld', title: 'Old', status: 'complete', destination: 'met 2026-09-01.' }),
  mapTask({ id: 'pwDrop', title: 'Dropped', status: 'dropped', updated_at: upd }),
  mapTask({ id: 'pwOpen', title: 'Open', status: 'active' }),
  mapTask({
    id: 'planA',
    kind: 'plan',
    title: 'B plan',
    parent_id: 'pwNew',
    pathway_id: 'pwNew',
    status: 'archived',
  }),
  mapTask({
    id: 'planB',
    kind: 'plan',
    title: 'A plan',
    parent_id: 'pwNew',
    pathway_id: 'pwNew',
    status: 'archived',
  }),
  mapTask({
    id: 'b1',
    kind: 'bug',
    title: 'Bug 1',
    status: 'complete',
    pathway_id: 'pwOld',
    updated_at: '2026-10-05T00:00:00Z',
  }),
  mapTask({
    id: 'f1',
    kind: 'feature',
    title: 'Feat 1',
    status: 'complete',
    pathway_id: 'pwOld',
    updated_at: '2026-09-09T00:00:00Z',
  }),
  mapTask({
    id: 't1',
    kind: 'ticket',
    title: 'Tk',
    status: 'complete',
    parent_id: 'pwNew',
    updated_at: '2026-10-07T00:00:00Z',
  }),
  mapTask({
    id: 'i1',
    kind: 'idea',
    title: 'Loose',
    status: 'complete',
    updated_at: '2026-08-01T00:00:00Z',
  }),
  mapTask({
    id: 'i2',
    kind: 'idea',
    title: 'Dropped idea',
    status: 'dropped',
    updated_at: '2026-10-01T00:00:00Z',
  }),
  mapTask({ id: 'i3', kind: 'idea', title: 'Open idea', status: 'inbox' }),
];

describe('arrivedPathways', () => {
  it('lists complete Pathways newest first with their plans, hiding dropped', () => {
    const r = arrivedPathways(tasks, false);
    expect(r.map((x) => [x.pathway.id, x.date])).toEqual([
      ['pwNew', '2026-10-25'],
      ['pwOld', '2026-09-01'],
    ]);
    expect(r[0].plans.map((p) => p.id)).toEqual(['planB', 'planA']);
  });

  it('includes a dropped Pathway only when asked', () => {
    expect(arrivedPathways(tasks, true).map((x) => x.pathway.id)).toEqual([
      'pwNew',
      'pwDrop',
      'pwOld',
    ]);
  });
});

describe('closed items', () => {
  it('resolves the Pathway through pathway_id, then the parent chain', () => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const get = (id: string) => byId.get(id) as (typeof tasks)[number];
    expect(pathwayOf(get('b1'), byId)?.id).toBe('pwOld');
    expect(pathwayOf(get('t1'), byId)?.id).toBe('pwNew');
    expect(pathwayOf(get('i1'), byId)).toBeNull();
  });

  it('groups by Pathway (newest group first, No Pathway last), items newest first', () => {
    const g = groupClosed(tasks, { showDropped: false });
    expect(g.map((x) => x.pathway?.id ?? null)).toEqual(['pwNew', 'pwOld', null]);
    expect(g[1].items.map((i) => i.task.id)).toEqual(['b1', 'f1']);
    expect(g.flatMap((x) => x.items.map((i) => i.task.id))).not.toContain('i2');
    expect(
      groupClosed(tasks, { showDropped: true }).flatMap((x) => x.items.map((i) => i.task.id)),
    ).toContain('i2');
  });

  it('filters by kind and by month', () => {
    const ids = (o: Parameters<typeof groupClosed>[1]) =>
      groupClosed(tasks, o).flatMap((x) => x.items.map((i) => i.task.id));
    expect(ids({ showDropped: false, kinds: ['bug', 'idea'] })).toEqual(['b1', 'i1']);
    expect(ids({ showDropped: false, month: '2026-09' })).toEqual(['f1']);
    expect(ids({ showDropped: false, month: '2030-01' })).toEqual([]);
  });

  it('builds the month list from the closed dates present, newest first', () => {
    expect(closedMonths(closedItems(tasks, false))).toEqual(['2026-10', '2026-09', '2026-08']);
  });
});
