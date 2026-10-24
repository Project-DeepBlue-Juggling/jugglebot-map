import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HoverProvider, useItemHover } from '.';

function Item({ id, label, children }: { id: string; label: string; children?: React.ReactNode }) {
  const hover = useItemHover(id);
  return (
    <span {...hover}>
      {label}
      {children}
    </span>
  );
}

const blockers = (id: string) => (id === 'a' ? ['b'] : []);
const el = (id: string) => document.querySelector(`[data-item-id="${id}"]`) as HTMLElement;

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
    fireEvent.pointerEnter(screen.getByText('tile a'));
    expect(screen.getByText('card a')).toHaveClass('is-hovered');
    expect(screen.getByText('blocker b')).toHaveClass('is-blocker-of-hovered');
    expect(screen.getByText('blocker b')).not.toHaveClass('is-hovered');
    expect(screen.getByText('other c').className).toBe('');

    fireEvent.pointerLeave(screen.getByText('tile a'));
    expect(screen.getByText('card a')).not.toHaveClass('is-hovered');
    expect(screen.getByText('blocker b')).not.toHaveClass('is-blocker-of-hovered');
  });

  it('keeps a glow at every step of card -> its dep tag -> back to the card, and clears on leaving', () => {
    render(
      <HoverProvider openBlockerIds={blockers}>
        <span>
          <Item id="a" label="card a">
            <Item id="b" label="tag b" />
          </Item>
        </span>
      </HoverProvider>,
    );
    const card = el('a');
    const tag = el('b');
    const glowing = () => [card, tag].filter((e) => e.classList.contains('is-hovered'));

    fireEvent.pointerEnter(card);
    expect(glowing()).toEqual([card]);
    fireEvent.pointerEnter(tag); // pointer moves onto the tag inside the card
    expect(glowing()).toEqual([tag]); // innermost wins, still a glow
    fireEvent.pointerLeave(tag); // ... and back onto the card
    expect(glowing()).toEqual([card]);
    fireEvent.pointerLeave(card);
    expect(glowing()).toEqual([]);
  });

  it('does not re-render items when the hover changes', () => {
    let renders = 0;
    function Counted() {
      renders += 1;
      return <Item id="a" label="card a" />;
    }
    render(
      <HoverProvider openBlockerIds={blockers}>
        <Counted />
      </HoverProvider>,
    );
    const before = renders;
    fireEvent.pointerEnter(screen.getByText('card a'));
    fireEvent.pointerLeave(screen.getByText('card a'));
    expect(renders).toBe(before);
  });
});
