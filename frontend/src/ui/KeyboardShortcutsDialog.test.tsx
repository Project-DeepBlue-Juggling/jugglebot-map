import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';

/**
 * Tests for the keyboard-shortcuts cheat-sheet (ADR 0019, issue #47).
 *
 * The dialog is pure presentation, so the contract is: closed renders
 * nothing; open shows the five sections; the rows added for issue #47
 * (Ctrl+k search, canvas group-select / pan / zoom gestures) are listed;
 * Esc closes it.
 *
 * The Team Calendar section (ADR 0067 §3a) is tested for the distinction
 * rather than for its presence: Ctrl+Shift+Z existed and was completely
 * undiscoverable, and the trap in documenting it is implying that the
 * project-wide undo gained a redo. It did not, so the assertions below
 * pin the *two* Ctrl+Z rows apart.
 */

/** Return the <dt> of key <kbd>s sitting before a row's description. */
function keysFor(description: string): HTMLElement {
  const dd = screen.getByText(description);
  const dt = dd.previousElementSibling;
  if (!(dt instanceof HTMLElement)) {
    throw new Error(`expected a <dt> of keys before "${description}"`);
  }
  return dt;
}

describe('KeyboardShortcutsDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<KeyboardShortcutsDialog open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('when open, shows the dialog and the five sections', () => {
    render(<KeyboardShortcutsDialog open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Global' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'List view' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Canvas view' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Timeline view' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Team Calendar' })).toBeVisible();
  });

  it("lists the Team Calendar's undo and redo, and its redo only", () => {
    render(<KeyboardShortcutsDialog open={true} onClose={vi.fn()} />);

    const undo = keysFor(
      'Undo your last change to your own entries — this tab only, lost on reload',
    );
    expect(within(undo).getByText('Ctrl')).toBeVisible();
    expect(within(undo).getByText('z')).toBeVisible();

    const redo = keysFor('Redo the change you have just undone');
    expect(within(redo).getByText('Ctrl')).toBeVisible();
    expect(within(redo).getByText('Shift')).toBeVisible();
    expect(within(redo).getByText('z')).toBeVisible();
  });

  it('does not imply the project-wide undo gained a redo', () => {
    // The two mechanisms differ in exactly the two ways a user would be
    // caught out by: the project one is durable and has no redo; the Team
    // Calendar one is per-tab and has one. Both facts are in the copy.
    render(<KeyboardShortcutsDialog open={true} onClose={vi.fn()} />);

    const projectUndo = screen.getByText(
      'Undo the last edit in this project — kept on the server, and no redo',
    );
    expect(projectUndo).toBeVisible();
    // Exactly one Shift+Z row in the whole sheet, and it is the Team
    // Calendar's — the section heading before it is what says so.
    const redoRows = screen.getAllByText(/^Redo/);
    expect(redoRows).toHaveLength(1);
  });

  it('lists Ctrl+k for the global task search', () => {
    render(<KeyboardShortcutsDialog open={true} onClose={vi.fn()} />);
    const keys = keysFor('Focus the global task search');
    expect(within(keys).getByText('Ctrl')).toBeVisible();
    expect(within(keys).getByText('k')).toBeVisible();
  });

  it('lists the canvas group-select, pan, and zoom gestures', () => {
    render(<KeyboardShortcutsDialog open={true} onClose={vi.fn()} />);

    const groupSelect = keysFor('Select a group of tasks (drag a box over empty canvas)');
    expect(within(groupSelect).getByText('Shift')).toBeVisible();
    expect(within(groupSelect).getByText('Drag')).toBeVisible();

    const pan = keysFor('Pan the canvas (drag empty space; or hold Space and drag)');
    expect(within(pan).getByText('Drag')).toBeVisible();

    const zoom = keysFor('Zoom the canvas around the cursor');
    expect(within(zoom).getByText('Scroll')).toBeVisible();
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsDialog open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('caps the panel height and scrolls its body so a short viewport does not clip it (#127)', () => {
    render(<KeyboardShortcutsDialog open={true} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: /keyboard shortcuts/i });
    // The panel is capped to the viewport and lays out as a flex column...
    const panel = dialog.firstElementChild;
    expect(panel).not.toBeNull();
    expect(panel).toHaveClass('max-h-[90vh]', 'flex', 'flex-col');
    // ...with a scrollable body region, so the shortcut list never clips.
    expect(dialog.querySelector('.overflow-auto')).not.toBeNull();
  });
});
