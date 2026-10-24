import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { createState, makeServer } from './server';
import { renderApp } from './renderApp';
import FrontPage from '../pages/FrontPage';

let server: ReturnType<typeof makeServer>;

beforeEach(() => {
  server = makeServer(createState());
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.close();
});

describe('App provider stack', () => {
  it('renders a project page once /users/me resolves', async () => {
    renderApp('/', <FrontPage />);
    await waitFor(() => {
      expect(screen.getByText('Front page: P4')).toBeInTheDocument();
    });
    expect(await screen.findByText('Alice')).toBeInTheDocument();
  });
});
