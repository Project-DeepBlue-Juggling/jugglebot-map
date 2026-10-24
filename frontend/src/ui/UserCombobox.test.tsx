import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import UserCombobox, { type ComboboxUser } from './UserCombobox';

// ADR 0058 named jest-axe as the automated-a11y net for the new hand-rolled
// combobox, exactly as ADR 0039 did for the TaskPicker. Register the matcher
// here (the shared setup file doesn't).
expect.extend(toHaveNoViolations);

const USERS: ComboboxUser[] = [
  { id: 'u-alice', display_name: 'Alice', color: '#16a34a' },
  { id: 'u-bob', display_name: 'Bob', color: '#2563eb' },
  { id: 'u-carol', display_name: 'Carol', color: null },
];

afterEach(cleanup);

function combobox() {
  return screen.getByRole('combobox', { name: /reviewer/i });
}

function openCombobox() {
  return userEvent.click(combobox());
}

describe('UserCombobox', () => {
  it('renders a closed combobox labelled by ariaLabel with a placeholder', () => {
    render(<UserCombobox users={USERS} value={null} onChange={() => {}} ariaLabel="Reviewer" />);
    const input = combobox();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('placeholder', '— none —');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows the selected user’s display name while closed', () => {
    render(<UserCombobox users={USERS} value="u-bob" onChange={() => {}} ariaLabel="Reviewer" />);
    expect(combobox()).toHaveValue('Bob');
  });

  it('has no axe violations when closed or open (ADR 0058)', async () => {
    const { container } = render(
      <UserCombobox users={USERS} value="u-alice" onChange={() => {}} ariaLabel="Reviewer" />,
    );
    expect(await axe(container)).toHaveNoViolations();
    await openCombobox();
    await screen.findByRole('listbox', { name: /reviewer/i });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens on click with every user listed', async () => {
    render(<UserCombobox users={USERS} value={null} onChange={() => {}} ariaLabel="Reviewer" />);
    await openCombobox();
    const listbox = await screen.findByRole('listbox', { name: /reviewer/i });
    const labels = within(listbox)
      .getAllByRole('option')
      .map((o) => (o.textContent ?? '').replace(/✓/g, '').trim());
    expect(labels).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('filters by display name, case-insensitive substring', async () => {
    const user = userEvent.setup();
    render(<UserCombobox users={USERS} value={null} onChange={() => {}} ariaLabel="Reviewer" />);
    await openCombobox();
    await user.keyboard('BO');
    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Bob');
  });

  it('shows an empty-state message when nothing matches', async () => {
    const user = userEvent.setup();
    render(<UserCombobox users={USERS} value={null} onChange={() => {}} ariaLabel="Reviewer" />);
    await openCombobox();
    await user.keyboard('zzzz');
    expect(screen.getByText(/no matching members/i)).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('selects an option with the pointer and closes', async () => {
    const onChange = vi.fn();
    render(<UserCombobox users={USERS} value={null} onChange={onChange} ariaLabel="Reviewer" />);
    await openCombobox();
    await userEvent.click(screen.getByRole('option', { name: 'Bob' }));
    expect(onChange).toHaveBeenCalledWith('u-bob');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('navigates with ArrowDown/ArrowUp and selects with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<UserCombobox users={USERS} value={null} onChange={onChange} ariaLabel="Reviewer" />);
    await openCombobox();
    // Active starts on the first option (Alice); one down → Bob.
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('u-bob');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('jumps to the first/last option with Home/End', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<UserCombobox users={USERS} value={null} onChange={onChange} ariaLabel="Reviewer" />);
    await openCombobox();
    await user.keyboard('{End}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('u-carol');
    onChange.mockClear();
    await openCombobox();
    await user.keyboard('{End}{Home}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('u-alice');
  });

  it('tracks the active option via aria-activedescendant', async () => {
    const user = userEvent.setup();
    render(<UserCombobox users={USERS} value={null} onChange={() => {}} ariaLabel="Reviewer" />);
    await openCombobox();
    const first = combobox().getAttribute('aria-activedescendant');
    expect(first).toBeTruthy();
    await user.keyboard('{ArrowDown}');
    expect(combobox().getAttribute('aria-activedescendant')).not.toEqual(first);
  });

  it('closes on Escape without selecting', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<UserCombobox users={USERS} value={null} onChange={onChange} ariaLabel="Reviewer" />);
    await openCombobox();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape with the popup open closes only the popup and never reaches window (ADR 0019)', async () => {
    // Esc must peel the frontmost layer only: hosts like TaskDetailPanel
    // listen for Escape at window level to close the whole panel, so an
    // open popup has to swallow the key or "close the dropdown" also
    // discards the user's unsaved panel edits.
    const user = userEvent.setup();
    render(<UserCombobox users={USERS} value={null} onChange={() => {}} ariaLabel="Reviewer" />);
    await openCombobox();
    const windowSpy = vi.fn();
    window.addEventListener('keydown', windowSpy);
    try {
      await user.keyboard('{Escape}');
      // Popup gone, focus retained in the input, event swallowed.
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(combobox()).toHaveFocus();
      expect(windowSpy).not.toHaveBeenCalled();
      // With the popup closed, a second Escape propagates as normal so the
      // host's own Escape handling (e.g. close the panel) can run.
      await user.keyboard('{Escape}');
      expect(windowSpy).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', windowSpy);
    }
  });

  it('offers a clear affordance only when a value is set, and clears to null', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <UserCombobox users={USERS} value={null} onChange={onChange} ariaLabel="Reviewer" />,
    );
    expect(screen.queryByRole('button', { name: /clear reviewer/i })).not.toBeInTheDocument();

    rerender(
      <UserCombobox users={USERS} value="u-alice" onChange={onChange} ariaLabel="Reviewer" />,
    );
    await userEvent.click(screen.getByRole('button', { name: /clear reviewer/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('marks the current value as the selected option', async () => {
    render(<UserCombobox users={USERS} value="u-bob" onChange={() => {}} ariaLabel="Reviewer" />);
    await openCombobox();
    expect(screen.getByRole('option', { name: /bob/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /alice/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('disables the input when disabled', () => {
    render(
      <UserCombobox users={USERS} value={null} onChange={() => {}} ariaLabel="Reviewer" disabled />,
    );
    expect(combobox()).toBeDisabled();
  });
});
