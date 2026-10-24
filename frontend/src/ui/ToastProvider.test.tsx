import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './ToastProvider';
import { useToast } from './useToast';
import { SENTINEL } from '../test/dateFixtures';

/**
 * polish: action-bearing toasts (ADR 0018). The undo wiring lives in each
 * mutation's call-site; the toast surface itself is decoupled from what
 * the action does. These tests cover the surface contract: the action
 * button renders, calling it dismisses the toast and runs the handler,
 * default timeouts respect the action / non-action split, and the toast
 * disappears when its timeout fires.
 */

beforeEach(() => {
  // Reset the global Date-only fake (ADR 0033 / setupTests.ts) before
  // installing the full fake-timer suite this file needs. vitest refuses
  // back-to-back `useFakeTimers` calls without an intervening real-timer
  // reset. Re-anchor the fake clock at SENTINEL so date semantics stay
  // consistent with every other test.
  vi.useRealTimers();
  vi.useFakeTimers({ now: SENTINEL.getTime(), shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

function ToastTrigger({ fire }: { fire: (api: ReturnType<typeof useToast>) => void }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => fire(toast)}>
      fire
    </button>
  );
}

describe('polish: ToastProvider action toasts', () => {
  it('renders the action button when `action` is provided', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger
          fire={(t) =>
            t.info('Task deleted', 'My task', {
              action: { label: 'Undo', handler: () => {} },
            })
          }
        />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Task deleted');
  });

  it('runs the action handler and dismisses on click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const handler = vi.fn();
    render(
      <ToastProvider>
        <ToastTrigger
          fire={(t) =>
            t.info('Task deleted', undefined, {
              action: { label: 'Undo', handler },
            })
          }
        />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'fire' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('action toasts auto-dismiss at the action default (10 s)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger
          fire={(t) =>
            t.info('Task deleted', undefined, {
              action: { label: 'Undo', handler: () => {} },
            })
          }
        />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();

    // Still visible at 5 s — the non-action default is shorter.
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();

    // Gone at 10 s.
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('non-action toasts auto-dismiss at the legacy default (5 s)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger fire={(t) => t.success('Saved')} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('explicit `timeoutMs` overrides both defaults', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger fire={(t) => t.info('Quick', undefined, { timeoutMs: 1_000 })} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByText('Quick')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByText('Quick')).not.toBeInTheDocument();
  });

  it('two clicks on the action button cannot fire the handler twice', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const handler = vi.fn();
    render(
      <ToastProvider>
        <ToastTrigger
          fire={(t) =>
            t.info('Deleted', undefined, {
              action: { label: 'Undo', handler },
            })
          }
        />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));
    const undoButton = screen.getByRole('button', { name: 'Undo' });
    await user.click(undoButton);
    // Button is gone after the first click; a second click on the same
    // (now-detached) node would still find no Undo in the DOM.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
});

describe('the feed is capped', () => {
  /**
   * A burst of writes must not fill the window with notifications. The
   * feed keeps the newest five and fades the rest out.
   *
   * All seven are raised from **one** click so they share a tick — a
   * burst is exactly the case the cap is for, and firing them one at a
   * time would let each be dismissed by its own timer before the next
   * arrived, which is not a burst at all.
   */
  function fireMany(count: number) {
    return (t: ReturnType<typeof useToast>) => {
      for (let i = 1; i <= count; i += 1) t.info(`Toast ${i}`);
    };
  }

  async function burst(count: number) {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger fire={fireMany(count)} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));
  }

  it('keeps at most five, and keeps the newest five', async () => {
    await burst(7);

    // The two oldest are still mounted while they fade.
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getAllByRole('status')).toHaveLength(5);
    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Toast 2')).not.toBeInTheDocument();
    expect(screen.getByText('Toast 3')).toBeInTheDocument();
    expect(screen.getByText('Toast 7')).toBeInTheDocument();
  });

  it('fades the evicted toast rather than dropping it out from under the eye', async () => {
    await burst(6);

    // Still in the DOM immediately after the burst, at zero opacity and
    // no longer clickable — so a half-gone toast's action cannot be hit.
    const oldest = screen.getByText('Toast 1').closest('[role="status"]');
    expect(oldest).toHaveClass('opacity-0', 'pointer-events-none');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
  });

  it('leaves a feed under the limit completely alone', async () => {
    await burst(5);
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getAllByRole('status')).toHaveLength(5);
    expect(screen.getByText('Toast 1')).toBeInTheDocument();
    // Nothing is fading, so nothing is inert.
    for (const toast of screen.getAllByRole('status')) {
      expect(toast).not.toHaveClass('opacity-0');
    }
  });

  it('still auto-dismisses on the usual timeout once capped', async () => {
    // The cap trims the stack; it must not leave the survivors pinned
    // there, which a leaking `leaving` set would do.
    await burst(7);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
});
