import { useMemo, type ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import { createApiClient } from './client';
import { ApiContext } from './apiContextValue';

export function ApiProvider({ children }: { children: ReactNode }) {
  const { client: authClient } = useAuth();
  const api = useMemo(() => createApiClient(authClient), [authClient]);
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}
