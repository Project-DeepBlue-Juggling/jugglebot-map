import { useEffect, useState, type ReactNode } from 'react';
import type { User } from '../api/schemas';
import type { AuthClient } from './types';
import { AuthContext } from './authContextValue';

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [resolved, list] = await Promise.all([
          client.getCurrentUser(),
          client.listAvailableUsers(),
        ]);
        if (cancelled) return;
        setUser(resolved);
        setAvailableUsers(list);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err as Error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const unsubscribe = client.subscribe(() => {
      void client
        .getCurrentUser()
        .then((u) => {
          if (!cancelled) setUser(u);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err as Error);
        });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client]);

  const switchUser = async (userId: string) => {
    await client.switchUser(userId);
  };

  return (
    <AuthContext.Provider value={{ user, availableUsers, loading, error, switchUser, client }}>
      {children}
    </AuthContext.Provider>
  );
}
