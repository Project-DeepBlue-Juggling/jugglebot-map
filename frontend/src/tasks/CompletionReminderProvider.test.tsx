import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { CompletionReminderProvider } from './CompletionReminderProvider';
import { useCompletionReminder } from './useCompletionReminder';

expect.extend(toHaveNoViolations);

/** Drives `confirmComplete` and records the resolved boolean. */
function Harness({ criteria = 'Ship it.' }: { criteria?: string }) {
  const { confirmComplete } = useCompletionReminder();
  const [result, setResult] = useState('pending');
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void confirmComplete('My Task', criteria).then((ok) => setResult(String(ok)));
        }}
      >
        trigger
      </button>
      <div data-testid="result">{result}</div>
    </div>
  );
}

function renderHarness(criteria = 'Ship it.') {
  return render(
    <CompletionReminderProvider>
      <Harness criteria={criteria} />
    </CompletionReminderProvider>,
  );
}

describe('CompletionReminderProvider', () => {
  it('shows the dialog with the task title and criteria on confirmComplete', async () => {
    const user = userEvent.setup();
    renderHarness('All acceptance tests pass.');
    await user.click(screen.getByRole('button', { name: 'trigger' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Mark task complete?');
    expect(dialog).toHaveTextContent('My Task');
    expect(dialog).toHaveTextContent('All acceptance tests pass.');
  });

  it('resolves true when the user confirms, and closes', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    await user.click(await screen.findByRole('button', { name: 'Mark complete' }));

    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('true'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resolves false when the user cancels, and closes', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('false'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resolves false when the user presses Escape', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('false'));
  });

  it('has no axe violations while open', async () => {
    const user = userEvent.setup();
    const { container } = renderHarness();
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    await screen.findByRole('dialog');
    expect(await axe(container)).toHaveNoViolations();
  });
});
