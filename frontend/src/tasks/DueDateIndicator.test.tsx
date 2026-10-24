import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DueDateIndicator from './DueDateIndicator';

afterEach(cleanup);

/**
 * ADR 0026 §Indicator UI — the visual affordance.
 *
 * The classifier's logic is covered in dueStatus.test.ts; here we only
 * check that the component renders the OVERDUE pill, the `⚠` icon, or
 * nothing at all for each label — and that the two visible affordances
 * are mutually exclusive (no overlapping renders).
 */
describe('DueDateIndicator', () => {
  it('renders an OVERDUE pill for `overdue`', () => {
    render(<DueDateIndicator status="overdue" title="Jun 1, 2026" />);
    const el = screen.getByText(/overdue/i);
    expect(el).toBeInTheDocument();
    expect(el.tagName).toBe('SPAN');
    // aria-label is the accessible name; carries the tooltip date so screen
    // readers don't have to also announce the title attribute.
    expect(el).toHaveAttribute('aria-label', 'Overdue (Jun 1, 2026)');
  });

  it('renders a "Due soon" pill for `due-soon`', () => {
    render(<DueDateIndicator status="due-soon" title="Jun 15, 2026" />);
    const el = screen.getByText(/due soon/i);
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('aria-label', 'Due soon (Jun 15, 2026)');
  });

  it('returns null for `complete` / `no-date` / `normal`', () => {
    for (const status of ['complete', 'no-date', 'normal'] as const) {
      const { container } = render(<DueDateIndicator status={status} />);
      expect(container).toBeEmptyDOMElement();
      cleanup();
    }
  });

  it('OVERDUE and Due soon pills are mutually exclusive', () => {
    // One render is one status; you can't get both in a single call, but
    // assert it explicitly so a future refactor that turns the union into
    // a flags-bag is caught by this test.
    const { container } = render(<DueDateIndicator status="overdue" />);
    expect(container.textContent).toContain('Overdue');
    expect(container.textContent).not.toContain('Due soon');
  });
});
