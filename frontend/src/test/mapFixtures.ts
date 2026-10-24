import type { DependencyEdge, Task } from '../api/schemas';

/** A full `Task` with map defaults; override what the test cares about. */
export function mapTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    project_id: 'proj',
    parent_id: null,
    title: overrides.id,
    description: '',
    completion_criteria: '',
    assignee_ids: [],
    kind: 'pathway',
    status: 'active',
    priority: null,
    is_section: false,
    backlog_rank: 0,
    color: null,
    canvas_x: 0,
    canvas_y: 0,
    canvas_collapsed: false,
    work_days: null,
    start_date: null,
    due_date: null,
    reviewer_id: null,
    effective_start_date: null,
    created_at: '2026-05-01T00:00:00Z',
    created_by: 'owner',
    updated_at: '2026-05-01T00:00:00Z',
    updated_by: 'owner',
    slug: overrides.id,
    destination: '',
    branch: null,
    links: [],
    filed_by: null,
    promoted_to: null,
    rank: null,
    ticket_type: null,
    source_path: `map/${overrides.id}.md`,
    editable: true,
    pathway_id: null,
    ...overrides,
  };
}

export function dep(blocker_id: string, blocked_id: string): DependencyEdge {
  return {
    id: `${blocker_id}->${blocked_id}`,
    blocker_id,
    blocked_id,
    created_at: '2026-05-01T00:00:00Z',
    created_by: 'owner',
  };
}

/** A plan under `pathway` with phases of the given statuses (P1..Pn). */
export function planWithPhases(
  id: string,
  pathway: string,
  phaseStatuses: string[],
  planOverrides: Partial<Task> = {},
): Task[] {
  const plan = mapTask({
    id,
    kind: 'plan',
    parent_id: pathway,
    pathway_id: pathway,
    editable: false,
    source_path: `plans/active/${id}.md`,
    ...planOverrides,
  });
  const phases = phaseStatuses.map((status, i) =>
    mapTask({
      id: `${id}#P${i + 1}`,
      slug: `${id}.md#P${i + 1}`,
      title: `Phase ${i + 1} of ${id}`,
      description: `What phase ${i + 1} of ${id} does, in a sentence or two.`,
      kind: 'phase',
      status,
      rank: i,
      parent_id: id,
      pathway_id: pathway,
      editable: false,
    }),
  );
  return [plan, ...phases];
}

/** Six pathways, each with a two-phase plan, plus one item and one ticket each. */
export function sixPathwayMap(): { tasks: Task[]; deps: DependencyEdge[] } {
  const tasks: Task[] = [];
  for (let i = 0; i < 6; i++) {
    const pw = `pw${i}`;
    tasks.push(
      mapTask({
        id: pw,
        title: `Pathway ${i}`,
        destination: `Destination of pathway ${i}: a sentence that says where it ends.`,
        priority: i < 2 ? 'high' : 'medium',
      }),
      ...planWithPhases(`plan${i}`, pw, ['complete', 'in_progress', 'not_started']),
      mapTask({ id: `bug${i}`, kind: 'bug', status: 'inbox', pathway_id: pw, parent_id: pw }),
      mapTask({ id: `tk${i}`, kind: 'ticket', status: 'open', pathway_id: pw, parent_id: pw }),
    );
  }
  tasks.push(mapTask({ id: 'idea-loose', kind: 'idea', status: 'inbox', title: 'Loose idea' }));
  return { tasks, deps: [] };
}
