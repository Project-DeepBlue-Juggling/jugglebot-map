import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './authContextValue';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
