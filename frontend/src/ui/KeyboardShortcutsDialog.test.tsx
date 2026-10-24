import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { SHORTCUT_ROWS } from './shortcutRows';

describe('KeyboardShortcutsDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<KeyboardShortcutsDialog open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists exactly the bindings that exist, and nothing from the origin app', () => {
    render(<KeyboardShortcutsDialog open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible();
    for (const row of SHORTCUT_ROWS) expect(screen.getByText(row.description)).toBeVisible();
    expect(SHORTCUT_ROWS.map((r) => r.keys.join('+'))).toEqual(['n', 's', 'Enter', 'Esc']);
    expect(screen.queryByText(/undo|canvas|timeline|calendar/i)).toBeNull();
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsDialog open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('caps the panel height and scrolls its body', () => {
    render(<KeyboardShortcutsDialog open={true} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: /keyboard shortcuts/i });
    expect(dialog.firstElementChild).toHaveClass('max-h-[90vh]', 'flex', 'flex-col');
    expect(dialog.querySelector('.overflow-auto')).not.toBeNull();
  });
});
