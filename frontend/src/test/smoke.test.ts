import { describe, expect, it } from 'vitest';
import { createState, makeServer } from './server';

describe('MSW smoke', () => {
  it('intercepts a fetch to /api/v1/users', async () => {
    const state = createState();
    const server = makeServer(state);
    server.listen({ onUnhandledRequest: 'error' });
    try {
      const res = await fetch('http://localhost:8000/api/v1/users', {
        headers: { 'X-Dev-User': 'alice' },
      });
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { email: string }[];
      expect(body.length).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  });
});
