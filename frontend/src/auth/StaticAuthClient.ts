import type { User } from '../api/schemas';
import { CurrentUser, UserList } from '../api/schemas';
import type { AuthClient } from './types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/v1';

/**
 * The one signed-in user is whatever `GET /users/me` says. There is no
 * sign-in flow, no identity header and no user switching.
 */
export class StaticAuthClient implements AuthClient {
  async getCurrentUser(): Promise<User> {
    const res = await fetch(`${BASE_URL}/users/me`);
    if (!res.ok) throw new Error(`GET /users/me failed: ${res.status}`);
    return CurrentUser.parse(await res.json());
  }

  async listAvailableUsers(): Promise<User[]> {
    const res = await fetch(`${BASE_URL}/users`);
    if (!res.ok) throw new Error(`GET /users failed: ${res.status}`);
    return UserList.parse(await res.json());
  }

  async switchUser(): Promise<void> {
    // Single fixed user: nothing to switch.
  }

  attachAuth(request: Request): Promise<Request> {
    return Promise.resolve(request);
  }

  attachAuthToUrl(url: URL): Promise<URL> {
    return Promise.resolve(url);
  }

  subscribe(): () => void {
    return () => undefined;
  }
}
