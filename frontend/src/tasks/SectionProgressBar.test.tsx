import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChildSegment } from './sectionStatus';
import SectionProgressBar from './SectionProgressBar';
import { STATUS_STYLES } from './statusStyles';

afterEach(cleanup);

const seg = (id: string, status: ChildSegment['status']): ChildSegment => ({
  id,
  title: `Task ${id}`,
  status,
});

describe('SectionProgressBar', () => {
  it('renders one segment per child and summarises completion in its label', () => {
    render(
      <SectionProgressBar
        segments={[seg('a', 'complete'), seg('b', 'in_progress'), seg('c', 'not_started')]}
      />,
    );
    const bar = screen.getByRole('img', { name: 'Section progress: 1 of 3 complete' });
    // One coloured segment per child (the segments are the bar's element children).
    expect(bar.children).toHaveLength(3);
  });

  it('groups segments most-done first (complete before the rest)', () => {
    render(<SectionProgressBar segments={[seg('a', 'not_started'), seg('b', 'complete')]} />);
    const bar = screen.getByRole('img', { name: /1 of 2 complete/ });
    const first = bar.children[0] as HTMLElement;
    // Complete is ordered first → the leading segment is green.
    expect(first.style.backgroundColor).not.toBe('');
    expect(first.getAttribute('title')).toMatch(/Complete$/);
  });

  it('colours each segment by its status', () => {
    render(<SectionProgressBar segments={[seg('a', 'blocked')]} />);
    const bar = screen.getByRole('img', { name: /0 of 1 complete/ });
    const segEl = bar.children[0] as HTMLElement;
    // jsdom normalises hex to rgb; compare via a probe element set to the same hex.
    const probe = document.createElement('div');
    probe.style.backgroundColor = STATUS_STYLES.blocked.borderHex;
    expect(segEl.style.backgroundColor).toBe(probe.style.backgroundColor);
  });

  it('renders an empty track with an explanatory label when there are no children', () => {
    render(<SectionProgressBar segments={[]} />);
    const bar = screen.getByRole('img', { name: /empty section/i });
    expect(bar.children).toHaveLength(0);
  });

  // --- ADR 0075: dropped children leave the bar and the denominator -------

  it('drops a dropped child from the denominator and names it in the label', () => {
    render(
      <SectionProgressBar
        segments={[
          seg('a', 'complete'),
          seg('b', 'complete'),
          seg('c', 'in_progress'),
          seg('d', 'dropped'),
        ]}
      />,
    );
    // Four children, one abandoned → "2 of 3", not "2 of 4".
    const bar = screen.getByRole('img', {
      name: 'Section progress: 2 of 3 complete · 1 dropped',
    });
    // And no segment is drawn for it.
    expect(bar.children).toHaveLength(3);
  });

  it('a section whose only outstanding child was dropped reads fully complete', () => {
    render(<SectionProgressBar segments={[seg('a', 'complete'), seg('b', 'dropped')]} />);
    screen.getByRole('img', { name: 'Section progress: 1 of 1 complete · 1 dropped' });
  });

  it('says so plainly when every child was dropped', () => {
    // Not "0 of 0 complete", which reads as a stalled section rather than an
    // abandoned one.
    render(<SectionProgressBar segments={[seg('a', 'dropped'), seg('b', 'dropped')]} />);
    const bar = screen.getByRole('img', { name: 'Section progress: all 2 sub-tasks dropped' });
    expect(bar.children).toHaveLength(0);
  });

  it('still distinguishes "no children" from "all children dropped"', () => {
    render(<SectionProgressBar segments={[]} />);
    screen.getByRole('img', { name: /empty section/i });
  });
});
