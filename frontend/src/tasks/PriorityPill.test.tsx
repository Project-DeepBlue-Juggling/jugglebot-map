import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PriorityPill from './PriorityPill';

afterEach(cleanup);

describe('PriorityPill (ADR 0052)', () => {
  it('renders nothing when priority is null', () => {
    const { container } = render(<PriorityPill priority={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['low', 'medium', 'high'] as const)('renders the %s level label', (priority) => {
    render(<PriorityPill priority={priority} />);
    const label = { low: 'Low', medium: 'Medium', high: 'High' }[priority];
    expect(screen.getByText(label)).toBeInTheDocument();
    // The pill carries a "Priority: <label>" tooltip so the signal is named.
    expect(screen.getByTitle(`Priority: ${label}`)).toBeInTheDocument();
  });
});
