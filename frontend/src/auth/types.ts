import type { User } from '../api/schemas';

export interface AuthClient {
  /** Resolve the current user. */
  getCurrentUser(): Promise<User>;
  /** List selectable identities (the server's synthetic users). */
  listAvailableUsers(): Promise<User[]>;
  /** Switch the active identity; a no-op for the static client. */
  switchUser(userId: string): Promise<void>;
  /** Attach auth to a Request; the static client returns it unchanged. */
  attachAuth(request: Request): Promise<Request>;
  /** Bake auth into a URL for transports that cannot carry headers. */
  attachAuthToUrl(url: URL): Promise<URL>;
  /** Subscribe to active-user changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
