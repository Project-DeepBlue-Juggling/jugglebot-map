import { createContext } from 'react';
import type { User } from '../api/schemas';
import type { AuthClient } from './types';

export interface AuthContextValue {
  user: User | null;
  availableUsers: User[];
  loading: boolean;
  error: Error | null;
  switchUser: (userId: string) => Promise<void>;
  client: AuthClient;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
