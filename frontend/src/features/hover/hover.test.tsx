import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HoverProvider, useItemHover } from '.';

function Item({ id, label }: { id: string; label: string }) {
  const hover = useItemHover(id);
  return <span {...hover}>{label}</span>;
}

const blockers = (id: string) => (id === 'a' ? ['b'] : []);

describe('hover highlight', () => {
  it('glows every element of the hovered item and outlines its open blocker', () => {
    render(
      <HoverProvider openBlockerIds={blockers}>
        <Item id="a" label="tile a" />
        <Item id="a" label="card a" />
        <Item id="b" label="blocker b" />
        <Item id="c" label="other c" />
      </HoverProvider>,
    );
    fireEvent.mouseOver(screen.getByText('tile a'));
    expect(screen.getByText('card a')).toHaveClass('is-hovered');
    expect(screen.getByText('card a')).toHaveAttribute('data-item-id', 'a');
    expect(screen.getByText('blocker b')).toHaveClass('is-blocker-of-hovered');
    expect(screen.getByText('blocker b')).not.toHaveClass('is-hovered');
    // No dimming: an unrelated element carries no hover class at all.
    expect(screen.getByText('other c').className).toBe('');

    fireEvent.mouseOut(screen.getByText('tile a'));
    expect(screen.getByText('card a')).not.toHaveClass('is-hovered');
    expect(screen.getByText('blocker b')).not.toHaveClass('is-blocker-of-hovered');
  });
});
