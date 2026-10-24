import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { DropCascadeProvider } from './DropCascadeProvider';
import { useDropCascade } from './useDropCascade';

expect.extend(toHaveNoViolations);

/** Drives `confirmDrop` and records the resolved choice (ADR 0075). */
function Harness({ open }: { open: { title: string }[] }) {
  const { confirmDrop } = useDropCascade();
  const [result, setResult] = useState('pending');
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void confirmDrop('Mezz BLDC', open).then(setResult);
        }}
      >
        trigger
      </button>
      <div data-testid="result">{result}</div>
    </div>
  );
}

const OPEN = [{ title: 'Half-bridge schematic' }, { title: 'Gate driver selection' }];

function renderHarness(open: { title: string }[] = OPEN) {
  return render(
    <DropCascadeProvider>
      <Harness open={open} />
    </DropCascadeProvider>,
  );
}

async function trigger() {
  const user = userEvent.setup();
  renderHarness();
  await user.click(screen.getByRole('button', { name: 'trigger' }));
  await screen.findByRole('dialog');
  return user;
}

describe('DropCascadeProvider', () => {
  it('names the task and lists the open sub-tasks it would drop', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'trigger' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Drop the sub-tasks too?');
    expect(dialog).toHaveTextContent('Mezz BLDC');
    // Listed, not merely counted: the cascade is a bulk write with no grouped
    // undo behind it, so the user should see what they are abandoning.
    expect(dialog).toHaveTextContent('Half-bridge schematic');
    expect(dialog).toHaveTextContent('Gate driver selection');
  });

  it('resolves "cascade" when the user drops the branch', async () => {
    const user = await trigger();
    await user.click(screen.getByRole('button', { name: 'Drop task and 2 sub-tasks' }));
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('cascade'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resolves "only" when the user keeps the sub-tasks', async () => {
    const user = await trigger();
    await user.click(screen.getByRole('button', { name: 'Drop this task only' }));
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('only'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resolves "cancel" on Cancel, so nothing is written', async () => {
    const user = await trigger();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('cancel'));
  });

  it('resolves "cancel" on Escape', async () => {
    const user = await trigger();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('cancel'));
  });

  it('says "sub-task" in the singular when only one is open', async () => {
    const user = userEvent.setup();
    render(
      <DropCascadeProvider>
        <Harness open={[{ title: 'Lone child' }]} />
      </DropCascadeProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('has one sub-task still open');
    screen.getByRole('button', { name: 'Drop task and sub-task' });
  });

  it('caps the preview and says how many more there are', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 11 }, (_, i) => ({ title: `Child ${i + 1}` }));
    render(
      <DropCascadeProvider>
        <Harness open={many} />
      </DropCascadeProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Child 8');
    expect(dialog).not.toHaveTextContent('Child 9');
    expect(dialog).toHaveTextContent('and 3 more');
    // The count in the action is the full count, not the previewed one.
    screen.getByRole('button', { name: 'Drop task and 11 sub-tasks' });
  });

  it('has no axe violations while open', async () => {
    const user = userEvent.setup();
    const { container } = renderHarness();
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    await screen.findByRole('dialog');
    expect(await axe(container)).toHaveNoViolations();
  });
});
