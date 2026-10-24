import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PalettePicker } from './PalettePicker';
import { PALETTE } from './palette';

/**
 * polish: the curated palette picker shared between the per-task colour
 * picker (TaskDetailPanel) and the per-user colour picker (profile popover).
 * The picker is the single visual surface for ADR 0016, so the tests live
 * here rather than duplicated at each consumer.
 */

describe('polish: PalettePicker', () => {
  it('renders one swatch per palette entry plus the "no colour" option', () => {
    render(<PalettePicker value={null} onChange={() => {}} ariaLabel="Test" />);
    for (const entry of PALETTE) {
      expect(screen.getByRole('button', { name: entry.name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'No colour' })).toBeInTheDocument();
  });

  it('marks the currently-selected swatch with aria-pressed=true', () => {
    render(<PalettePicker value="#10b981" onChange={() => {}} ariaLabel="Test" />);
    expect(screen.getByRole('button', { name: 'Emerald' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'No colour' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('marks "No colour" pressed when the value is null', () => {
    render(<PalettePicker value={null} onChange={() => {}} ariaLabel="Test" />);
    expect(screen.getByRole('button', { name: 'No colour' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('calls onChange with the hex when a swatch is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PalettePicker value={null} onChange={onChange} ariaLabel="Test" />);
    await user.click(screen.getByRole('button', { name: 'Sky' }));
    expect(onChange).toHaveBeenCalledWith('#0ea5e9');
  });

  it('calls onChange with null when "No colour" is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PalettePicker value="#10b981" onChange={onChange} ariaLabel="Test" />);
    await user.click(screen.getByRole('button', { name: 'No colour' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('disables every swatch when the picker is disabled', () => {
    render(<PalettePicker value={null} onChange={() => {}} disabled ariaLabel="Test" />);
    for (const entry of PALETTE) {
      expect(screen.getByRole('button', { name: entry.name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'No colour' })).toBeDisabled();
  });
});
