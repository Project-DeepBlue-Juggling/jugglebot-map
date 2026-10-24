// @vitest-environment node
// Live contract check: parses every GET response of a running server with the
// frontend's zod schemas. Skipped unless CONTRACT_BASE_URL is set, e.g.
//   CONTRACT_BASE_URL=http://127.0.0.1:8799 npm run contract
// Strict parsing, so an extra key from the server fails as loudly as a missing one.
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  CurrentUser,
  DependencyEdgeList,
  Health,
  Project,
  ProjectList,
  ProjectMembershipList,
  TaskDetail,
  TaskList,
  UserList,
} from './schemas';

const BASE = process.env.CONTRACT_BASE_URL;

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/api/v1${path}`);
  expect(res.status, path).toBe(200);
  return res.json();
}

function parse(schema: z.ZodTypeAny, body: unknown, label: string): unknown {
  const r = schema.safeParse(body);
  if (!r.success) throw new Error(`${label}: ${JSON.stringify(r.error.issues, null, 1)}`);
  return r.data;
}

/** Keys the server sent that the schema does not declare (zod would strip them silently). */
function extraKeys(schema: z.ZodTypeAny, body: unknown): string[] {
  const obj = body as Record<string, unknown>;
  const shape = (schema as unknown as z.AnyZodObject).shape as Record<string, unknown>;
  return Object.keys(obj).filter((k) => !(k in shape));
}

describe.skipIf(BASE === undefined)('live contract', () => {
  it('every response parses, with no extra or missing keys', async () => {
    const users = await get('/users');
    parse(UserList, users, '/users');
    for (const u of users as object[]) expect(extraKeys(CurrentUser, u), '/users').toEqual([]);

    const me = await get('/users/me');
    parse(CurrentUser, me, '/users/me');
    expect(extraKeys(CurrentUser, me), '/users/me').toEqual([]);

    const projects = (await get('/projects')) as { id: string }[];
    parse(ProjectList, projects, '/projects');
    const pid = projects[0]?.id;
    expect(pid).toBeDefined();
    for (const p of projects) expect(extraKeys(Project, p), '/projects').toEqual([]);

    const project = await get(`/projects/${pid}`);
    parse(Project, project, 'project');
    expect(extraKeys(Project, project), 'project').toEqual([]);

    const members = (await get(`/projects/${pid}/memberships`)) as object[];
    parse(ProjectMembershipList, members, 'memberships');
    expect(members.length).toBeGreaterThan(0);
    const memberKeys = Object.keys(members[0] as object).sort();
    expect(memberKeys).toEqual(
      ['created_at', 'created_by', 'project_id', 'role', 'user_id'].sort(),
    );

    const tasks = (await get(`/projects/${pid}/tasks`)) as { id: string }[];
    parse(TaskList, tasks, 'tasks');
    expect(tasks.length).toBeGreaterThan(0);
    // Task and TaskDetail share the schema's key set; compare each row's key set.
    const taskKeys = Object.keys(TaskDetail.shape)
      .filter((k) => k !== 'blocking' && k !== 'blocked_by')
      .sort();
    for (const t of tasks) expect(Object.keys(t).sort(), 'task row').toEqual(taskKeys);

    const detail = await get(`/projects/${pid}/tasks/${tasks[0]?.id}`);
    parse(TaskDetail, detail, 'task detail');
    expect(Object.keys(detail as object).sort(), 'task detail').toEqual(
      Object.keys(TaskDetail.shape).sort(),
    );

    const deps = (await get(`/projects/${pid}/dependencies`)) as object[];
    parse(DependencyEdgeList, deps, 'dependencies');

    const health = await get('/health');
    parse(Health, health, 'health');
  });
});
