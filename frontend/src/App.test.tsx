import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('is importable', () => {
    // Full App boot requires a backend and is is left to manual runs against the Python server. This test
    // exists only to keep the module in the compilation graph.
    expect(App).toBeTypeOf('function');
  });
});
