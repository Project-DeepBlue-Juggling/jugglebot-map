import { useContext } from 'react';
import { ApiContext } from './apiContextValue';
import type { ApiClient } from './client';

export function useApi(): ApiClient {
  const ctx = useContext(ApiContext);
  if (ctx === null) throw new Error('useApi must be used inside <ApiProvider>');
  return ctx;
}
