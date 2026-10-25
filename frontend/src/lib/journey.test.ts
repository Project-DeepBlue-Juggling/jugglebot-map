import { describe, expect, it } from 'vitest';
import { dep, mapTask, planWithPhases } from '../test/mapFixtures';
import { buildIndex } from './derive';
import {
  activePathways,
  donePrefix,
  inboxPartition,
  journeyByPlan,
  pathwayHue,
  progressLabel,
  splitTrack,
} from './journey';

const stationIds = (j: ReturnType<typeof journeyByPlan>) =>
  j.plans.map((g) => g.stations.map((s) => `${s.task.id}:${s.state}`));

describe('journeyByPlan', () => {
  it('puts the plan holding Next first, keeping its done-prefix phases as done stations', () => {
    const pw = mapTask({ id: 'pw' });
    const tasks = [
      pw,
      ...planWithPhases('a', 'pw', ['not_started'], { title: 'A' }),
      ...planWithPhases('b', 'pw', ['complete', 'complete', 'not_started', 'not_started'], {
        title: 'B',
      }),
    ];
    // Block plan a behind an open blocker so b holds Next.
    const ix = buildIndex([...tasks, mapTask({ id: 'blk', kind: 'ticket', status: 'open', pathway_id: 'pw', parent_id: 'pw' })], [dep('blk', 'a')]);
    const j = journeyByPlan(ix, pw);
    expect(j.plans.map((g) => g.plan.id)).toEqual(['b', 'a']);
    expect(stationIds(j)[0]).toEqual(['b#P1:done', 'b#P2:done', 'b#P3:next', 'b#P4:later']);
    expect(donePrefix(j.plans[0].stations)).toBe(2);
    const { focus, later } = splitTrack(j.plans[0].stations);
    expect(focus?.task.id).toBe('b#P3');
    expect(later.map((s) => s.task.id)).toEqual(['b#P4']);
  });

  it('compresses done plans into the capsule, excludes parked plans and lists tickets after plans', () => {
    const pw = mapTask({ id: 'pw' });
    const tasks = [
      pw,
      ...planWithPhases('done', 'pw', ['complete'], { status: 'complete' }),
      ...planWithPhases('park', 'pw', ['not_started'], { status: 'parked' }),
      ...planWithPhases('open', 'pw', ['in_progress']),
      mapTask({ id: 'tk-open', kind: 'ticket', status: 'open', pathway_id: 'pw', parent_id: 'pw' }),
      mapTask({ id: 'tk-done', kind: 'ticket', status: 'complete', pathway_id: 'pw', parent_id: 'pw' }),
    ];
    const j = journeyByPlan(buildIndex(tasks, []), pw);
    expect(j.doneCapsule).toMatchObject({ units: 1, doneTickets: 1 });
    expect(j.parked.map((p) => p.id)).toEqual(['park']);
    expect(j.plans.map((g) => g.plan.id)).toEqual(['open']);
    expect(j.tickets.map((s) => [s.task.id, s.code, s.isTicket])).toEqual([['tk-open', 'T', true]]);
  });

  it('reports a Next outside the Pathway stations as external', () => {
    const pw = mapTask({ id: 'pw' });
    const tasks = [
      pw,
      ...planWithPhases('a', 'pw', ['not_started']),
      mapTask({ id: 'elsewhere', kind: 'ticket', status: 'open' }),
    ];
    // Every unfinished phase of the only plan waits on a ticket outside the Pathway.
    const j = journeyByPlan(buildIndex(tasks, [dep('elsewhere', 'a#P1'), dep('elsewhere', 'a')]), pw);
    expect(j.external?.id).toBe('elsewhere');
  });

  it('stops the done prefix at the first non-done station', () => {
    const stations = journeyByPlan(
      buildIndex([mapTask({ id: 'pw' }), ...planWithPhases('a', 'pw', ['complete', 'in_progress', 'complete'])], []),
      mapTask({ id: 'pw' }),
    ).plans[0].stations;
    expect(donePrefix(stations)).toBe(1);
  });

  it('gives a phase-less plan one station coded with its initials', () => {
    const pw = mapTask({ id: 'pw' });
    const plan = mapTask({ id: 'box-sweep-fidelity', kind: 'plan', status: 'active', parent_id: 'pw', pathway_id: 'pw' });
    const j = journeyByPlan(buildIndex([pw, plan], []), pw);
    expect(j.plans[0].stations).toHaveLength(1);
    expect(j.plans[0].stations[0]).toMatchObject({ code: 'BSF', state: 'now' });
  });
});

describe('pathways', () => {
  it('keeps complete and dropped Pathways out of the active list', () => {
    const pws = [
      mapTask({ id: 'a' }),
      mapTask({ id: 'old', status: 'complete', destination: 'met 2026-09-01' }),
      mapTask({ id: 'new', status: 'complete', destination: 'met 2026-10-13' }),
      mapTask({ id: 'gone', status: 'dropped' }),
    ];
    expect(activePathways(pws).map((p) => p.id)).toEqual(['a']);
  });

  it('cycles hues by active index and greys a pathway that is not active', () => {
    const active = [mapTask({ id: 'a' }), mapTask({ id: 'b' })];
    expect(pathwayHue(active, 'a')).not.toBe(pathwayHue(active, 'b'));
    expect(pathwayHue(active, 'zzz')).toBe('var(--nnl-complete)');
  });

  it('labels progress as done/total', () => {
    const pw = mapTask({ id: 'pw' });
    const ix = buildIndex([pw, ...planWithPhases('a', 'pw', ['complete', 'not_started'])], []);
    expect(progressLabel(ix, pw).text).toBe('1/2');
  });
});

describe('inboxPartition', () => {
  it('places every open inbox item exactly once, including items of a complete Pathway', () => {
    const tasks = [
      mapTask({ id: 'pw' }),
      mapTask({ id: 'finished', status: 'complete' }),
      mapTask({ id: 'b1', kind: 'bug', status: 'inbox', pathway_id: 'pw' }),
      mapTask({ id: 'f1', kind: 'feature', status: 'inbox', pathway_id: 'pw' }),
      mapTask({ id: 'i-loose', kind: 'idea', status: 'inbox' }),
      mapTask({ id: 'b-arrived', kind: 'bug', status: 'inbox', pathway_id: 'finished' }),
      mapTask({ id: 'b-missing', kind: 'bug', status: 'inbox', pathway_id: 'no-such' }),
      mapTask({ id: 'b-done', kind: 'bug', status: 'complete', pathway_id: 'pw' }),
    ];
    const ix = buildIndex(tasks, []);
    const part = inboxPartition(ix, tasks.filter((t) => t.kind === 'pathway'));
    const attached = [...part.attached.values()].flat().map((t) => t.id);
    const unattached = [part.unattached.bug, part.unattached.feature, part.unattached.idea].flat().map((t) => t.id);
    expect(attached).toEqual(['b1', 'f1']);
    expect(unattached.sort()).toEqual(['b-arrived', 'b-missing', 'i-loose']);
    const open = tasks.filter((t) => ['bug', 'feature', 'idea'].includes(t.kind) && t.status !== 'complete').map((t) => t.id);
    expect([...attached, ...unattached].sort()).toEqual([...open].sort());
    expect(attached.filter((id) => unattached.includes(id))).toEqual([]);
  });
});
