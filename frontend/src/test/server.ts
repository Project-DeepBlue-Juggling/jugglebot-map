import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { DependencyEdge, Project, ProjectMembership, Task, User } from '../api/schemas';
import { addWorkingDaysMs } from './workingDays';

const now = '2026-04-23T00:00:00Z';

// `is_availability_admin` is stored on the fixture as false and overlaid
// from `state.availabilityAdminId` by the handlers, so a test that moves
// the admin cannot leave `/users` and `/availability/members` disagreeing.
const devUser: User = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'dev@local',
  display_name: 'Dev Local',
  color: '#4f46e5',
  dark_mode: 'system',
  created_at: now,
};

const alice: User = {
  id: '00000000-0000-0000-0000-000000000002',
  email: 'alice@local',
  display_name: 'Alice',
  color: '#4f46e5',
  dark_mode: 'system',
  created_at: now,
};

const bob: User = {
  id: '00000000-0000-0000-0000-000000000003',
  email: 'bob@local',
  display_name: 'Bob',
  color: '#4f46e5',
  dark_mode: 'system',
  created_at: now,
};

const project: Project = {
  id: '00000000-0000-0000-0000-0000000000aa',
  name: 'Test project',
  stages: ['prototype', 'batch'],
  due_date_warning_days: 7,
  created_at: now,
  created_by: devUser.id,
};

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? '00000000-0000-0000-0000-00000000ff01',
    project_id: project.id,
    parent_id: null,
    title: 'Task',
    description: '',
    completion_criteria: '',
    assignee_ids: [],
    kind: 'prototype',
    slug: 'task',
    destination: '',
    branch: null,
    links: [],
    filed_by: null,
    promoted_to: null,
    rank: null,
    ticket_type: null,
    source_path: 'map/task.md',
    editable: true,
    pathway_id: null,
    short_id: null,
    unpushed: false,
    status: 'not_started',
    priority: null,
    effort: null,
    hardware: null,
    owner: null,
    radius: null,
    diagnosis: null,
    area: null,
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
    effective_start_date: '2026-05-13',
    created_at: now,
    created_by: devUser.id,
    updated_at: now,
    updated_by: devUser.id,
    ...overrides,
  };
}

/** ADR 0059 trigger (c) echo: after a dependency edge is created or deleted,
 *  re-derive the blocked task's due date when it carries an estimate and no
 *  start pin — basis = max(blocker due dates) or today, mirroring the real
 *  backend's reschedule service. Pinned or legacy blocked tasks are left
 *  alone, exactly like `reschedule_task_and_dependents`. */
function rescheduleBlockedTask(state: TestState, blockedId: string): void {
  const idx = state.tasks.findIndex((t) => t.id === blockedId);
  const task = idx === -1 ? undefined : state.tasks[idx];
  if (task === undefined || task.work_days === null || task.start_date !== null) return;
  const blockerDueMs = state.dependencies
    .filter((d) => d.blocked_id === blockedId)
    .map((d) => state.tasks.find((t) => t.id === d.blocker_id)?.due_date)
    .filter((due): due is string => typeof due === 'string')
    .map((due) => Date.parse(due));
  const basisMs = blockerDueMs.length > 0 ? Math.max(...blockerDueMs) : Date.now();
  state.tasks[idx] = {
    ...task,
    effective_start_date: new Date(basisMs).toISOString().slice(0, 10),
    due_date: new Date(addWorkingDaysMs(basisMs, task.work_days)).toISOString(),
    updated_at: new Date(Date.parse(task.updated_at) + 1000).toISOString(),
  };
}

/** A project beyond the seeded one, for tests that need `GET /projects`
 *  to return more than a singleton — the Team Calendar's project filter
 *  (ADR 0067 §4) is the case that does. Push it onto `state.projects`
 *  together with the `makeMembership` rows that populate it. */
export function makeProject(id: string, name: string): Project {
  return {
    id,
    name,
    stages: ['prototype', 'batch'],
    due_date_warning_days: 7,
    created_at: now,
    created_by: devUser.id,
  };
}

export function makeMembership(userId: string, projectId: string): ProjectMembership {
  return {
    user_id: userId,
    project_id: projectId,
    role: 'editor',
    created_at: now,
    created_by: userId,
  };
}

export interface TestState {
  users: User[];
  /** Every project `GET /projects` returns — which is only the projects
   *  the caller is a member of (ADR 0021). Seeded with `project` alone;
   *  a test that needs a second one pushes it here, along with the
   *  memberships that make it non-trivial. The project-*scoped* handlers
   *  still serve `project` whatever id the URL carries, since only the
   *  membership read is per-project. */
  projects: Project[];
  project: Project;
  /** Project memberships across **all** of `projects`, filtered by the
   *  URL's `projectId` on read. */
  memberships: ProjectMembership[];
  tasks: Task[];
  dependencies: DependencyEdge[];
  /** Served raw by `GET /glossary` (a test may seed a malformed payload). */
  glossary: unknown;
  nextTaskSerial: number;
  nextDepSerial: number;
}

export function createState(): TestState {
  const baseMembership = (user_id: string, project_id = project.id): ProjectMembership => ({
    user_id,
    project_id,
    role: 'editor',
    created_at: now,
    created_by: user_id,
  });
  return {
    users: [alice, bob, devUser],
    projects: [project],
    project,
    memberships: [baseMembership(devUser.id), baseMembership(alice.id), baseMembership(bob.id)],
    tasks: [
      makeTask({
        id: '00000000-0000-0000-0000-00000000ff01',
        title: 'Design chassis',
        assignee_ids: [alice.id],
        status: 'in_progress',
      }),
      makeTask({
        id: '00000000-0000-0000-0000-00000000ff02',
        title: 'Order motors',
        assignee_ids: [bob.id],
        status: 'not_started',
      }),
      makeTask({
        id: '00000000-0000-0000-0000-00000000ff03',
        title: 'Write firmware',
        assignee_ids: [alice.id],
        status: 'blocked',
      }),
    ],
    dependencies: [],
    glossary: {
      clusters: [
        {
          name: 'The machine',
          terms: [
            {
              term: 'Hand',
              definition: 'The seventh actuated axis: a **linear stroke** on the Platform.',
              avoid: ['leg 6', 'seventh leg'],
              anchor: 'term-hand',
            },
            {
              term: 'Cup',
              definition: 'The ball-holding end of the Hand.',
              avoid: [],
              anchor: 'term-cup',
            },
          ],
        },
        {
          name: 'Safety',
          terms: [
            {
              term: 'Guard',
              definition: 'A check that stops motion.',
              avoid: ['limiter'],
              anchor: 'term-guard',
            },
          ],
        },
      ],
    },
    nextTaskSerial: 4,
    nextDepSerial: 1,
  };
}

// All handlers below are scoped under /api/v1/projects/:projectId/... per
// ADR 0020. The test state holds one project; handlers ignore the URL's
// `projectId` segment (no membership enforcement in unit tests — that's
// the backend's job, covered by pytest).
export function makeServer(state: TestState) {
  /** The one fixed signed-in user: the first seeded user. */
  function callerFrom(): User {
    return state.users[0];
  }

  return setupServer(
    http.get('http://localhost:8000/api/v1/health', () =>
      HttpResponse.json({
        status: 'ok',
        errors: [],
        banner: { level: null, message: '', since: null },
      }),
    ),
    // History and nightly default to "nothing to show"; a test overrides with server.use.
    http.get('http://localhost:8000/api/v1/projects/:projectId/tasks/:id/history', () =>
      HttpResponse.json({ head: '', commits: [], documents: [] }),
    ),
    // Night Shift defaults to "no reports, no questions"; a test overrides with server.use.
    http.get('http://localhost:8000/api/v1/night-shift/summary', () =>
      HttpResponse.json({ latest_date: null, open_questions: 0 }),
    ),
    http.get('http://localhost:8000/api/v1/runbook', () =>
      HttpResponse.json({ blocks: [], needs_section: [], questions: [], page: '' }),
    ),
    http.get('http://localhost:8000/api/v1/night-shift/reports', () => HttpResponse.json([])),
    http.get('http://localhost:8000/api/v1/night-shift/questions', () => HttpResponse.json([])),
    http.get('http://localhost:8000/api/v1/nightly', () =>
      HttpResponse.json({
        state: 'NEVER',
        line: '',
        date: null,
        age_days: null,
        configured: false,
      }),
    ),
    http.get('http://localhost:8000/api/v1/users', () => HttpResponse.json(state.users)),

    // `CurrentUserRead` (ADR 0063 §6) = the directory row plus the one
    // computed bit. These two booleans are what the sidebar gates on.
    http.get('http://localhost:8000/api/v1/users/me', () => {
      const caller = callerFrom();
      return HttpResponse.json({
        ...caller,
      });
    }),

    // Widened to `CurrentUserRead` too, so a client replacing its cached
    // user object from this response keeps the availability bits.
    http.patch('http://localhost:8000/api/v1/users/me', async ({ request }) => {
      const body = (await request.json()) as {
        color?: string;
        dark_mode?: User['dark_mode'];
      };
      const caller = callerFrom();
      const idx = state.users.findIndex((u) => u.id === caller.id);
      const updated: User = {
        ...caller,
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.dark_mode !== undefined ? { dark_mode: body.dark_mode } : {}),
      };
      if (idx !== -1) state.users[idx] = updated;
      return HttpResponse.json({
        ...updated,
      });
    }),

    // -- Project collection + instance ----------------------------------
    http.get('http://localhost:8000/api/v1/projects', () => HttpResponse.json(state.projects)),
    http.get('http://localhost:8000/api/v1/projects/:projectId', () =>
      HttpResponse.json(state.project),
    ),
    http.patch('http://localhost:8000/api/v1/projects/:projectId', async ({ request }) => {
      const body = (await request.json()) as Partial<Project>;
      if (body.name !== undefined) state.project.name = body.name;
      if (body.stages !== undefined) state.project.stages = body.stages;
      if (body.due_date_warning_days !== undefined) {
        state.project.due_date_warning_days = body.due_date_warning_days;
      }
      return HttpResponse.json(state.project);
    }),

    // -- Memberships ----------------------------------------------------
    //
    // The one project-scoped read that honours the URL's `projectId`:
    // the Team Calendar's project filter is *defined* by who is in which
    // project, so a handler that ignored the segment could not express
    // the thing under test. Everything seeded by `createState` belongs to
    // `state.project`, so the seeded behaviour is unchanged.
    http.get('http://localhost:8000/api/v1/projects/:projectId/memberships', ({ params }) =>
      HttpResponse.json(state.memberships.filter((m) => m.project_id === params.projectId)),
    ),

    // -- Tasks (scoped) -------------------------------------------------
    http.get('http://localhost:8000/api/v1/projects/:projectId/glossary', () =>
      HttpResponse.json(state.glossary as Record<string, unknown>),
    ),

    http.get('http://localhost:8000/api/v1/projects/:projectId/tasks', () =>
      HttpResponse.json(state.tasks),
    ),
    http.get('http://localhost:8000/api/v1/projects/:projectId/tasks/:id', ({ params }) => {
      const task = state.tasks.find((t) => t.id === params.id);
      if (task === undefined) {
        return HttpResponse.json({ detail: 'not found' }, { status: 404 });
      }
      return HttpResponse.json({ ...task, blocking: [], blocked_by: [] });
    }),
    http.post('http://localhost:8000/api/v1/projects/:projectId/tasks', async ({ request }) => {
      const body = (await request.json()) as Partial<Task>;
      const created = makeTask({
        id: `00000000-0000-0000-0000-00000000ff${String(state.nextTaskSerial++).padStart(2, '0')}`,
        title: body.title ?? 'Untitled',
        kind: body.kind ?? 'prototype',
        parent_id: body.parent_id ?? null,
        assignee_ids: body.assignee_ids ?? [],
        status: body.status ?? 'not_started',
        is_section: body.is_section ?? false,
        priority: body.priority ?? null,
        effort: body.effort ?? null,
        hardware: body.hardware ?? null,
        description: body.description ?? '',
        completion_criteria: body.completion_criteria ?? '',
        work_days: body.work_days ?? null,
        start_date: body.start_date ?? null,
        due_date: body.due_date ?? null,
        reviewer_id: body.reviewer_id ?? null,
        canvas_x: body.canvas_x ?? 0,
        canvas_y: body.canvas_y ?? 0,
      });
      // ADR 0059: echo the server-side due derivation for estimated tasks,
      // mirroring the real backend (trigger (a)).
      if (created.work_days !== null) {
        const basisIso = created.start_date ?? `${created.effective_start_date}T00:00:00.000Z`;
        created.due_date = new Date(
          addWorkingDaysMs(Date.parse(basisIso), created.work_days),
        ).toISOString();
      }
      state.tasks.push(created);
      return HttpResponse.json(created);
    }),
    http.patch(
      'http://localhost:8000/api/v1/projects/:projectId/tasks/:id',
      async ({ params, request }) => {
        const idx = state.tasks.findIndex((t) => t.id === params.id);
        if (idx === -1) return HttpResponse.json({ detail: 'not found' }, { status: 404 });
        const body = (await request.json()) as Partial<Task> & { if_unchanged_since?: string };
        const current = state.tasks[idx];
        if (current === undefined) {
          return HttpResponse.json({ detail: 'not found' }, { status: 404 });
        }
        if (
          body.if_unchanged_since !== undefined &&
          body.if_unchanged_since !== current.updated_at
        ) {
          return HttpResponse.json(
            {
              detail: 'concurrent modification',
              current_updated_at: current.updated_at,
              current_updated_by: current.updated_by,
              conflicts: {},
            },
            { status: 409 },
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { if_unchanged_since, ...changes } = body;
        const updated: Task = {
          ...current,
          ...changes,
          updated_at: new Date(Date.parse(current.updated_at) + 1000).toISOString(),
        };
        // ADR 0059: echo the server-side reschedule for estimated tasks
        // (trigger (b)) so optimistic-update tests see the derived values.
        // A pinned start wins the effective-start derivation (serialise_task
        // rule #1); a cleared estimate (work_days: null) deliberately freezes
        // due_date at whatever the merge produced, matching the backend.
        if (typeof body.start_date === 'string') {
          updated.effective_start_date = body.start_date.slice(0, 10);
        }
        if (
          updated.work_days !== null &&
          (body.work_days !== undefined || body.start_date !== undefined)
        ) {
          const basisIso = updated.start_date ?? `${updated.effective_start_date}T00:00:00.000Z`;
          updated.due_date = new Date(
            addWorkingDaysMs(Date.parse(basisIso), updated.work_days),
          ).toISOString();
        }
        state.tasks[idx] = updated;
        return HttpResponse.json(updated);
      },
    ),
    http.delete('http://localhost:8000/api/v1/projects/:projectId/tasks/:id', ({ params }) => {
      const idx = state.tasks.findIndex((t) => t.id === params.id);
      if (idx === -1) return HttpResponse.json({ detail: 'not found' }, { status: 404 });
      state.tasks.splice(idx, 1);
      return new HttpResponse(null, { status: 204 });
    }),

    // -- Dependencies (scoped) ------------------------------------------
    http.get('http://localhost:8000/api/v1/projects/:projectId/dependencies', () =>
      HttpResponse.json(state.dependencies),
    ),
    http.post(
      'http://localhost:8000/api/v1/projects/:projectId/dependencies',
      async ({ request }) => {
        const body = (await request.json()) as { blocker_id: string; blocked_id: string };
        const created: DependencyEdge = {
          id: `00000000-0000-0000-0000-00000000ee${String(state.nextDepSerial++).padStart(2, '0')}`,
          blocker_id: body.blocker_id,
          blocked_id: body.blocked_id,
          created_at: now,
          created_by: devUser.id,
        };
        state.dependencies.push(created);
        // ADR 0059 trigger (c): the new edge changes the blocked task's
        // effective start — reschedule it if it carries an estimate.
        rescheduleBlockedTask(state, created.blocked_id);
        return HttpResponse.json(created, { status: 201 });
      },
    ),
    http.delete(
      'http://localhost:8000/api/v1/projects/:projectId/dependencies/:id',
      ({ params }) => {
        const idx = state.dependencies.findIndex((d) => d.id === params.id);
        const removed = idx === -1 ? undefined : state.dependencies[idx];
        if (removed === undefined) {
          return HttpResponse.json({ detail: 'not found' }, { status: 404 });
        }
        state.dependencies.splice(idx, 1);
        // ADR 0059 trigger (c): the blocked task's effective start may fall
        // back to its other blockers / today once the edge is gone.
        rescheduleBlockedTask(state, removed.blocked_id);
        return new HttpResponse(null, { status: 204 });
      },
    ),
  );
}
