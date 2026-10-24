import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCommitKey, useSaveOnDismiss, type DismissReason } from './useSaveOnDismiss';

/**
 * Leaving an edit panel saves it (ADR 0080 / #171).
 *
 * Driven through a stand-in panel rather than `PartEditor`, because what
 * is under test is the gesture: which events count as leaving, what
 * happens when the draft is clean, and that a second dismissal cannot
 * start while the first is in flight. The real panels then get one
 * integration test each.
 */

function Panel({
  onSave,
  onClose,
  startDirty = true,
  enabled = true,
  onOutside = () => undefined,
  modal = false,
}: {
  onSave: (reason: DismissReason) => Promise<boolean>;
  onClose: () => void;
  startDirty?: boolean;
  enabled?: boolean;
  /** The outside button's own click handler: what a held click reaches. */
  onOutside?: () => void;
  /** Mark the dialog modal, as BomMoveDialog is. */
  modal?: boolean;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [dirty] = useState(startDirty);
  useSaveOnDismiss({ panelRef, isDirty: dirty, save: onSave, close: onClose, enabled });
  return (
    <div>
      <aside ref={panelRef} aria-label="panel">
        <input aria-label="field" />
      </aside>
      <button type="button" onClick={onOutside}>
        outside
      </button>
      <input aria-label="elsewhere" />
      <div role="dialog" {...(modal ? { 'aria-modal': 'true' } : {})}>
        <button type="button">in a dialog</button>
      </div>
      <div aria-live="polite">
        <button type="button">in a toast</button>
      </div>
    </div>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useSaveOnDismiss', () => {
  it('saves and closes when the pointer goes down outside', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    render(<Panel onSave={save} onClose={close} />);

    await userEvent.click(screen.getByRole('button', { name: 'outside' }));

    await waitFor(() => expect(save).toHaveBeenCalledWith('click-out'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes without saving when nothing was edited', async () => {
    // **Not a micro-optimisation.** Writing because somebody opened a
    // row and clicked away would put their name on `updated_by` for a
    // change they did not make -- and `updated_by` is the entire change
    // record the catalogue has (ADR 0077 sect 12).
    const save = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    render(<Panel onSave={save} onClose={close} startDirty={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'outside' }));

    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });

  it('saves and closes on Ctrl+Enter from inside a field', async () => {
    // Deliberately not focus-gated: firing from inside a field is the
    // whole gesture (ADR 0047).
    const save = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    render(<Panel onSave={save} onClose={close} />);

    await userEvent.click(screen.getByLabelText('field'));
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(save).toHaveBeenCalledWith('shortcut'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('ignores a click inside the panel', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    render(<Panel onSave={save} onClose={close} />);

    await userEvent.click(screen.getByLabelText('field'));

    expect(save).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('does not treat a toast or a dialog as leaving', async () => {
    // The toast is how the save reports itself, so dismissing one must
    // not read as "the user has finished here".
    const save = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    render(<Panel onSave={save} onClose={close} />);

    await userEvent.click(screen.getByRole('button', { name: 'in a toast' }));
    await userEvent.click(screen.getByRole('button', { name: 'in a dialog' }));

    expect(save).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('does not fire a second dismissal while the first is in flight', async () => {
    // A rapid double click-out, or Ctrl+Enter during a click-out's save.
    // Without the guard the panel writes twice and closes twice.
    // Typed through a mutable holder: assigning inside the executor
    // narrows a plain `let` to `never` at the call site below.
    const gate: { release: (() => void) | null } = { release: null };
    const save = vi.fn().mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          gate.release = () => resolve(true);
        }),
    );
    const close = vi.fn();
    render(<Panel onSave={save} onClose={close} />);

    const outside = screen.getByRole('button', { name: 'outside' });
    await userEvent.click(outside);
    await userEvent.click(outside);

    expect(save).toHaveBeenCalledTimes(1);
    gate.release?.();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it('does nothing at all when disabled', async () => {
    // A viewer cannot write, so leaving must never try to.
    const save = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    render(<Panel onSave={save} onClose={close} enabled={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'outside' }));
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(save).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});

describe('useSaveOnDismiss, when an edit could be lost (#207)', () => {
  it('keeps the panel open when the save is refused (F13)', async () => {
    // A 422 on click-out used to close the panel anyway, and every edit
    // in it went with the toast.
    const save = vi.fn().mockResolvedValue(false);
    const close = vi.fn();
    render(<Panel onSave={save} onClose={close} />);

    await userEvent.click(screen.getByRole('button', { name: 'outside' }));
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(close).not.toHaveBeenCalled();
  });

  it('holds the click that left a dirty panel and delivers it after the save (F16)', async () => {
    // Clicking another BOM row used to open it during the save, and the
    // close that followed shut it again. The click now waits for the
    // save, then lands -- once, and after the close.
    const order: string[] = [];
    const gate: { release: (() => void) | null } = { release: null };
    const save = vi.fn().mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          gate.release = () => resolve(true);
        }),
    );
    render(
      <Panel
        onSave={save}
        onClose={() => order.push('close')}
        onOutside={() => order.push('outside clicked')}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'outside' }));
    // Load-bearing: the click has fully happened and been held.
    expect(order).toEqual([]);

    gate.release?.();
    await waitFor(() => expect(order).toEqual(['close', 'outside clicked']));
  });

  it('swallows the held click when the save is refused', async () => {
    // The page must not move out from under the panel that failed.
    const outside = vi.fn();
    const close = vi.fn();
    render(<Panel onSave={vi.fn().mockResolvedValue(false)} onClose={close} onOutside={outside} />);

    await userEvent.click(screen.getByRole('button', { name: 'outside' }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(outside).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('treats Enter on a control outside a dirty panel as leaving it (F34)', async () => {
    // A keyboard click has no mousedown, so it used to switch rows
    // without saving the one being edited.
    const order: string[] = [];
    const save = vi.fn().mockImplementation(async () => {
      order.push('save');
      return true;
    });
    render(
      <Panel
        onSave={save}
        onClose={() => order.push('close')}
        onOutside={() => order.push('outside clicked')}
      />,
    );

    screen.getByRole('button', { name: 'outside' }).focus();
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(order).toEqual(['save', 'close', 'outside clicked']));
  });

  it('saves and closes on Escape from inside the panel (F34)', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    render(<Panel onSave={save} onClose={close} />);

    await userEvent.click(screen.getByLabelText('field'));
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith('escape');
  });

  it('leaves Escape alone in a field elsewhere on the page', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    render(<Panel onSave={save} onClose={close} startDirty={false} />);

    screen.getByLabelText('elsewhere').focus();
    await userEvent.keyboard('{Escape}');

    expect(close).not.toHaveBeenCalled();
  });

  it('does nothing on Ctrl+Enter or Escape while a modal dialog is in front', async () => {
    // Ctrl+Enter in the Move dialog must not also save and close the
    // line behind it.
    const save = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    render(<Panel onSave={save} onClose={close} modal />);

    screen.getByRole('button', { name: 'in a dialog' }).focus();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await userEvent.keyboard('{Escape}');

    expect(save).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});

describe('isCommitKey', () => {
  const base = { key: 'Enter', altKey: false, shiftKey: false };

  it('accepts plain Enter and Ctrl/Cmd+Enter alike', () => {
    // A one-line creation field has always committed on plain `Enter`;
    // the modifier is accepted too so the gesture is the same as on the
    // panels, where plain `Enter` cannot mean commit.
    expect(isCommitKey(base)).toBe(true);
    expect(isCommitKey({ ...base, ctrlKey: true } as never)).toBe(true);
    expect(isCommitKey({ ...base, metaKey: true } as never)).toBe(true);
  });

  it('rejects Shift+Enter, which means newline wherever it means anything', () => {
    expect(isCommitKey({ ...base, shiftKey: true })).toBe(false);
    expect(isCommitKey({ ...base, altKey: true })).toBe(false);
  });

  it('rejects any other key', () => {
    expect(isCommitKey({ ...base, key: 'a' })).toBe(false);
    expect(isCommitKey({ ...base, key: 'Escape' })).toBe(false);
  });
});
