import type { z } from 'zod';
import type { AuthClient } from '../auth/types';
import {
  CurrentUser,
  DependencyEdge,
  DependencyEdgeList,
  Glossary,
  Project,
  ProjectList,
  ProjectMembershipList,
  Task,
  TaskDetail,
  TaskList,
  UserList,
  type DependencyCreateBody,
  type TaskCreateBody,
  type TaskUpdateBody,
  type UserPatchSelfBody,
  Health,
} from './schemas';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(auth: AuthClient) {
  async function request<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T> | null,
  ): Promise<T> {
    const req = new Request(`${BASE_URL}${path}`, init);
    const authed = await auth.attachAuth(req);
    let res: Response;
    try {
      res = await fetch(authed);
    } catch (err) {
      throw new ApiError(0, null, `Network error: ${(err as Error).message}`);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    const contentType = res.headers.get('content-type') ?? '';
    const body: unknown = contentType.includes('application/json')
      ? await res.json()
      : await res.text();
    if (!res.ok) {
      const detail =
        typeof body === 'object' && body !== null && 'detail' in body
          ? String((body as { detail: unknown }).detail)
          : res.statusText;
      throw new ApiError(res.status, body, `${res.status} ${detail}`);
    }
    if (schema === null) {
      return undefined as T;
    }
    return schema.parse(body);
  }

  function jsonInit(method: string, body?: unknown): RequestInit {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    return init;
  }

  return {
    // -- Workspace-level
    getUsers: () => request('/users', jsonInit('GET'), UserList),
    /** The caller's own row, carrying the two availability bits the nav
     *  gates on (ADR 0063 §6). `/users` is the directory and does not
     *  carry `is_availability_member`. */
    getHealth: () => request('/health', jsonInit('GET'), Health),
    getMe: () => request('/users/me', jsonInit('GET'), CurrentUser),
    /** Returns `CurrentUserRead`, not `UserRead` — deliberately widened so
     *  a client that replaces its cached user object from this response
     *  does not drop the availability bits and flicker the nav entry off. */
    patchSelf: (body: UserPatchSelfBody) =>
      request('/users/me', jsonInit('PATCH', body), CurrentUser),

    // -- Projects (collection + instance, ADR 0020)
    listProjects: () => request('/projects', jsonInit('GET'), ProjectList),
    getProject: (projectId: string) => request(`/projects/${projectId}`, jsonInit('GET'), Project),

    // -- Memberships (ADR 0021)
    listMemberships: (projectId: string) =>
      request(`/projects/${projectId}/memberships`, jsonInit('GET'), ProjectMembershipList),

    // -- Tasks (scoped per ADR 0020)
    getTasks: (projectId: string) =>
      request(`/projects/${projectId}/tasks`, jsonInit('GET'), TaskList),
    getTask: (projectId: string, taskId: string) =>
      request(`/projects/${projectId}/tasks/${taskId}`, jsonInit('GET'), TaskDetail),
    createTask: (projectId: string, body: TaskCreateBody) =>
      request(`/projects/${projectId}/tasks`, jsonInit('POST', body), Task),
    patchTask: (projectId: string, taskId: string, body: TaskUpdateBody) =>
      request(`/projects/${projectId}/tasks/${taskId}`, jsonInit('PATCH', body), Task),
    deleteTask: (projectId: string, taskId: string) =>
      request<undefined>(`/projects/${projectId}/tasks/${taskId}`, jsonInit('DELETE'), null),

    // -- Glossary (read-only)
    getGlossary: (projectId: string) =>
      request(`/projects/${projectId}/glossary`, jsonInit('GET'), Glossary),

    // -- Dependencies (scoped per ADR 0020)
    getDependencies: (projectId: string) =>
      request(`/projects/${projectId}/dependencies`, jsonInit('GET'), DependencyEdgeList),
    createDependency: (projectId: string, body: DependencyCreateBody) =>
      request(`/projects/${projectId}/dependencies`, jsonInit('POST', body), DependencyEdge),
    deleteDependency: (projectId: string, dependencyId: string) =>
      request<undefined>(
        `/projects/${projectId}/dependencies/${dependencyId}`,
        jsonInit('DELETE'),
        null,
      ),
  };
}
