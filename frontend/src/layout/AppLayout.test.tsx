import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import FrontPage from '../pages/FrontPage';
import { createState, makeServer } from '../test/server';
import { renderApp } from '../test/renderApp';

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

describe('AppLayout', () => {
  it('links only to the two placeholder pages', async () => {
    renderApp('/', <FrontPage />);
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const links = await screen.findAllByRole('link');
    expect(nav).toBeInTheDocument();
    expect(links.map((l) => l.textContent)).toEqual(['Front page', 'Now / Next / Later']);
  });

  it('shows the fixed signed-in user', async () => {
    renderApp('/', <FrontPage />);
    expect(await screen.findByText('Alice')).toBeInTheDocument();
  });
});
